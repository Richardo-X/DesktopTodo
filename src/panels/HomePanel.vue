<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import TodoRow from '../components/TodoRow.vue'
import BatchBar from '../components/BatchBar.vue'
import { createDragSort } from '../components/useDragSort'
import { BASE_PANEL, clusterBaseWidth } from '../core/utils/cluster-layout'
import { clampClusterScale } from '../core/utils/scale'
import { fmtTime, fmtDateCN } from '../core/utils/date'
import { getApi } from '../services/api'

const store = useAppStore()
const ui = useUiStore()

const listEl = ref<HTMLElement | null>(null)

// 长按手柄拖动排序（相邻增量交换，决策#13；批量模式下禁用）
const drag = createDragSort({
  enabled: () => !ui.batchMode,
  rowCount: () => store.todos.length,
  rowRect: (i) => {
    const el = listEl.value?.children[i] as HTMLElement | undefined
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom }
  },
  onSwap: (from, to) => {
    void swapWithFlip(from, to)
  }
})

function isDragging(i: number): boolean {
  return drag.state.draggingIndex === i
}

/** 相邻换位提交 + FLIP 回弹动画（原型 flipRows：130ms ease） */
async function swapWithFlip(from: number, to: number): Promise<void> {
  const el = listEl.value
  const before = measureTops(el)
  await store.reorderTodos(from, to)
  await nextTick()
  applyFlip(el, before)
}

function measureTops(el: HTMLElement | null): Map<Element, number> {
  const m = new Map<Element, number>()
  if (!el) return m
  for (const child of Array.from(el.children)) {
    m.set(child, child.getBoundingClientRect().top)
  }
  return m
}

function applyFlip(el: HTMLElement | null, before: Map<Element, number>): void {
  if (!el) return
  for (const child of Array.from(el.children)) {
    const prev = before.get(child)
    if (prev === undefined) continue
    const dy = prev - child.getBoundingClientRect().top
    if (Math.abs(dy) < 2) continue
    const h = child as HTMLElement
    h.style.transition = 'none'
    h.style.transform = `translateY(${dy}px)`
    requestAnimationFrame(() => {
      h.style.transition = 'transform 130ms ease'
      h.style.transform = ''
    })
  }
}

// —— 等比缩放柄（右下弧线角，决策#16；缩放期间保持弹出） ——
let scaleStart: { x: number; scale: number; baseWidth: number } | null = null

function rendererWorkArea(): { x: number; y: number; width: number; height: number } {
  const s = window.screen as unknown as {
    availLeft?: number
    availTop?: number
    availWidth?: number
    availHeight?: number
  }
  return {
    x: s.availLeft ?? 0,
    y: s.availTop ?? 0,
    width: s.availWidth ?? 1920,
    height: s.availHeight ?? 1080
  }
}

function onGripDown(e: PointerEvent): void {
  ui.dispatchTuck({ type: 'resize-start' })
  const scale = store.uiState.clusterScale
  scaleStart = { x: e.clientX, scale, baseWidth: clusterBaseWidth(store.uiState) * scale }
  window.addEventListener('pointermove', onGripMove)
  window.addEventListener('pointerup', onGripUp)
}

function onGripMove(e: PointerEvent): void {
  if (scaleStart === null) return
  // 比例跟随（原型 applyPanelScale）：s0 × (w0+dx)/w0，再按工作区钳制（决策#23）
  const dx = e.clientX - scaleStart.x
  const next = scaleStart.scale * ((scaleStart.baseWidth + dx) / scaleStart.baseWidth)
  const clamped = clampClusterScale(
    next,
    { width: clusterBaseWidth(store.uiState), height: BASE_PANEL.height },
    rendererWorkArea()
  )
  void store.updateUiState({ clusterScale: clamped })
}

function onGripUp(): void {
  scaleStart = null
  window.removeEventListener('pointermove', onGripMove)
  window.removeEventListener('pointerup', onGripUp)
  ui.dispatchTuck({ type: 'resize-end' })
}

// 顶部时钟：每秒刷新，显示精确到分钟（决策#2，PRD §3）
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
  window.addEventListener('pointermove', drag.handleMove)
  window.addEventListener('pointerup', drag.handleUp)
})
onUnmounted(() => {
  if (timer !== undefined) clearInterval(timer)
  window.removeEventListener('pointermove', drag.handleMove)
  window.removeEventListener('pointerup', drag.handleUp)
})

const timeText = computed(() => fmtTime(now.value, store.settings.hour12))
const dateText = computed(() => fmtDateCN(now.value))
const countText = computed(() => `${store.todos.length}/${store.settings.maxItems}`)

function toggleTheme(): void {
  void store.updateUiState({ theme: store.uiState.theme === 'day' ? 'night' : 'day' })
}

function toggleTuckLock(): void {
  void store.updateUiState({ tuckLock: !store.uiState.tuckLock })
}

function toggleTopMost(): void {
  void store.updateUiState({ topMost: !store.uiState.topMost })
}

function toggleQuick(): void {
  void store.updateUiState({ quickVisible: !store.uiState.quickVisible })
}

function toggleDone(): void {
  void store.updateUiState({ doneVisible: !store.uiState.doneVisible })
}

// 勾选完成：先播放离场动画（250ms）再移入已完成（PRD §5.2 动画反馈）
const leavingId = ref<string | null>(null)

async function onComplete(id: string): Promise<void> {
  if (ui.batchMode) return
  leavingId.value = id
  setTimeout(() => {
    void store.completeTodo(id).then(() => {
      if (leavingId.value === id) leavingId.value = null
    })
  }, 250)
}
</script>

<template>
  <section class="panel home-panel" data-testid="home-panel">
    <!-- 决策#8：标题栏拖动窗口；按钮区 no-drag -->
    <header class="titlebar">
      <div class="win-actions">
        <button data-testid="tb-theme" class="wbtn" title="日/夜主题切换" @click="toggleTheme">
          {{ store.uiState.theme === 'day' ? '☾' : '☀' }}
        </button>
        <button data-testid="tb-settings" class="wbtn" title="设置" @click="ui.openChild('settings')">⚙</button>
        <button
          data-testid="tb-tucklock"
          class="wbtn"
          :class="{ on: store.uiState.tuckLock }"
          title="缩进锁定"
          @click="toggleTuckLock"
        >
          ⇤
        </button>
        <button
          data-testid="tb-topmost"
          class="wbtn"
          :class="{ on: store.uiState.topMost }"
          title="窗口置顶"
          @click="toggleTopMost"
        >
          ↑
        </button>
      </div>
      <div class="win-actions right">
        <button data-testid="tb-minimize" class="wbtn" title="缩小到通知栏" @click="getApi().minimizeToTray()">×</button>
      </div>
    </header>

    <div class="win-body">
      <div class="clock">
        <div class="clock-time" data-testid="clock-time">{{ timeText }}</div>
        <div class="clock-date" data-testid="clock-date">{{ dateText }}</div>
      </div>

      <div class="actions">
        <button
          class="icon-btn a-bolt"
          data-testid="op-quick-toggle"
          :class="{ on: store.uiState.quickVisible }"
          title="快捷添加"
          @click="toggleQuick"
        >
          ⚡
        </button>
        <button
          class="icon-btn a-done"
          data-testid="op-done-toggle"
          :class="{ on: store.uiState.doneVisible }"
          title="已完成"
          @click="toggleDone"
        >
          ☑
        </button>
        <span class="cap-chip a-chip" data-testid="op-count">{{ countText }}</span>
        <button class="btn sm a-batch" data-testid="op-batch" @click="ui.enterBatch('todos')">批量删除</button>
        <button class="icon-btn accent a-add" data-testid="op-new" title="新建待办" @click="ui.openChild('todo-new')">＋</button>
      </div>

      <div v-if="store.todos.length > 0" ref="listEl" class="scroll">
        <TodoRow
          v-for="(t, i) in store.todos"
          :key="t.id"
          :item="t"
          :batch-mode="ui.batchMode"
          :selected="ui.selectedIds.includes(t.id)"
          :leaving="leavingId === t.id"
          :dragging="isDragging(i)"
          @toggle="onComplete(t.id)"
          @edit="ui.openChild('todo-edit', t.id)"
          @select-toggle="ui.toggleSelect(t.id)"
          @handle-down="drag.handleDown(i, $event)"
        />
      </div>
      <div v-else class="empty" data-testid="empty-state">
        <p class="empty-main">今日做点什么好呢</p>
        <p class="empty-sub">点击右上角 ＋ 新建一条待办</p>
      </div>

      <BatchBar v-if="ui.batchTarget === 'todos'" target="todos" />
    </div>

    <span class="resize-grip" title="拖动缩放" @pointerdown.stop.prevent="onGripDown" />
  </section>
</template>

<style scoped>
.home-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ===== 标题栏（36px，整条拖动；决策#8） ===== */
.titlebar {
  height: 36px;
  flex: none;
  display: flex;
  align-items: center;
  padding-left: 8px;
  user-select: none;
  -webkit-app-region: drag;
}

.win-actions {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.win-actions.right {
  margin-left: auto;
}

.wbtn {
  width: 38px;
  height: 100%;
  border: none;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  font-size: 13px;
}

.wbtn:hover {
  background: var(--hover);
}

.wbtn.on {
  color: var(--accent);
}

.win-actions.right .wbtn:hover {
  background: var(--danger);
  color: #fff;
}

/* ===== 主体 ===== */
.win-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 2px 14px 24px; /* 底部 24px：避让右下缩放角（原型 win-body） */
}

.clock {
  text-align: center;
  padding: 0 0 10px;
  flex: none;
}

.clock-time {
  font-size: 30px;
  font-weight: 600;
  letter-spacing: 1px;
}

.clock-date {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}

/* ===== actions 两行网格（原型 .actions） ===== */
.actions {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 6px 8px;
  padding-bottom: 10px;
  flex: none;
}

.icon-btn {
  height: 30px;
  min-width: 32px;
  padding: 0 10px;
  border: 1px solid var(--btn-border);
  border-radius: 6px;
  background: var(--btn);
  color: inherit;
  font-size: 12.5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.icon-btn:hover {
  background: var(--btn-hover);
}

.icon-btn.on {
  color: var(--accent);
  border-color: var(--accent);
}

.icon-btn.accent {
  background: var(--accent);
  border-color: transparent;
  color: var(--accent-fg);
  font-weight: 700;
}

.icon-btn.accent:hover {
  background: var(--accent-hover);
}

.a-bolt {
  grid-area: 1 / 1 / 2 / 2;
  justify-self: start;
}

.a-done {
  grid-area: 1 / 3 / 2 / 4;
}

.cap-chip {
  grid-area: 2 / 1 / 3 / 2;
  align-self: center;
}

.a-batch {
  grid-area: 2 / 2 / 3 / 3;
}

.a-add {
  grid-area: 2 / 3 / 3 / 4;
}

.cap-chip {
  font-size: 11px;
  color: var(--muted);
  background: var(--hover);
  border-radius: 99px;
  padding: 3px 10px;
  justify-self: start;
}

.btn.sm {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--btn-border);
  border-radius: 6px;
  background: var(--btn);
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.btn.sm:hover {
  background: var(--btn-hover);
}

/* ===== 列表 ===== */
.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.empty-main {
  margin: 0;
  font-size: 16px;
  color: var(--muted);
  letter-spacing: 2px;
}

.empty-sub {
  margin: 0;
  font-size: 11.5px;
  color: var(--faint);
}

/* ===== 缩放角（决策#16：与窗口圆角同弧度的弧线） ===== */
.resize-grip {
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  z-index: 60;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.resize-grip::before {
  content: '';
  position: absolute;
  inset: 0;
  border-right: 2px solid var(--muted);
  border-bottom: 2px solid var(--muted);
  border-bottom-right-radius: 10px;
}

.resize-grip:hover {
  opacity: 1;
}
</style>

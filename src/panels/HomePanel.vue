<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import TodoRow from '../components/TodoRow.vue'
import BatchBar from '../components/BatchBar.vue'
import { createDragSort } from '../components/useDragSort'
import { BASE_PANEL, visibleClusterWidth } from '../core/utils/cluster-layout'
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
  // 四轮定稿 B：拖拽比例基于可见簇宽（隐藏面板不占位，与主进程钳制口径一致）
  scaleStart = {
    x: e.clientX,
    scale,
    baseWidth: visibleClusterWidth(store.uiState.quickVisible, store.uiState.doneVisible) * scale
  }
  window.addEventListener('pointermove', onGripMove)
  window.addEventListener('pointerup', onGripUp)
}

function onGripMove(e: PointerEvent): void {
  if (scaleStart === null) return
  // 比例跟随（原型 applyPanelScale）：s0 × (w0+dx)/w0，再按工作区钳制（决策#23；基准=可见簇宽）
  const dx = e.clientX - scaleStart.x
  const next = scaleStart.scale * ((scaleStart.baseWidth + dx) / scaleStart.baseWidth)
  const clamped = clampClusterScale(
    next,
    { width: visibleClusterWidth(store.uiState.quickVisible, store.uiState.doneVisible), height: BASE_PANEL.height },
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
    <!-- 三轮8.2-6：照原型重做——左侧品牌区（勾图标+桌面待办），右侧一组5按钮（SVG 线性图标）；
         决策#8：标题栏拖动窗口；8.2-7：批量进行中冻结 -->
    <header class="titlebar">
      <div class="tb-left">
        <span class="tb-brand" data-testid="tb-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span class="tb-title" data-testid="tb-title">桌面待办</span>
      </div>
      <div class="win-actions">
        <button data-testid="tb-theme" class="wbtn" :class="{ frozen: ui.batchMode }" :title="store.uiState.theme === 'day' ? '切换到夜晚模式' : '切换到白天模式'" @click="toggleTheme">
          <!-- 原型同款：白天显月亮（点击切夜），夜晚显太阳 -->
          <svg v-if="store.uiState.theme === 'day'" data-icon="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <svg v-else data-icon="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        </button>
        <button data-testid="tb-settings" class="wbtn" :class="{ frozen: ui.batchMode }" title="设置" @click="ui.openChild('settings')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          data-testid="tb-tucklock"
          class="wbtn"
          :class="{ on: store.uiState.tuckLock, frozen: ui.batchMode }"
          :title="store.uiState.tuckLock ? '缩进锁定已开启：吸附边缘但不缩进' : '缩进锁定已关闭：吸附边缘后自动缩进'"
          @click="toggleTuckLock"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 4h18" />
            <rect x="7" y="11.5" width="10" height="8" rx="1.6" />
            <path d="M9.6 11.5V9a2.4 2.4 0 0 1 4.8 0v2.5" />
          </svg>
        </button>
        <button
          data-testid="tb-topmost"
          class="wbtn"
          :class="{ on: store.uiState.topMost, frozen: ui.batchMode }"
          title="窗口置顶开关"
          @click="toggleTopMost"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 17v5" />
            <path d="M9 3h6l1 7 3 3H5l3-3 1-7z" />
          </svg>
        </button>
        <button data-testid="tb-minimize" class="wbtn close" :class="{ frozen: ui.batchMode }" title="缩小到通知栏" @click="getApi().minimizeToTray()">
          <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
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
          :class="{ on: store.uiState.quickVisible, frozen: ui.batchMode }"
          title="快捷添加"
          @click="toggleQuick"
        >
          ⚡
        </button>
        <button
          class="icon-btn a-done"
          data-testid="op-done-toggle"
          :class="{ on: store.uiState.doneVisible, frozen: ui.batchMode }"
          title="已完成"
          @click="toggleDone"
        >
          ☑
        </button>
        <span class="cap-chip a-chip" data-testid="op-count">{{ countText }}</span>
        <button class="btn sm a-batch" data-testid="op-batch" :class="{ frozen: ui.batchMode }" @click="ui.enterBatch('todos')">批量删除</button>
        <button class="icon-btn accent a-add" data-testid="op-new" :class="{ frozen: ui.batchMode }" title="新建待办" @click="ui.openChild('todo-new')">＋</button>
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

/* ===== 标题栏（36px，整条拖动；三轮8.2-6 照原型：左侧品牌区+右侧单组5按钮） ===== */
.titlebar {
  height: 36px;
  flex: none;
  display: flex;
  align-items: center;
  padding-left: 12px;
  user-select: none;
  -webkit-app-region: drag;
}

/* 品牌区：主题色圆角方块勾图标 + 应用名（原型 .tb-left/.tb-icon） */
.tb-left {
  display: flex;
  gap: 7px;
  align-items: center;
  font-size: 12.5px;
  color: var(--muted, #666);
  pointer-events: none;
}

.tb-brand {
  width: 17px;
  height: 17px;
  border-radius: 5px;
  background: var(--accent, #0a63b8);
  color: var(--accent-fg, #ffffff);
  display: flex;
  align-items: center;
  justify-content: center;
}

.tb-brand svg {
  width: 10px;
  height: 10px;
}

.win-actions {
  margin-left: auto;
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.wbtn {
  width: 42px;
  height: 100%;
  border: none;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}

.wbtn svg {
  width: 13px;
  height: 13px;
}

.wbtn:hover {
  background: var(--hover);
}

.wbtn.on {
  color: var(--accent);
}

/* 原型 .wbtn.close:hover：红底白字 */
.wbtn.close:hover {
  background: var(--danger);
  color: #fff;
}

/* ===== 主体 ===== */
.win-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 14px 24px; /* 底部 24px：避让右下缩放角（原型 win-body）；顶部压缩给列表空间 */
}

.clock {
  text-align: center;
  padding: 0 0 6px;
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

/* ===== actions 两行网格（原型 .actions）；上移压缩给列表空间，保证 10 项满载无滚动 ===== */
.actions {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 6px 8px;
  padding-bottom: 4px;
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

/* ===== 列表（行距/间隙压缩：保证 10 项满载无滚动条，二轮反馈）；
 * 右侧 14px 专用带：滚动条不接触行 ===== */
.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
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

/* ===== 缩放角（决策#16 + 二轮反馈：与窗口圆角同弧度的弧线，内缩 2px 不贴边） ===== */
.resize-grip {
  position: absolute;
  right: 2px;
  bottom: 2px;
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
  border-bottom-right-radius: 8px; /* 与窗口 10px 圆角同心 */
}

.resize-grip:hover {
  opacity: 1;
}
</style>

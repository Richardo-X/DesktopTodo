<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import BatchBar from '../components/BatchBar.vue'
import { createDragSort } from '../components/useDragSort'
import { bubbleContentEnter, bubbleContentLeave } from '../components/content-bubble'
import { TEMPLATE_LIMIT } from '../core/services/templates'

const store = useAppStore()
const ui = useUiStore()

const title = computed(() => `模板 · ${store.templates.length}/${TEMPLATE_LIMIT}`)

const listEl = ref<HTMLElement | null>(null)

// 长按手柄拖动排序（相邻增量交换，决策#13；批量模式下禁用）
const drag = createDragSort({
  enabled: () => !ui.batchMode,
  rowCount: () => store.templates.length,
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

async function swapWithFlip(from: number, to: number): Promise<void> {
  const el = listEl.value
  const before = measureTops(el)
  await store.reorderTemplates(from, to)
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

const error = ref('')

// 8.2-4：模板行悬停气泡（PRD §五截断气泡，全局单例）
function onContentEnter(e: MouseEvent): void {
  const content = e.currentTarget as HTMLElement
  const row = content.closest('.tpl-row') as HTMLElement | null
  if (row) bubbleContentEnter(content, row)
}

async function quickAdd(id: string): Promise<void> {
  const r = await store.quickAdd(id)
  error.value = r.ok ? '' : r.reason === 'limit-reached' ? '待办数量已达上限' : '添加失败'
}

function enterBatch(): void {
  ui.enterBatch('templates')
}

onMounted(() => {
  window.addEventListener('pointermove', drag.handleMove)
  window.addEventListener('pointerup', drag.handleUp)
})

onUnmounted(() => {
  window.removeEventListener('pointermove', drag.handleMove)
  window.removeEventListener('pointerup', drag.handleUp)
})
</script>

<template>
  <section class="panel side-panel" data-testid="quick-panel" :class="{ frozen: ui.batchMode && ui.batchTarget !== 'templates' }">
    <!-- 决策#8：标题栏拖动（2026-10-08 裁定：侧窗无 × 隐藏按钮，显隐唯一途径=待办窗 ⚡/☑ 与托盘） -->
    <header class="titlebar">
      <span class="tb-title">快捷添加</span>
      <div class="win-actions right">
      </div>
    </header>

    <div class="win-body">
      <div class="panel-head">
        <span class="panel-title" data-testid="quick-title">{{ title }}</span>
        <!-- 四轮3：自身批量进行中头部两按钮冻结（批量条「取消」可退出） -->
        <button class="btn sm" data-testid="quick-batch" :class="{ frozen: ui.batchMode }" @click="enterBatch">批量删除</button>
        <button class="icon-btn accent" data-testid="quick-new" :class="{ frozen: ui.batchMode }" title="新建模板" @click="ui.openChild('template-new')">＋</button>
      </div>

      <p v-if="error" class="error" data-testid="quick-error">{{ error }}</p>

      <div v-if="store.templates.length > 0" ref="listEl" class="scroll">
        <div
          v-for="(t, i) in store.templates"
          :key="t.id"
          class="tpl-row"
          data-testid="tpl-row"
          :class="{ selrow: ui.batchMode && ui.selectedIds.includes(t.id), dragging: drag.state.draggingIndex === i }"
          @click="ui.batchMode && ui.toggleSelect(t.id)"
          @dblclick="!ui.batchMode && ui.openChild('template-edit', t.id)"
        >
          <span
            class="grip"
            data-testid="tpl-handle"
            :class="{ disabled: ui.batchMode }"
            title="长按拖动排序"
            @pointerdown.stop="drag.handleDown(i, $event)"
            @dblclick.stop
          />
          <span class="content ellipsis" data-testid="tpl-content" @mouseenter="onContentEnter" @mouseleave="bubbleContentLeave">
            <span class="tt-in">{{ t.content }}</span>
          </span>
          <!-- 决策#25：批量时右端「＋」换为同款勾选框选中示意 -->
          <span v-if="!ui.batchMode" class="plusbox" data-testid="tpl-add" title="添加到待办列表" @click.stop="quickAdd(t.id)" @dblclick.stop>＋</span>
          <button v-else type="button" class="checkbox" :class="{ checked: ui.selectedIds.includes(t.id) }" @click.stop="ui.toggleSelect(t.id)" @dblclick.stop>
            <svg viewBox="0 0 16 16"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
          </button>
        </div>
      </div>
      <div v-else class="panel-empty">还没有模板，点右上角 ＋ 新建</div>

      <p class="meta-line" data-testid="quick-note">
        模板不计入待办数量上限；点击条目右侧 ＋ 可加入今日待办，模板不会消失
      </p>

      <BatchBar v-if="ui.batchTarget === 'templates'" target="templates" />
    </div>
  </section>
</template>

<style scoped>
.side-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ===== 标题栏（36px 拖动 + × 关闭面板） ===== */
.titlebar {
  height: 36px;
  flex: none;
  display: flex;
  align-items: center;
  padding-left: 12px;
  user-select: none;
}

.tb-title {
  font-size: 12.5px;
  color: var(--muted);
  pointer-events: none;
}

.win-actions {
  margin-left: auto;
  display: flex;
  height: 100%;
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
  font-size: 13px;
}

.wbtn:hover {
  background: var(--danger);
  color: #fff;
}

.win-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 2px 14px 24px;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px 8px;
  flex: none;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  margin-right: auto;
}

.btn.sm {
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--btn-border);
  border-radius: 6px;
  background: var(--btn);
  color: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.btn.sm:hover {
  background: var(--btn-hover);
}

.icon-btn.accent {
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-btn.accent:hover {
  background: var(--accent-hover);
}

.error {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--danger);
}

.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px;
}

.tpl-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 8px;
  background: var(--card);
  border: 1px solid var(--card-border);
  user-select: none;
  cursor: default;
  /* L1（v3.4）：行 hover/拖动过渡同主窗待办行 */
  transition:
    transform 0.15s var(--ease-out),
    box-shadow 0.15s var(--ease-out),
    background-color 0.15s var(--ease-out);
}

.tpl-row:hover {
  border-color: var(--accent);
  background: var(--hover);
}

.tpl-row.selrow {
  border-color: var(--accent);
  background: var(--hover);
}

.tpl-row.dragging {
  opacity: 0.5;
  background: var(--active);
  border-color: var(--accent);
  box-shadow: 0 4px 14px rgba(10, 20, 40, 0.22); /* L1：投影色调化（纯黑→蓝黑） */
  z-index: 5;
}

.grip {
  width: 14px;
  height: 20px;
  flex: none;
  border-radius: 4px;
  background: radial-gradient(circle, var(--faint) 1px, transparent 1.4px);
  background-size: 6px 6px;
  cursor: grab;
  touch-action: none;
}

.grip:hover {
  background-image: radial-gradient(circle, var(--accent) 1px, transparent 1.4px);
}

.grip.disabled {
  cursor: default;
  opacity: 0.4;
  pointer-events: none;
}

.content {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  line-height: 1.5;
  text-align: left;
}

.ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.plusbox {
  flex: none;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--cb-border);
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  background: transparent;
}

.plusbox:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--hover);
}

.checkbox {
  flex: none;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1.5px solid var(--cb-border);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: transparent;
}

.checkbox:hover {
  border-color: var(--accent);
}

.checkbox.checked {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}

.checkbox svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.panel-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--faint);
  font-size: 12px;
  text-align: center;
}

.meta-line {
  margin: 8px 0 0;
  flex: none;
  font-size: 11.5px;
  color: var(--muted);
  background: var(--hover);
  border-radius: 6px;
  padding: 7px 10px;
  line-height: 1.5;
}
</style>

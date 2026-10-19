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

// 模板→已满待办：快捷窗内顶部浮现提示（1.8s 自动消失；每次点击重置）
const hintVisible = ref(false)
let hintTimer: ReturnType<typeof setTimeout> | null = null
function showFullHint(): void {
  hintVisible.value = true
  if (hintTimer !== null) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => {
    hintVisible.value = false
    hintTimer = null
  }, 1800)
}
function hideFullHint(): void {
  if (hintTimer !== null) {
    clearTimeout(hintTimer)
    hintTimer = null
  }
  hintVisible.value = false
}

// 8.2-4：模板行悬停气泡（PRD §五截断气泡，全局单例）
function onContentEnter(e: MouseEvent): void {
  const content = e.currentTarget as HTMLElement
  const row = content.closest('.tpl-row') as HTMLElement | null
  if (row) bubbleContentEnter(content, row)
}

async function quickAdd(id: string): Promise<void> {
  const r = await store.quickAdd(id)
  if (r.ok) {
    error.value = ''
    hideFullHint()
    return
  }
  if (r.reason === 'limit-reached') {
    error.value = ''
    showFullHint()
    return
  }
  error.value = '添加失败'
}

function enterBatch(): void {
  hideFullHint()
  ui.enterBatch('templates')
}

onMounted(() => {
  window.addEventListener('pointermove', drag.handleMove)
  window.addEventListener('pointerup', drag.handleUp)
})

onUnmounted(() => {
  window.removeEventListener('pointermove', drag.handleMove)
  window.removeEventListener('pointerup', drag.handleUp)
  if (hintTimer !== null) clearTimeout(hintTimer)
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
      <div class="quick-hint-lane" aria-hidden="true"></div>
      <div
        class="quick-hint-wrap"
        :class="{ show: hintVisible }"
        data-testid="quick-hint"
        :aria-hidden="!hintVisible"
      >
        <span class="quick-hint">先完成手头上的事吧</span>
      </div>

      <div class="panel-head">
        <span class="panel-title" data-testid="quick-title">{{ title }}</span>
        <!-- 四轮3：自身批量进行中头部两按钮冻结（批量条「取消」可退出） -->
        <!-- 批量中「返回」=「批量删除」左邻同排（用户 2026-10-15：水平对齐、8px 间隔） -->
        <button
          v-if="ui.batchMode && ui.batchTarget === 'templates'"
          class="btn sm"
          data-testid="batch-cancel"
          @click="ui.exitBatch()"
        >
          返回
        </button>
        <button class="btn sm" data-testid="quick-batch" :class="{ frozen: ui.batchMode }" @click="enterBatch">
          <!-- L1.5 图标统一：批量删除（原型 = I.trash + 文字） -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
          <span>批量删除</span>
        </button>
        <button class="icon-btn accent" data-testid="quick-new" :class="{ frozen: ui.batchMode }" title="新建模板" @click="ui.openChild('template-new')">
          <!-- L1.5 图标统一：＋ 由字形换原型 I.plus SVG -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <p v-if="error" class="error" data-testid="quick-error">{{ error }}</p>

      <div v-if="store.templates.length > 0" ref="listEl" class="scroll" @scroll="hideFullHint">
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
          <span v-if="!ui.batchMode" class="plusbox" data-testid="tpl-add" title="添加到待办列表" @click.stop="quickAdd(t.id)" @dblclick.stop>
            <!-- L1.5 图标统一：＋ 由字形换原型 I.plus SVG（11px 随 .plusbox svg） -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <button v-else type="button" class="checkbox" :class="{ checked: ui.selectedIds.includes(t.id) }" @click.stop="ui.toggleSelect(t.id)" @dblclick.stop>
            <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
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

/* v3.5-L2.6 落地：模板满额提示在快捷窗顶部空白区、水平居中（win-body 顶距 8 规则保持不变） */
.quick-hint-lane {
  height: 28px;
  flex: none;
}

.quick-hint-wrap {
  position: absolute;
  top: 2px;
  left: 0;
  right: 0;
  text-align: center;
  pointer-events: none;
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity 0.16s var(--ease-out),
    transform 0.16s var(--ease-out);
  z-index: 2;
}

.quick-hint-wrap.show {
  opacity: 1;
  transform: translateY(0);
}

.quick-hint {
  display: inline-block;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(22, 22, 22, 0.94);
  color: #fff;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  box-shadow: 0 6px 18px rgba(10, 20, 40, 0.28);
}

@media (prefers-reduced-motion: reduce) {
  .quick-hint-wrap {
    transition: none;
  }
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
  font-size: 12px; /* L2 字阶 label 12（原 12.5） */
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
  font-size: 12px; /* L2：13→label 12（容器为 SVG，字号仅归阶梯） */
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
  padding: 8px 14px 24px; /* L2：顶部 2→8（4px 栅格，三窗同口径）；底部 24px：避让右下缩放角 */
  position: relative;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 8px; /* L2：6→8（4px 栅格） */
  padding: 0 2px 8px;
  flex: none;
}

.panel-title {
  font-size: 15px; /* L2 字阶 heading 15（原 13；层级靠字重+颜色区分） */
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
  font-size: 11px; /* L2 字阶 caption 11（原 11.5；26px 小按钮口径） */
  cursor: pointer;
  display: inline-flex; /* L1.5：带图标按钮（trash+文字）行内居中对齐 */
  align-items: center;
  gap: 5px;
}

.btn.sm svg {
  width: 13px;
  height: 13px;
  flex: none;
}

.btn.sm:hover {
  background: var(--btn-hover);
}

.icon-btn.accent {
  width: 32px; /* L1.5 规格统一：图标按钮 32×32（原型 .icon-btn 全局单一规格；原 26px 为孤例） */
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 12px; /* L2：14→label 12（容器为 SVG，字号仅归阶梯） */
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* L1.5：＋ 图标（原型 I.plus，16px 随 32px 图标按钮） */
.icon-btn.accent svg {
  width: 16px;
  height: 16px;
}

.icon-btn.accent:hover {
  background: var(--accent-hover);
}

.error {
  margin: 0 0 8px; /* L2：6→8（4px 栅格） */
  font-size: 12px;
  color: var(--danger);
}

.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px; /* L2：6→8（与主窗列表同节奏） */
  padding: 2px;
}

.tpl-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 12px; /* L2 行归一：9×10→11×12（与主窗待办行同高） */
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
  font-size: 12px; /* L2：13→label 12（容器为 SVG，字号仅归阶梯） */
  line-height: 1;
  background: transparent;
}

/* L1.5：＋ 图标（原型 I.plus 11px 规格） */
.plusbox svg {
  width: 11px;
  height: 11px;
  display: block;
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
  stroke-width: 3;
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
  /* L2：全宽说明块节奏——2px 对齐补偿（框与列表行同边）+ 8×12 内边距（文左缘与行内文对齐） */
  margin: 8px 2px 0;
  flex: none;
  font-size: 11px; /* L2 字阶 caption 11（原 11.5） */
  color: var(--muted);
  background: var(--hover);
  border-radius: 6px;
  padding: 8px 12px;
  line-height: 1.5;
}
</style>

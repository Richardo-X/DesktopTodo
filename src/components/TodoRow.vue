<script setup lang="ts">
import type { TodoItem } from '../core/models/types'
import { createDblClickGuard } from './useDblClickGuard'
import { bubbleContentEnter, bubbleContentLeave, hideBubble } from './content-bubble'

const props = defineProps<{
  item: TodoItem
  batchMode?: boolean
  selected?: boolean
  leaving?: boolean
  dragging?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  edit: []
  'select-toggle': []
  'handle-down': [e: PointerEvent]
}>()

const dblGuard = createDblClickGuard()

// 8.2-4：悬停内容 1 秒气泡（全局单例，仅截断内容触发）
function onContentEnter(e: MouseEvent): void {
  const content = e.currentTarget as HTMLElement
  const row = content.closest('.todo-row') as HTMLElement | null
  if (row) bubbleContentEnter(content, row)
}

function onRowClick(): void {
  // 批量模式下点击行 = 选中/取消；常规模式单击无操作（PRD §5.2）
  if (props.batchMode) emit('select-toggle')
}

function onDblClick(): void {
  // 8.2-9 连点保护窗：勾选框刚被点击过，双击大概率是连点偏出的误合成
  if (props.batchMode || dblGuard.blocked()) return
  hideBubble()
  emit('edit')
}

function onCheckboxClick(): void {
  dblGuard.mark()
  // 决策#25：批量模式勾选框 = 选中示意；常规模式 = 完成
  if (props.batchMode) emit('select-toggle')
  else emit('toggle')
}
</script>

<template>
  <div
    class="todo-row"
    data-testid="todo-row"
    :class="{ selrow: batchMode && selected, leaving, dragging }"
    @click="onRowClick"
    @dblclick="onDblClick"
  >
    <span
      class="grip"
      data-testid="row-handle"
      :class="{ disabled: batchMode }"
      title="长按拖动排序"
      @pointerdown.stop="emit('handle-down', $event)"
      @dblclick.stop
    />
    <span class="content ellipsis" data-testid="row-content" @mouseenter="onContentEnter" @mouseleave="bubbleContentLeave">
      <span class="tt-in">{{ item.content }}</span>
    </span>
    <span v-if="item.overdue" class="tag overdue" data-testid="row-overdue-tag">逾期</span>
    <!-- 决策#25：批量模式下同一勾选框原位变为选中示意（选中=accent 白勾） -->
    <button type="button" class="checkbox" :class="{ checked: batchMode && selected }" data-testid="row-checkbox" @click.stop="onCheckboxClick" @dblclick.stop>
      <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </button>
  </div>
</template>

<style scoped>
.todo-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 12px; /* 批次 B-4（#36）：事项块加大 8×10→11×12（行高约 44px） */
  border-radius: 8px;
  background: var(--card, rgba(255, 255, 255, 0.7));
  border: 1px solid var(--card-border, rgba(0, 0, 0, 0.09));
  user-select: none;
  cursor: default;
  /* L1（v3.4）：hover 变色/拖动投影走缓出过渡（FLIP 回弹为内联 transition，不受影响） */
  transition:
    transform 0.15s var(--ease-out),
    box-shadow 0.15s var(--ease-out),
    background-color 0.15s var(--ease-out);
}

.todo-row:hover {
  border-color: var(--accent, #0a63b8);
  background: var(--hover, rgba(0, 0, 0, 0.05));
}

/* 决策#25：批量选中态 */
.todo-row.selrow {
  border-color: var(--accent, #0a63b8);
  background: var(--hover, rgba(0, 0, 0, 0.05));
}

.grip {
  width: 14px;
  height: 20px;
  flex: none;
  border-radius: 4px;
  background: radial-gradient(circle, var(--faint, #8b8f99) 1px, transparent 1.4px);
  background-size: 6px 6px;
  cursor: grab;
  touch-action: none;
}

.grip:hover {
  background-image: radial-gradient(circle, var(--accent, #0a63b8) 1px, transparent 1.4px);
}

/* 决策#25：批量模式拖拽柄置灰禁用 */
.grip.disabled {
  cursor: default;
  opacity: 0.4;
  pointer-events: none;
}

.content {
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: 13.5px;
  line-height: 1.5;
}

.ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 8.2-4：inline-block 内层才能测出文本真实宽度（块级容器 scrollWidth 恒等于容器宽）；
 * 内层不裁剪（原型 .tt-in overflow:visible），截断省略号由外层 .ellipsis 完成 */
.tt-in {
  display: inline-block;
  white-space: nowrap;
  vertical-align: bottom;
}

.tag {
  flex: none;
  font-size: 10px;
  line-height: 15px;
  padding: 0 6px;
  border-radius: 99px;
  border: 1px solid currentColor;
  opacity: 0.95;
}

.tag.overdue {
  color: var(--overdue, #d13438);
}

/* 勾选框（决策#25：批量模式下同款样式=选中示意） */
.checkbox {
  flex: none;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1.5px solid var(--cb-border, #8a8a8a);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: transparent;
}

.checkbox:hover {
  border-color: var(--accent, #0a63b8);
}

.checkbox.checked {
  background: var(--accent, #0a63b8);
  border-color: var(--accent, #0a63b8);
  color: var(--accent-fg, #ffffff);
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

.todo-row.leaving {
  transition:
    opacity 0.28s ease,
    transform 0.28s ease;
  opacity: 0;
  transform: translateX(56px);
}

.todo-row.dragging {
  opacity: 0.5;
  background: var(--active, rgba(0, 0, 0, 0.09));
  border-color: var(--accent, #0a63b8);
  box-shadow: 0 4px 14px rgba(10, 20, 40, 0.22); /* L1：投影色调化（纯黑→蓝黑） */
  z-index: 5;
}
</style>

<script setup lang="ts">
import { ref } from 'vue'
import type { TodoItem } from '../core/models/types'

const props = defineProps<{
  item: TodoItem
  batchMode?: boolean
  selected?: boolean
  leaving?: boolean
  dragging?: boolean
  over?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  edit: []
  'select-toggle': []
  'handle-down': [e: PointerEvent]
}>()

// 悬停 1 秒显示全文气泡（PRD §3）
const bubbleVisible = ref(false)
let hoverTimer: ReturnType<typeof setTimeout> | null = null

function onEnter(): void {
  hoverTimer = setTimeout(() => {
    bubbleVisible.value = true
  }, 1000)
}

function onLeave(): void {
  if (hoverTimer !== null) clearTimeout(hoverTimer)
  hoverTimer = null
  bubbleVisible.value = false
}

function onRowClick(): void {
  // 批量模式下点击行 = 选中/取消；常规模式单击无操作（PRD §5.2）
  if (props.batchMode) emit('select-toggle')
}

function onDblClick(): void {
  if (props.batchMode) return
  emit('edit')
}
</script>

<template>
  <div
    class="todo-row"
    data-testid="todo-row"
    :class="{ selected: batchMode && selected, leaving, dragging, over }"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @click="onRowClick"
    @dblclick="onDblClick"
  >
    <span
      class="handle"
      data-testid="row-handle"
      title="长按拖动排序"
      @pointerdown.stop="emit('handle-down', $event)"
      @dblclick.stop
    />
    <span class="content ellipsis" data-testid="row-content">{{ item.content }}</span>
    <span v-if="item.overdue" class="overdue-tag red" data-testid="row-overdue-tag">逾期</span>
    <span v-if="bubbleVisible" class="bubble" data-testid="row-bubble">{{ item.content }}</span>
    <input
      v-if="!batchMode"
      type="checkbox"
      class="checkbox"
      data-testid="row-checkbox"
      @click.stop="emit('toggle')"
      @dblclick.stop
    />
    <span
      v-else
      class="select-circle"
      data-testid="row-select-circle"
      :class="{ checked: selected }"
    />
  </div>
</template>

<style scoped>
.todo-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: default;
}

.todo-row:hover {
  background: rgba(0, 0, 0, 0.05);
}

.handle {
  width: 14px;
  height: 20px;
  flex: none;
  border-radius: 4px;
  background: radial-gradient(circle, currentColor 1px, transparent 1.4px);
  background-size: 6px 6px;
  opacity: 0.45;
  cursor: grab;
}

.content {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.overdue-tag {
  flex: none;
  font-size: calc(var(--fs, 14px) * 12 / 14);
  padding: 1px 6px;
  border-radius: 6px;
  color: #fff;
}

.red {
  background: #e5484d;
}

.bubble {
  position: absolute;
  top: 100%;
  left: 24px;
  z-index: 30;
  max-width: 280px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(30, 32, 38, 0.92);
  color: #fff;
  font-size: calc(var(--fs, 14px) * 12 / 14);
  white-space: normal;
  pointer-events: none;
}

.checkbox {
  flex: none;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.select-circle {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  opacity: 0.6;
}

.select-circle.checked {
  background: currentColor;
  opacity: 1;
}

.todo-row.selected {
  background: rgba(47, 111, 237, 0.12);
}

.todo-row.leaving {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
  opacity: 0;
  transform: translateX(24px) scale(0.96);
}

.todo-row.dragging {
  opacity: 0.5;
}

.todo-row.over {
  outline: 2px dashed rgba(47, 111, 237, 0.7);
  outline-offset: -2px;
}
</style>

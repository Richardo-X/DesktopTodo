<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'

const props = defineProps<{ target?: 'todos' | 'templates' | 'history'; historyDateKey?: string }>()

const store = useAppStore()
const ui = useUiStore()

const allIds = (): string[] => {
  if (props.target === 'templates') return store.templates.map((t) => t.id)
  if (props.target === 'history') return (props.historyDateKey ? store.archive[props.historyDateKey] ?? [] : []).map((t) => t.id)
  return store.todos.map((t) => t.id)
}

// 四轮5：已全选时「全选」按钮切换为「取消」（点击清空选择）
const allSelected = computed(() => {
  const ids = allIds()
  return ids.length > 0 && ui.selectedIds.length >= ids.length
})

function onToggleSelectAll(): void {
  if (allSelected.value) ui.selectAll([])
  else ui.selectAll(allIds())
}

async function onDelete(): Promise<void> {
  // 8.2-6 用户定稿：未选中时按钮 disabled 不可点；此 guard 仅防编程派发
  if (ui.selectedIds.length === 0) return
  const count = ui.selectedIds.length
  const ok = await ui.confirm(`确定删除所选的 ${count} 项吗？删除后无法恢复。`)
  if (!ok) return
  if (props.target === 'templates') await store.batchDeleteTemplates([...ui.selectedIds])
  else if (props.target === 'history') await store.batchDeleteHistory(props.historyDateKey ?? '', [...ui.selectedIds])
  else await store.batchDeleteTodos([...ui.selectedIds])
  ui.exitBatch()
}
</script>

<template>
  <div class="batch-bar" data-testid="batch-bar">
    <span class="count" data-testid="batch-count">已选 {{ ui.selectedIds.length }} 项</span>
    <button class="b" data-testid="batch-select-all" @click="onToggleSelectAll">{{ allSelected ? '取消' : '全选' }}</button>
    <button class="b" data-testid="batch-cancel" @click="ui.exitBatch()">返回</button>
    <button class="b danger" data-testid="batch-delete" :disabled="ui.selectedIds.length === 0" @click="onDelete">删除所选</button>
  </div>
</template>

<style scoped>
.batch-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid var(--accent, #0a63b8);
  border-radius: 8px;
  background: var(--hover, rgba(0, 0, 0, 0.05));
  font-size: 12px;
  color: var(--muted, #666);
}

.count {
  flex: 1;
  text-align: left;
}

/* 8.2-6 用户定稿：未选中时「删除所选」禁用置灰 */
.b:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.b {
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--btn-border, rgba(0, 0, 0, 0.13));
  border-radius: 5px;
  background: var(--btn, rgba(255, 255, 255, 0.75));
  color: var(--text, #1c1c1c);
  font-size: 11.5px;
  cursor: pointer;
}

.b:hover {
  background: var(--btn-hover, #ffffff);
}

/* 决策#22：危险按钮 hover 深红（不随通用白底 hover 变白） */
.b.danger {
  background: var(--danger, #c42b1c);
  border-color: transparent;
  color: #fff;
}

.b.danger:hover:not(:disabled) {
  background: #a9271c;
}
</style>

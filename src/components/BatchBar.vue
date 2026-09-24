<script setup lang="ts">
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

async function onDelete(): Promise<void> {
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
    <button class="b" data-testid="batch-select-all" @click="ui.selectAll(allIds())">全选</button>
    <button class="b" data-testid="batch-cancel" @click="ui.exitBatch()">取消</button>
    <button class="b danger" data-testid="batch-delete" @click="onDelete">删除所选</button>
  </div>
</template>

<style scoped>
.batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.count {
  font-size: calc(var(--fs, 14px) * 12 / 14);
  flex: 1;
  text-align: left;
}

.b {
  border: none;
  background: transparent;
  font-size: calc(var(--fs, 14px) * 12 / 14);
  color: inherit;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.b:hover {
  background: rgba(0, 0, 0, 0.08);
}

.danger {
  color: #e5484d;
}
</style>

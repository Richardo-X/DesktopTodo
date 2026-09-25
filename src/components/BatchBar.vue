<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
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

// 8.2-6：未选中删除不弹确认框，批量条内红字提示（选中变化/3 秒后清除）
const hint = ref('')
let hintTimer: ReturnType<typeof setTimeout> | undefined

function showHint(msg: string): void {
  hint.value = msg
  if (hintTimer !== undefined) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => {
    hint.value = ''
  }, 3000)
}

watch(
  () => ui.selectedIds.length,
  () => {
    hint.value = ''
  }
)

onUnmounted(() => {
  if (hintTimer !== undefined) clearTimeout(hintTimer)
})

async function onDelete(): Promise<void> {
  const count = ui.selectedIds.length
  if (count === 0) {
    showHint('没有选择要删除的事项')
    return
  }
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
    <span v-if="hint" class="hint" data-testid="batch-hint">{{ hint }}</span>
    <button class="b" data-testid="batch-select-all" @click="ui.selectAll(allIds())">全选</button>
    <button class="b" data-testid="batch-cancel" @click="ui.exitBatch()">取消</button>
    <button class="b danger" data-testid="batch-delete" @click="onDelete">删除所选</button>
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

.hint {
  color: var(--danger, #c42b1c);
  font-weight: 600;
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

.b.danger:hover {
  background: #a9271c;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../stores/app'
import { getApi } from '../services/api'
import { fmtLocalDateTime } from '../core/utils/date'
import { isCompletedOverdue } from '../core/services/overdue'
import type { TodoItem } from '../core/models/types'

const props = defineProps<{ itemId?: string }>()

const store = useAppStore()

const item = computed<TodoItem | undefined>(() => {
  const id = props.itemId
  if (id === undefined) return undefined
  return (
    store.completed.find((t) => t.id === id) ??
    Object.values(store.archive).flat().find((t) => t.id === id) ??
    store.todos.find((t) => t.id === id)
  )
})

const overdueLabel = computed(() => (item.value && isCompletedOverdue(item.value) ? '已逾期' : '未逾期'))
const createdText = computed(() => (item.value ? fmtLocalDateTime(new Date(item.value.createdAt)) : ''))
const completedText = computed(() =>
  item.value?.completedAt ? fmtLocalDateTime(new Date(item.value.completedAt)) : ''
)

async function close(): Promise<void> {
  await getApi().closeSelf()
}
</script>

<template>
  <div class="child-window" data-theme="day">
    <header class="titlebar">
      <span class="title">详情</span>
      <span class="spacer" />
    </header>

    <div v-if="item" class="body">
      <p class="content" data-testid="detail-content">{{ item.content }}</p>
      <div class="props">
        <span>创建时间：<span data-testid="detail-created">{{ createdText }}</span></span>
        <span>完成时间：<span data-testid="detail-completed">{{ completedText }}</span></span>
        <span>状态：<span data-testid="detail-overdue" :class="{ late: overdueLabel === '已逾期' }">{{ overdueLabel }}</span></span>
      </div>
    </div>
    <div v-else class="missing">事项不存在</div>

    <footer class="footer">
      <button class="close" data-testid="detail-close" @click="close">关闭</button>
    </footer>
  </div>
</template>

<style scoped>
.child-window {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(252, 252, 253, 0.96);
  color: #2a2f3a;
  border-radius: 12px;
  overflow: hidden;
}

.titlebar {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.title {
  font-size: 14px;
  font-weight: 600;
}

.spacer {
  flex: 1;
}

.body {
  flex: 1;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.content {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.props {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  opacity: 0.8;
}

.late {
  color: #e5484d;
  font-weight: 600;
}

.missing {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
}

.footer {
  padding: 12px;
  display: flex;
  justify-content: center;
}

.close {
  border: none;
  border-radius: 10px;
  padding: 8px 24px;
  background: #2f6fed;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
</style>

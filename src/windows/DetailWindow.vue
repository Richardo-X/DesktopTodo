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
/** 窗口标题（原型语言）：归档事项=历史事项，当天已完成=已完成事项 */
const titleText = computed(() =>
  item.value && Object.values(store.archive).flat().some((t) => t.id === item.value!.id) ? '历史事项' : '已完成事项'
)
const createdText = computed(() => (item.value ? fmtLocalDateTime(new Date(item.value.createdAt)) : ''))
const completedText = computed(() =>
  item.value?.completedAt ? fmtLocalDateTime(new Date(item.value.completedAt)) : ''
)

async function close(): Promise<void> {
  await getApi().closeSelf()
}
</script>

<template>
  <div class="child-window">
    <header class="titlebar">
      <span class="title">{{ titleText }}</span>
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
      <button class="b" data-testid="detail-close" @click="close">关闭</button>
    </footer>
  </div>
</template>

<style scoped>
.content {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.5; /* L2：正文行高统一 1.5（原 1.6） */
  white-space: pre-wrap;
  word-break: break-all;
}

.props {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
  background: var(--hover);
  border-radius: 6px;
  padding: 12px; /* L2：10→12（4px 栅格） */
}

.props .late {
  color: var(--overdue);
  font-weight: 600;
}

.footer .b {
  margin-left: auto;
}

/* 隐藏 body 原生滚动条（用户 2026-10-15：关闭钮与灰框右缘垂直对齐）——
 * 滚动条会挤压 props 盒宽 ~9px 致其右缘与 footer 按钮右缘错开；滚轮滚动保留 */
.child-window .body {
  scrollbar-width: none;
}

.child-window .body::-webkit-scrollbar {
  display: none;
}
</style>


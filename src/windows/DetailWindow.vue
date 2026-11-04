<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { getApi } from '../services/api'
import { fmtLocalDateTime } from '../core/utils/date'
import { isCompletedOverdue } from '../core/services/overdue'
import type { TodoItem } from '../core/models/types'

const props = defineProps<{ itemId?: string }>()

const store = useAppStore()
const ui = useUiStore()

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
/** 来源：归档历史 / 当天已完成 / 仍活跃待办（活跃待办详情不提供删除） */
const archivedDateKey = computed(() => {
  const id = props.itemId
  if (id === undefined) return null
  return Object.keys(store.archive).find((k) => store.archive[k].some((t) => t.id === id)) ?? null
})
const isArchived = computed(() => archivedDateKey.value !== null)
const isCompleted = computed(
  () => props.itemId !== undefined && store.completed.some((t) => t.id === props.itemId)
)
const canDelete = computed(() => isArchived.value || isCompleted.value)
/** 窗口标题（原型语言）：归档事项=历史事项，当天已完成=已完成事项 */
const titleText = computed(() => (isArchived.value ? '历史事项' : isCompleted.value ? '已完成事项' : '事项详情'))
const createdText = computed(() => (item.value ? fmtLocalDateTime(new Date(item.value.createdAt)) : ''))
const completedText = computed(() =>
  item.value?.completedAt ? fmtLocalDateTime(new Date(item.value.completedAt)) : ''
)

async function close(): Promise<void> {
  await getApi().closeSelf()
}

/** 已确认删除：已完成事项删 completed；历史事项删对应归档日；删除后关闭详情 */
async function onDelete(): Promise<void> {
  const id = props.itemId
  if (id === undefined || !canDelete.value) return
  const kind = isArchived.value ? '历史' : '已完成'
  const ok = await ui.confirm(`删除这条${kind}事项？\n\n删除后无法恢复。`)
  if (!ok) return
  const r = isArchived.value
    ? await store.deleteHistory(archivedDateKey.value!, id)
    : await store.deleteCompleted(id)
  if (r.ok) await close()
}
</script>

<template>
  <div class="child-window">
    <header class="titlebar">
      <span class="title">{{ titleText }}</span>
      <span class="spacer" />
      <button v-if="isCompleted" class="tb-delete" data-testid="detail-delete" @click="onDelete">删除</button>
    </header>

    <div v-if="item" class="body">
      <div class="props" data-testid="detail-props">
        <span>创建时间：<span data-testid="detail-created">{{ createdText }}</span></span>
        <span>完成时间：<span data-testid="detail-completed">{{ completedText }}</span></span>
        <span>状态：<span data-testid="detail-overdue" :class="{ late: overdueLabel === '已逾期' }">{{ overdueLabel }}</span></span>
      </div>
      <p class="content" data-testid="detail-content">{{ item.content }}</p>
    </div>
    <div v-else class="missing">事项不存在</div>

    <footer class="footer">
      <button v-if="isArchived" class="b danger" data-testid="detail-delete" @click="onDelete">删除</button>
      <button class="b" data-testid="detail-close" @click="close">关闭</button>
    </footer>

    <ConfirmDialog />
  </div>
</template>

<style scoped>
.content {
  margin: 0;
  padding: 12px;
  border-radius: 6px;
  background: var(--hover);
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
}

.props .late {
  color: var(--overdue);
  font-weight: 600;
}

/* 已完成详情：删除在标题栏右端（WPF DetailDialog 同口径）；历史详情删除在底部关闭左侧 */
.tb-delete {
  height: 26px;
  margin-right: 6px;
  padding: 0 10px;
  border: 1px solid var(--danger);
  border-radius: 6px;
  background: transparent;
  color: var(--danger);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.tb-delete:hover {
  background: rgba(196, 43, 28, 0.1);
}

/* footer 已 justify-content:flex-end；不要再给 .b 加 margin-left:auto——
 * 两个按钮都命中会把历史「删除」推到中间，无法紧贴「关闭」左侧 */
.footer .b:last-child {
  margin-left: 0;
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


<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { getApi } from '../services/api'
import { fmtLocalDateTime } from '../core/utils/date'
import { MAX_CONTENT_LENGTH } from '../core/models/factories'

const props = defineProps<{ itemId?: string }>()

const store = useAppStore()
const ui = useUiStore()

const item = computed(() => store.todos.find((t) => t.id === props.itemId))
const draft = ref('')

const touched = ref(false)
const error = ref('')

// store 初始化/推送后同步原文（用户未输入前）
watch(
  () => item.value?.content,
  (v) => {
    if (!touched.value && v !== undefined) draft.value = v
  },
  { immediate: true }
)

const dirty = computed(() => touched.value && item.value !== undefined && draft.value !== item.value.content)
const status = computed(() => (item.value?.overdue ? '已逾期' : '进行中'))
const statusClass = computed(() => (item.value?.overdue ? 'red' : 'gray'))
const createdText = computed(() =>
  item.value ? fmtLocalDateTime(new Date(item.value.createdAt)) : ''
)
const danger = computed(() => draft.value.length >= MAX_CONTENT_LENGTH)

function onInput(): void {
  touched.value = true
  error.value = ''
  store.setUnsavedEdits(true)
}

async function revert(): Promise<void> {
  draft.value = item.value?.content ?? ''
  touched.value = false
  error.value = ''
  store.setUnsavedEdits(false)
}

async function save(): Promise<boolean> {
  if (item.value === undefined) return false
  if (draft.value.trim().length === 0) {
    error.value = '内容不能为空'
    return false
  }
  const r = await store.updateTodoContent(item.value.id, draft.value)
  if (!r.ok) {
    error.value = r.reason === 'too-long' ? `内容不能超过 ${MAX_CONTENT_LENGTH} 字` : '保存失败'
    return false
  }
  store.setUnsavedEdits(false)
  return true
}

async function onSave(): Promise<void> {
  if (await save()) await getApi().closeSelf()
}

async function onDelete(): Promise<void> {
  if (item.value === undefined) return
  const ok = await ui.confirm('确定删除这条待办吗？删除后无法恢复。')
  if (!ok) return
  const r = await store.deleteTodo(item.value.id)
  if (r.ok) {
    store.setUnsavedEdits(false)
    await getApi().closeSelf()
  }
}

async function addToTemplate(): Promise<void> {
  const r = await store.createTemplate(draft.value)
  if (r.ok) {
    error.value = ''
    return
  }
  error.value = r.reason === 'duplicate' ? '已存在相同内容' : r.reason === 'limit-reached' ? '模板数量已达上限' : '添加失败'
}

async function onBack(): Promise<void> {
  if (item.value === undefined) {
    await getApi().closeSelf()
    return
  }
  if (!dirty.value) {
    await getApi().closeSelf()
    return
  }
  const ok = await ui.confirm('是否保存修改的内容？')
  if (ok) {
    if (await save()) await getApi().closeSelf()
  } else {
    store.setUnsavedEdits(false)
    await getApi().closeSelf()
  }
}
</script>

<template>
  <div class="child-window">
    <header class="titlebar">
      <button class="back" data-testid="edit-back" aria-label="返回" @click="onBack">
        <!-- L1.5 图标统一：← 字形换原型 I.chevL SVG -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <span class="title">编辑待办事项</span>
      <span class="spacer" />
      <button v-if="item" class="save" data-testid="edit-save" @click="onSave">保存</button>
    </header>

    <div v-if="item" class="body">
      <div class="props">
        <span class="status" data-testid="edit-status" :class="statusClass">{{ status }}</span>
        <span class="created">
          创建时间：<span data-testid="edit-created">{{ createdText }}</span>
        </span>
      </div>

      <textarea
        v-model="draft"
        class="input"
        data-testid="edit-input"
        :maxlength="MAX_CONTENT_LENGTH"
        rows="4"
        @input="onInput"
      />
      <div class="meta">
        <span class="count" :class="{ danger }">{{ draft.length }}/{{ MAX_CONTENT_LENGTH }}</span>
        <button class="b" data-testid="edit-revert" :disabled="!dirty" @click="revert">
          <!-- L1.5 图标统一：原型 = I.undo + 文字 -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 4v6h6" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span>还原</span>
        </button>
        <span class="spacer" />
        <button class="b" data-testid="edit-to-template" @click="addToTemplate">
          <!-- L1.5 图标统一：原型 = I.bolt + 文字 -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
          </svg>
          <span>添加到模板</span>
        </button>
        <button class="b danger" data-testid="edit-delete" @click="onDelete">
          <!-- L1.5 图标统一：原型 = I.trash + 文字 -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
          <span>删除</span>
        </button>
      </div>

      <p v-if="error" class="error" data-testid="edit-error">{{ error }}</p>
    </div>
    <div v-else class="missing">事项不存在</div>

    <ConfirmDialog />
  </div>
</template>

<style scoped>
.props {
  display: flex;
  align-items: center;
  gap: 8px; /* L2：10→8（4px 栅格） */
}

.status {
  flex: none;
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 99px;
}

.status.gray {
  color: var(--muted);
  background: var(--hover);
}

.status.red {
  color: var(--danger);
  background: rgba(196, 43, 28, 0.12);
}

.created {
  font-size: 11px; /* L2 字阶 caption 11（原 11.5） */
  color: var(--muted);
}

.meta {
  display: flex;
  align-items: center;
  /* 按钮=字数统计右邻（用户 2026-10-14）：左对齐 + 12px 间距，不再两端撑开 */
  justify-content: flex-start;
  gap: 12px;
}

/* 输入框高度：4:3 基准上收两行（用户 2026-10-15；添加到模板/删除已并入字数行，窗体随之收紧） */
.child-window .input {
  aspect-ratio: auto;
  height: 254px;
}

.spacer {
  flex: 1;
}
</style>


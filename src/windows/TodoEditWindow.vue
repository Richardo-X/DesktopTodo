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


// TEMP 文本光标诊断（用户 2026-10-06 报告：插入点恒在末尾；发版前移除）
function diag(tag: string, e: Event): void {
  const el = e.target as HTMLTextAreaElement
  void getApi().diagnosticLog(
    `[cursor-diag] ${tag} sel=${el.selectionStart}..${el.selectionEnd} len=${el.value.length}`
  )
}
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
      <button class="back" data-testid="edit-back" aria-label="返回" @click="onBack">←</button>
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
        @click="diag('click', $event)"
        @keyup="diag('key', $event)"
      />
      <div class="meta">
        <span class="count" :class="{ danger }">{{ draft.length }}/{{ MAX_CONTENT_LENGTH }}</span>
        <button class="b" data-testid="edit-revert" :disabled="!dirty" @click="revert">还原</button>
      </div>

      <p v-if="error" class="error" data-testid="edit-error">{{ error }}</p>

      <div class="row">
        <button class="b" data-testid="edit-to-template" @click="addToTemplate">添加到模板</button>
        <span class="spacer" />
        <button class="b danger" data-testid="edit-delete" @click="onDelete">删除</button>
      </div>
    </div>
    <div v-else class="missing">事项不存在</div>

    <ConfirmDialog />
  </div>
</template>

<style scoped>
.props {
  display: flex;
  align-items: center;
  gap: 10px;
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
  font-size: 11.5px;
  color: var(--muted);
}

.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.row {
  display: flex;
  align-items: center;
}

.spacer {
  flex: 1;
}
</style>


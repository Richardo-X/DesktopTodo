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

const item = computed(() => store.templates.find((t) => t.id === props.itemId))
const draft = ref('')
const touched = ref(false)
const error = ref('')

watch(
  () => item.value?.content,
  (v) => {
    if (!touched.value && v !== undefined) draft.value = v
  },
  { immediate: true }
)

const dirty = computed(() => touched.value && item.value !== undefined && draft.value !== item.value.content)
const createdText = computed(() => (item.value ? fmtLocalDateTime(new Date(item.value.createdAt)) : ''))
const danger = computed(() => draft.value.length >= MAX_CONTENT_LENGTH)

function onInput(): void {
  touched.value = true
  error.value = ''
}

async function revert(): Promise<void> {
  draft.value = item.value?.content ?? ''
  touched.value = false
  error.value = ''
}

async function save(): Promise<boolean> {
  if (item.value === undefined) return false
  if (draft.value.trim().length === 0) {
    error.value = '内容不能为空'
    return false
  }
  const r = await store.updateTemplate(item.value.id, draft.value)
  if (!r.ok) {
    error.value =
      r.reason === 'duplicate' ? '已存在相同内容' : r.reason === 'too-long' ? `内容不能超过 ${MAX_CONTENT_LENGTH} 字` : '保存失败'
    return false
  }
  return true
}

async function onSave(): Promise<void> {
  if (await save()) await getApi().closeSelf()
}

async function onDelete(): Promise<void> {
  if (item.value === undefined) return
  const ok = await ui.confirm('确定删除这个模板吗？删除后将进入回收站。')
  if (!ok) return
  const r = await store.deleteTemplate(item.value.id)
  if (r.ok) await getApi().closeSelf()
}

async function onBack(): Promise<void> {
  if (item.value === undefined || !dirty.value) {
    await getApi().closeSelf()
    return
  }
  const ok = await ui.confirm('是否保存修改的内容？')
  if (ok) {
    if (await save()) await getApi().closeSelf()
  } else {
    await getApi().closeSelf()
  }
}
</script>

<template>
  <div class="child-window" data-theme="day">
    <header class="titlebar">
      <button class="back" data-testid="tpl-edit-back" aria-label="返回" @click="onBack">←</button>
      <span class="title">编辑模板</span>
      <span class="spacer" />
      <button v-if="item" class="save" data-testid="tpl-edit-save" @click="onSave">保存</button>
    </header>

    <div v-if="item" class="body">
      <div class="props">
        <span class="created">
          创建时间：<span data-testid="tpl-edit-created">{{ createdText }}</span>
        </span>
      </div>

      <textarea
        v-model="draft"
        class="input"
        data-testid="tpl-edit-input"
        :maxlength="MAX_CONTENT_LENGTH"
        rows="3"
        @input="onInput"
      />
      <div class="meta">
        <span class="count" :class="{ danger }">{{ draft.length }}/{{ MAX_CONTENT_LENGTH }}</span>
        <button class="b" data-testid="tpl-edit-revert" :disabled="!dirty" @click="revert">还原</button>
      </div>

      <p v-if="error" class="error" data-testid="tpl-edit-error">{{ error }}</p>

      <div class="row">
        <span class="spacer" />
        <button class="b danger" data-testid="tpl-edit-delete" @click="onDelete">删除</button>
      </div>
    </div>
    <div v-else class="missing">模板不存在</div>

    <ConfirmDialog />
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
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.back,
.save {
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
  font-size: 14px;
}

.save {
  color: #2f6fed;
  font-weight: 600;
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
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.props {
  font-size: 12px;
}

.created {
  opacity: 0.7;
}

.input {
  flex: 1;
  resize: none;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 10px;
  padding: 10px;
  font-size: 14px;
  font-family: inherit;
  background: transparent;
  color: inherit;
}

.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.count {
  font-size: 12px;
  opacity: 0.7;
}

.count.danger {
  color: #e5484d;
  font-weight: 700;
  opacity: 1;
}

.b {
  border: none;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 12px;
  color: inherit;
}

.b:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.b.danger {
  color: #e5484d;
}

.row {
  display: flex;
  align-items: center;
}

.error {
  margin: 0;
  font-size: 12px;
  color: #e5484d;
}

.missing {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
}
</style>

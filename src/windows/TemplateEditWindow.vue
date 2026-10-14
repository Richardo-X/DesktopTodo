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
  const ok = await ui.confirm('确定删除这个模板吗？删除后无法恢复。')
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
  <div class="child-window">
    <header class="titlebar">
      <button class="back" data-testid="tpl-edit-back" aria-label="返回" @click="onBack">
        <!-- L1.5 图标统一：← 字形换原型 I.chevL SVG -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
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
        <button class="b" data-testid="tpl-edit-revert" :disabled="!dirty" @click="revert">
          <!-- L1.5 图标统一：原型 = I.undo + 文字 -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 4v6h6" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span>还原</span>
        </button>
      </div>

      <p v-if="error" class="error" data-testid="tpl-edit-error">{{ error }}</p>

      <div class="row">
        <span class="spacer" />
        <button class="b danger" data-testid="tpl-edit-delete" @click="onDelete">
          <!-- L1.5 图标统一：原型 = I.trash + 文字 -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
          <span>删除</span>
        </button>
      </div>
    </div>
    <div v-else class="missing">模板不存在</div>

    <ConfirmDialog />
  </div>
</template>

<style scoped>
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

.row {
  display: flex;
  align-items: center;
}

.spacer {
  flex: 1;
}
</style>


<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { getApi } from '../services/api'
import { MAX_CONTENT_LENGTH } from '../core/models/factories'

const store = useAppStore()
const ui = useUiStore()

const text = ref('')
const error = ref('')
const count = computed(() => text.value.length)
const danger = computed(() => count.value >= MAX_CONTENT_LENGTH)
const canSubmit = computed(() => text.value.trim().length > 0)

function clearInput(): void {
  text.value = ''
  error.value = ''
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  const r = await store.createTemplate(text.value)
  if (r.ok) {
    await getApi().closeSelf()
    return
  }
  error.value =
    r.reason === 'duplicate' ? '已存在相同内容' : r.reason === 'limit-reached' ? '模板数量已达上限（10 个）' : '创建失败'
}

async function onBack(): Promise<void> {
  if (text.value.length === 0) {
    await getApi().closeSelf()
    return
  }
  const ok = await ui.confirm('返回将不保存')
  if (ok) await getApi().closeSelf()
}
</script>

<template>
  <div class="child-window">
    <header class="titlebar">
      <button class="back" data-testid="tpl-new-back" aria-label="返回" @click="onBack">
        <!-- L1.5 图标统一：← 字形换原型 I.chevL SVG -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <span class="title">新建模板</span>
      <span class="spacer" />
    </header>

    <div class="body">
      <p class="hint" data-testid="tpl-new-hint">把常做的事存成模板，之后一键加入待办，模板不会消失。</p>
      <textarea
        v-model="text"
        class="input"
        data-testid="tpl-new-input"
        :maxlength="MAX_CONTENT_LENGTH"
        rows="3"
        placeholder="模板内容"
      />
      <div class="meta">
        <span class="count" data-testid="tpl-new-count" :class="{ danger }">{{ count }}/{{ MAX_CONTENT_LENGTH }}</span>
        <button class="b" data-testid="tpl-new-clear" @click="clearInput">清空</button>
        <span class="spacer" />
        <button class="primary" data-testid="tpl-new-submit" :disabled="!canSubmit" @click="submit">新建模板</button>
      </div>
      <p v-if="error" class="error" data-testid="tpl-new-error">{{ error }}</p>
    </div>

    <ConfirmDialog />
  </div>
</template>

<style scoped>
.meta {
  display: flex;
  align-items: center;
  /* 清空=字数统计右邻（用户 2026-10-14）、新建模板=行尾右对齐（用户 2026-10-15，与编辑窗删除键同款） */
  justify-content: flex-start;
  gap: 12px;
}

.spacer {
  flex: 1;
}
</style>


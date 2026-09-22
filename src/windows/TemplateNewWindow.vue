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
  <div class="child-window" data-theme="day">
    <header class="titlebar">
      <button class="back" data-testid="tpl-new-back" aria-label="返回" @click="onBack">←</button>
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
      </div>
      <p v-if="error" class="error" data-testid="tpl-new-error">{{ error }}</p>
    </div>

    <footer class="footer">
      <button class="primary" data-testid="tpl-new-submit" :disabled="!canSubmit" @click="submit">新建模板</button>
    </footer>

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

.back {
  border: none;
  background: transparent;
  font-size: 16px;
  cursor: pointer;
  color: inherit;
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
  gap: 6px;
}

.hint {
  margin: 0 0 4px;
  font-size: 12px;
  opacity: 0.65;
  line-height: 1.6;
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

.error {
  margin: 0;
  font-size: 12px;
  color: #e5484d;
}

.footer {
  padding: 12px;
  display: flex;
  justify-content: flex-end;
}

.primary {
  border: none;
  border-radius: 10px;
  padding: 8px 18px;
  background: #2f6fed;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>

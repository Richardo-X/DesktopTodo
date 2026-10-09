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

function onInput(): void {
  // 未保存输入标记：托盘退出确认时提示（速查 #3）
  store.setUnsavedEdits(text.value.trim().length > 0)
}

function clearInput(): void {
  text.value = ''
  onInput()
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  const r = await store.addTodo(text.value)
  if (r.ok) {
    store.setUnsavedEdits(false)
    await getApi().closeSelf()
    return
  }
  error.value = r.reason === 'limit-reached' ? '待办数量已达上限' : '创建失败'
}

async function onBack(): Promise<void> {
  if (text.value.length === 0) {
    await getApi().closeSelf()
    return
  }
  const ok = await ui.confirm('返回将不保存')
  if (ok) {
    store.setUnsavedEdits(false)
    await getApi().closeSelf()
  }
}
</script>

<template>
  <div class="child-window">
    <header class="titlebar">
      <button class="back" data-testid="new-back" aria-label="返回" @click="onBack">←</button>
      <span class="title">新增待办事项</span>
      <span class="spacer" />
    </header>

    <div class="body">
      <textarea
        v-model="text"
        class="input"
        data-testid="new-input"
        :maxlength="MAX_CONTENT_LENGTH"
        rows="5"
        placeholder="今天要做点什么？"
        @input="onInput"
      />
      <div class="meta">
        <span class="count" data-testid="new-count" :class="{ danger }">{{ count }}/{{ MAX_CONTENT_LENGTH }}</span>
        <button class="b" data-testid="new-clear" @click="clearInput">清空</button>
      </div>
      <p v-if="error" class="error" data-testid="new-error">{{ error }}</p>
    </div>

    <footer class="footer">
      <button class="primary" data-testid="new-submit" :disabled="!canSubmit" @click="submit">新建事项</button>
    </footer>

    <ConfirmDialog />
  </div>
</template>

<style scoped>
.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>


<style scoped>
/* 输入框长宽等比缩放（用户 2026-10-09）：高度随宽度联动（比例=基准态可视比例），
 * 窗口缩放时不再"只有宽度在变"——仅此窗的输入框，其他窗不受影响 */
.input {
  aspect-ratio: 3 / 1;
  height: auto;
}
</style>

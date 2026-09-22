<script setup lang="ts">
import { useUiStore } from '../stores/ui'

const ui = useUiStore()
</script>

<template>
  <div v-if="ui.confirmState" class="mask" data-testid="confirm-dialog">
    <div class="dialog">
      <p class="message" data-testid="confirm-message">{{ ui.confirmState.message }}</p>
      <div class="actions">
        <button class="btn cancel" data-testid="confirm-cancel" @click="ui.answerConfirm(false)">取消</button>
        <button class="btn ok" data-testid="confirm-ok" @click="ui.answerConfirm(true)">确定</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  min-width: 240px;
  max-width: 320px;
  border-radius: 12px;
  background: #fff;
  color: #2a2f3a;
  padding: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

:global([data-theme='night']) .dialog {
  background: #262a34;
  color: #e8eaf0;
}

.message {
  margin: 0 0 14px;
  font-size: calc(var(--fs, 14px) * 13 / 14);
  line-height: 1.6;
  white-space: pre-line;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn {
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: calc(var(--fs, 14px) * 13 / 14);
  cursor: pointer;
}

.cancel {
  background: rgba(0, 0, 0, 0.08);
}

.ok {
  background: #2f6fed;
  color: #fff;
}
</style>

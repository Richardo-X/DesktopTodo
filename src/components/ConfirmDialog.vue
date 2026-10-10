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
  background: rgba(10, 20, 40, 0.46); /* L1（v3.4）：蒙层色调化（纯黑→蓝黑） */
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  width: min(420px, 88vw); /* L1（v3.4）：对话框放宽至 420px（原 240~320） */
  border-radius: 10px; /* L1：圆角 12→10（对齐原型 .dialog） */
  /* 四轮真因修复：夜间底色走令牌——原 :global([data-theme]) 裸选择器被 Vue 编译器丢弃
     .dialog 限定符，导致夜间整个主题根元素被涂成不透明深色（黑块） */
  background: var(--dialog-bg, #fff);
  color: var(--dialog-fg, #2a2f3a);
  padding: 20px 22px;
  /* L1（v3.4）：双层柔和投影（近距+远距，蓝黑） */
  box-shadow:
    0 24px 56px -12px rgba(10, 20, 40, 0.5),
    0 4px 16px rgba(10, 20, 40, 0.25);
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
  border-radius: 6px; /* L1：圆角 8→6（对齐原型 .btn） */
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

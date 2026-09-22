<script setup lang="ts">
// 已完成面板（当天）——T31 完整实现
</script>

<template>
  <section class="panel side-panel" data-testid="done-panel">
    <header class="titlebar"><span>已完成 · 0</span></header>
    <div class="placeholder">当天完成</div>
  </section>
</template>

<style scoped>
.side-panel {
  width: 260px;
  height: 520px;
  flex: none;
  display: flex;
  flex-direction: column;
}

.titlebar {
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
}

.placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  font-size: 12px;
}
</style>

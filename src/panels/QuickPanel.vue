<script setup lang="ts">
// 快捷添加面板（模板库）——T29 完整实现
</script>

<template>
  <section class="panel side-panel" data-testid="quick-panel">
    <header class="titlebar"><span>模板 · 0/10</span></header>
    <div class="placeholder">模板库</div>
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

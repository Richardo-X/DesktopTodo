<script setup lang="ts">
// M0-T01 空白骨架；M3 起承载三面板簇
</script>

<template>
  <div class="app-shell" data-testid="app-shell">
    <main class="todo-main-panel">
      <span class="placeholder">桌面待办</span>
    </main>
  </div>
</template>

<style>
html,
body,
#app {
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
  user-select: none;
}
</style>

<style scoped>
.app-shell {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.todo-main-panel {
  min-width: 320px;
  min-height: 480px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder {
  color: #5b6472;
  font-size: 13.5px; /* L2 字阶 body 13.5（原 calc 14px 离群） */
}
</style>

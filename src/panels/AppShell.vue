<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import HomePanel from './HomePanel.vue'
import QuickPanel from './QuickPanel.vue'
import DonePanel from './DonePanel.vue'

const store = useAppStore()
onMounted(() => {
  void store.init()
})
</script>

<template>
  <div class="cluster" :data-theme="store.uiState.theme" :data-font="store.settings.fontScale">
    <QuickPanel v-if="store.uiState.quickVisible" data-testid="quick-panel" />
    <HomePanel />
    <DonePanel v-if="store.uiState.doneVisible" data-testid="done-panel" />
  </div>
</template>

<style scoped>
.cluster {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  width: 100vw;
  height: 100vh;
  padding: 0;
}

.panel {
  background: rgba(255, 255, 255, 0.86);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
  color: #2a2f3a;
  overflow: hidden;
}

.home-panel {
  width: 320px;
  height: 560px;
  flex: none;
}

:global(.cluster[data-theme='night']) .panel {
  background: rgba(28, 30, 38, 0.86);
  color: #e8eaf0;
}

:global(.cluster[data-font='small']) {
  font-size: 12px;
}

:global(.cluster[data-font='medium']) {
  font-size: 14px;
}

:global(.cluster[data-font='large']) {
  font-size: 16px;
}

@media (max-width: 100px) {
  .cluster {
    gap: 0;
  }
}
</style>

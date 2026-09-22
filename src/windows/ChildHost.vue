<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import TodoNewWindow from './TodoNewWindow.vue'
import TodoEditWindow from './TodoEditWindow.vue'
import TemplateNewWindow from './TemplateNewWindow.vue'
import TemplateEditWindow from './TemplateEditWindow.vue'
import DetailWindow from './DetailWindow.vue'
import HistoryWindow from './HistoryWindow.vue'
import SettingsWindow from './SettingsWindow.vue'
import RecycleWindow from './RecycleWindow.vue'
import type { ChildKind } from '../ipc/contract'

const props = defineProps<{ kind: ChildKind; id?: string }>()

const store = useAppStore()
onMounted(() => {
  void store.init()
})

const page = computed(() => {
  switch (props.kind) {
    case 'todo-new':
      return TodoNewWindow
    case 'todo-edit':
      return TodoEditWindow
    case 'template-new':
      return TemplateNewWindow
    case 'template-edit':
      return TemplateEditWindow
    case 'detail':
      return DetailWindow
    case 'history':
      return HistoryWindow
    case 'settings':
      return SettingsWindow
    case 'recycle':
      return RecycleWindow
    default:
      return null
  }
})
</script>

<template>
  <div
    v-if="page"
    :key="kind + (id ?? '')"
    class="child-root"
    data-testid="child-root"
    :data-theme="store.uiState.theme"
    :data-font="store.settings.fontScale"
  >
    <component :is="page" :item-id="id" />
  </div>
</template>

<style scoped>
.child-root {
  width: 100vw;
  height: 100vh;
  background: transparent;
}

.child-root[data-font='small'] {
  --fs: 12px;
}

.child-root[data-font='medium'] {
  --fs: 14px;
}

.child-root[data-font='large'] {
  --fs: 16px;
}

:global([data-theme='night']) .child-root :deep(.child-window) {
  background: rgba(30, 33, 42, 0.96);
  color: #e8eaf0;
}
</style>

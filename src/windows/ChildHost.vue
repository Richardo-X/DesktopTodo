<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { clampChildScale } from '../core/utils/scale'
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

/** 子窗口缩放分组：事项类/模板类/详情与历史/设置/回收站（PRD §二） */
const GROUP_OF: Record<string, string> = {
  'todo-new': 'todo',
  'todo-edit': 'todo',
  'template-new': 'template',
  'template-edit': 'template',
  detail: 'todo',
  history: 'history',
  settings: 'settings',
  recycle: 'history'
}
const group = computed(() => GROUP_OF[props.kind] ?? 'todo')
const scale = computed(() => store.uiState.childScales[group.value] ?? 1)

let gripStart: { x: number; scale: number } | null = null

function onGripDown(e: PointerEvent): void {
  gripStart = { x: e.clientX, scale: scale.value }
  window.addEventListener('pointermove', onGripMove)
  window.addEventListener('pointerup', onGripUp)
}

function onGripMove(e: PointerEvent): void {
  if (gripStart === null) return
  const dx = e.clientX - gripStart.x
  const wa = {
    x: (window.screen as unknown as { availLeft?: number }).availLeft ?? 0,
    y: (window.screen as unknown as { availTop?: number }).availTop ?? 0,
    width: window.screen.availWidth ?? 1920,
    height: window.screen.availHeight ?? 1080
  }
  const base = { width: 600, height: 516 }
  void store.setChildScale(group.value, clampChildScale(gripStart.scale + dx / 500, base.width, base.height, wa))
}

function onGripUp(): void {
  gripStart = null
  window.removeEventListener('pointermove', onGripMove)
  window.removeEventListener('pointerup', onGripUp)
}

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
    :style="{ zoom: scale }"
  >
    <component :is="page" :item-id="id" />
    <span class="child-grip" title="拖动缩放" @pointerdown.stop.prevent="onGripDown" />
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

.child-grip {
  position: fixed;
  right: 2px;
  bottom: 2px;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  border-right: 3px solid rgba(47, 111, 237, 0.55);
  border-bottom: 3px solid rgba(47, 111, 237, 0.55);
  border-bottom-right-radius: 8px;
  z-index: 200;
}

:global([data-theme='night']) .child-root :deep(.child-window) {
  background: rgba(30, 33, 42, 0.96);
  color: #e8eaf0;
}
</style>

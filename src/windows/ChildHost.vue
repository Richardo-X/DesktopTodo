<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { CHILD_SIZES, GROUP_MAX, GROUP_OF } from '../../electron/main/child-windows'
import { clampChildScale } from '../core/utils/scale'
import { getApi } from '../services/api'
import TodoNewWindow from './TodoNewWindow.vue'
import TodoEditWindow from './TodoEditWindow.vue'
import TemplateNewWindow from './TemplateNewWindow.vue'
import TemplateEditWindow from './TemplateEditWindow.vue'
import DetailWindow from './DetailWindow.vue'
import HistoryWindow from './HistoryWindow.vue'
import SettingsWindow from './SettingsWindow.vue'
import type { ChildKind } from '../ipc/contract'
import './child-window.css'

const props = defineProps<{ kind: ChildKind; id?: string }>()

const store = useAppStore()
onMounted(() => {
  void store.init()
})

/** 缩放分组：单一来源 electron/main/child-windows（B3） */
const group = computed(() => GROUP_OF[props.kind] ?? 'todo')
const scale = computed(() => store.uiState.childScales[group.value] ?? 1)

function rendererWorkArea(): { x: number; y: number; width: number; height: number } {
  const s = window.screen as unknown as {
    availLeft?: number
    availTop?: number
    availWidth?: number
    availHeight?: number
  }
  return {
    x: s.availLeft ?? 0,
    y: s.availTop ?? 0,
    width: s.availWidth ?? 1920,
    height: s.availHeight ?? 1080
  }
}

let gripStart: { x: number; scale: number } | null = null

function onGripDown(e: PointerEvent): void {
  gripStart = { x: e.clientX, scale: scale.value }
  window.addEventListener('pointermove', onGripMove)
  window.addEventListener('pointerup', onGripUp)
}

function onGripMove(e: PointerEvent): void {
  if (gripStart === null) return
  const dx = e.clientX - gripStart.x
  const max = GROUP_MAX[group.value]
  // 组缩放按组内最大基准钳制（保证组内任一窗口都不越界）
  const next = clampChildScale(gripStart.scale + dx / 500, max.w, max.h, rendererWorkArea())
  void store.setChildScale(group.value, next)
  // 决策#7/#24：真窗口尺寸变化 = 本窗口基准 × 组缩放（渲染层 zoom 与窗口 1:1）
  const base = CHILD_SIZES[props.kind]
  void getApi().resizeSelf({ width: Math.round(base.w * next), height: Math.round(base.h * next) })
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
    :style="{ zoom: scale }"
  >
    <component :is="page" :item-id="id" />
    <span class="child-grip" title="拖动缩放（同组窗口共享大小设置）" @pointerdown.stop.prevent="onGripDown" />
  </div>
</template>

<style scoped>
/* 缩放角（决策#16：与窗口圆角同弧度的弧线） */
.child-grip {
  position: fixed;
  right: 1px;
  bottom: 1px;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  z-index: 200;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.child-grip::before {
  content: '';
  position: absolute;
  inset: 0;
  border-right: 2px solid var(--muted);
  border-bottom: 2px solid var(--muted);
  border-bottom-right-radius: 10px;
}

.child-grip:hover {
  opacity: 1;
}
</style>

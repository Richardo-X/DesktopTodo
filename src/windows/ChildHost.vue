<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { CHILD_SIZES, GROUP_OF } from '../../electron/main/child-windows'
import { clampChildGroupScale } from '../core/utils/cluster-layout'
import { getApi } from '../services/api'
import TodoNewWindow from './TodoNewWindow.vue'
import TodoEditWindow from './TodoEditWindow.vue'
import TemplateNewWindow from './TemplateNewWindow.vue'
import TemplateEditWindow from './TemplateEditWindow.vue'
import DetailWindow from './DetailWindow.vue'
import HistoryWindow from './HistoryWindow.vue'
import SettingsWindow from './SettingsWindow.vue'
import BubbleWindow from './BubbleWindow.vue'
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

/** 缩放呈现（用户 2026-10-14：缩放时文字跟着缩放）——根元素固定基准设计尺寸、zoom=组缩放：
 * 布局恒在基准坐标系（含输入框 4:3），整层等比渲染恰好填满窗口，文字/控件随缩放等大
 * （旧机制=窗口变、文字 reflow 不变）。角标在本层之外（WPF P10：角标不进缩放内容） */
const rootStyle = computed(() => ({
  width: `${CHILD_SIZES[props.kind].w}px`,
  height: `${CHILD_SIZES[props.kind].h}px`,
  zoom: String(scale.value)
}))

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
  // 照原型 bindGroupResize/setGroupScale：比例缩放；上限 1.6/屏幕-24/下限 0.7/步进 0.05
  const base = CHILD_SIZES[props.kind]
  const next = clampChildGroupScale(gripStart.scale + (e.clientX - gripStart.x) / 500, base.w, base.h, rendererWorkArea())
  if (next === scale.value) return
  void store.setChildScale(group.value, next)
  // 真窗口尺寸变化 = 基准 × 组缩放（内容流式 reflow，无 zoom）
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
    case 'bubble':
      return BubbleWindow
    default:
      return null
  }
})
</script>

<template>
  <div v-if="page" class="child-host">
    <div
      :key="kind + (id ?? '')"
      class="child-root"
      :style="rootStyle"
      data-testid="child-root"
      :data-theme="store.uiState.theme"
    >
      <component :is="page" :item-id="id" />
      <!-- 缩放角标在卡面坐标系内（absolute+relative 锚卡片右下，随缩放恒贴角）；
           自身 zoom=1/k 反向抵消 → 大小恒 16px（WPF P10：角标不随内容缩放）；
           气泡纯展示不可缩放：不渲染缩放角标（用户报告气泡右下角出现角标） -->
      <span
        v-if="kind !== 'bubble'"
        class="child-grip"
        :style="{ zoom: String(1 / scale) }"
        title="拖动缩放（同组窗口共享大小设置）"
        @pointerdown.stop.prevent="onGripDown"
      />
    </div>
  </div>
</template>

<style scoped>
/* 缩放宿主：铺满窗口 */
.child-host {
  width: 100%;
  height: 100%;
}

/* 缩放角（决策#16：与窗口圆角同弧度的弧线，内缩 2px 不贴边——二轮反馈）；
 * absolute（非 fixed）：锚 .child-root 卡面盒，任意组缩放下恒贴卡片右下内角 */
.child-grip {
  position: absolute;
  right: 2px;
  bottom: 2px;
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
  border-bottom-right-radius: 8px; /* 与窗口 10px 圆角同心（内缩 2px） */
}

.child-grip:hover {
  opacity: 1;
}
</style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
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

/** 缩放呈现（用户 2026-10-14 文字跟随；2026-10-15 手感迭代）——zoom 从视口反推（单一通道，
 * 主窗"缩放抖动根治"同款模式）：resizeSelf 改窗口 → resize 事件同帧重算 zoom，文字与窗框
 * 永远同帧（消灭 store 广播 vs 窗口 resize 双通道错帧=忽大忽小）；视口含 OS 宽度膨胀，
 * 反推值恰好让内容铺满窗口。store 值仅作持久化，不再驱动视觉 */
const base = CHILD_SIZES[props.kind]
const zoomValue = ref(window.innerWidth / base.w)
function syncZoomFromViewport(): void {
  const k = window.innerWidth / base.w
  if (Number.isFinite(k) && k > 0.1 && k <= 3) zoomValue.value = k
}
const rootStyle = computed(() => ({
  width: `${base.w}px`,
  height: `${base.h}px`,
  zoom: String(zoomValue.value),
  // 角标描边恒 2px 物理宽（用户 2026-10-15：线粗不随缩放变）——设计描边=2px÷k，渲染回来 =2px
  '--grip-stroke': `calc(2px / ${zoomValue.value})`
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

let gripStart: { x: number; y: number; scale: number } | null = null
let lastScaleSentAt = 0
let pendingScale: number | null = null

function onGripDown(e: PointerEvent): void {
  gripStart = { x: e.clientX, y: e.clientY, scale: zoomValue.value }
  lastScaleSentAt = 0
  pendingScale = null
  window.addEventListener('pointermove', onGripMove)
  window.addEventListener('pointerup', onGripUp)
}

function onGripMove(e: PointerEvent): void {
  if (gripStart === null) return
  // 任意角度可缩放（用户 2026-10-15）：垂直位移按窗高/宽比折算为等效水平位移；
  // 灵敏度保持原口径（水平 500px = 档位 +1.0）；钳制连续无量化（量化=0.05 一跳的手感已去除）
  const dxEff = e.clientX - gripStart.x + (e.clientY - gripStart.y) * (base.h / base.w)
  const next = clampChildGroupScale(gripStart.scale + dxEff / 500, base.w, base.h, rendererWorkArea())
  pendingScale = next
  // 30ms 节流（对齐主窗缩放手势）；resizeSelf 先行：视觉走 resize 同帧通道，
  // 且主进程据此窗口把紧随的提交走免落盘通道（热路径不做 I/O）
  const now = performance.now()
  if (now - lastScaleSentAt >= 30) {
    lastScaleSentAt = now
    void getApi().resizeSelf({ width: Math.round(base.w * next), height: Math.round(base.h * next) })
    void store.setChildScale(group.value, next)
  }
}

function onGripUp(): void {
  if (pendingScale !== null) {
    // 终值正式落盘（拖拽期间走的免落盘通道不持久化）
    void store.setChildScale(group.value, pendingScale).then(() => getApi().flush())
  }
  pendingScale = null
  gripStart = null
  window.removeEventListener('pointermove', onGripMove)
  window.removeEventListener('pointerup', onGripUp)
}

onMounted(() => window.addEventListener('resize', syncZoomFromViewport))
onUnmounted(() => window.removeEventListener('resize', syncZoomFromViewport))

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
      <!-- 缩放角标完全活在卡面坐标系（无反向 zoom）：内缩 2、弧度 8、尺寸 16 全为设计值随缩放走，
           与卡片圆角（10×k）在每个档位严格同心（10k−2k=8k）→ 相对位置/弧度恒定（用户 2026-10-15）。
           同层渲染不存在 P10 滞后（zoom 同帧重绘）；气泡纯展示不可缩放：不渲染角标 -->
      <span
        v-if="kind !== 'bubble'"
        class="child-grip"
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
  /* 描边=var(--grip-stroke)（2px÷k）：缩放层内渲染恒 2px 物理宽（线粗不随缩放变）；
     位置/弧度/尺寸仍为设计值×k 与卡片圆角同心 */
  border-right: var(--grip-stroke, 2px) solid var(--muted);
  border-bottom: var(--grip-stroke, 2px) solid var(--muted);
  border-bottom-right-radius: 8px; /* 与窗口 10px 圆角同心（内缩 2px） */
}

.child-grip:hover {
  opacity: 1;
}
</style>

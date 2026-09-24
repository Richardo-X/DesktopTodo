<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import { TUCK_BAR_HEIGHT } from '../core/constants'
import { effectiveClusterScale } from '../core/utils/cluster-layout'
import HomePanel from './HomePanel.vue'
import QuickPanel from './QuickPanel.vue'
import DonePanel from './DonePanel.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const store = useAppStore()
const ui = useUiStore()

const tucked = computed(() => ui.tuck.tucked)

/** 渲染层工作区（happy-dom/测试环境兜底 1920×1080） */
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

/** 簇缩放：与主进程 syncMainBounds 同一钳制口径（决策#23），zoom 与窗口 bounds 1:1（决策#7） */
const clusterScale = computed(() =>
  effectiveClusterScale(store.uiState.clusterScale, store.uiState, rendererWorkArea())
)

/** zoom 容器尺寸=视口÷缩放：zoom 会把布局尺寸再乘一次，否则 scale≠1 时内容溢出视口产生页面滚动条 */
const clusterStyle = computed(() => {
  const s = clusterScale.value
  return { zoom: String(s), width: `calc(100vw / ${s})`, height: `calc(100vh / ${s})` }
})

onMounted(() => {
  void store.init()
  ui.initSystemEvents()
  document.addEventListener('mouseleave', ui.mouseLeave)
  document.addEventListener('mouseenter', ui.mouseEnter)
})

onUnmounted(() => {
  document.removeEventListener('mouseleave', ui.mouseLeave)
  document.removeEventListener('mouseenter', ui.mouseEnter)
})
</script>

<template>
  <div
    class="stage"
    :data-theme="store.uiState.theme"
    :class="{ tucked }"
    @mouseenter="ui.mouseEnter"
  >
    <div v-if="!tucked" class="cluster" :style="clusterStyle">
      <QuickPanel v-if="store.uiState.quickVisible" data-testid="quick-panel" />
      <HomePanel />
      <DonePanel v-if="store.uiState.doneVisible" data-testid="done-panel" />
    </div>
    <div v-else class="tuck-bar" :style="{ height: TUCK_BAR_HEIGHT + 'px' }" />
    <ConfirmDialog />
  </div>
</template>

<style scoped>
/* ===== 设计令牌（原型 v3.1.2 :root，决策#6/#21） ===== */
.stage {
  --accent: #0a63b8;
  --accent-hover: #0d6fc9;
  --accent-fg: #ffffff;
  --win-bg: rgba(243, 246, 251, 0.94);
  --card: rgba(255, 255, 255, 0.7);
  --card-border: rgba(0, 0, 0, 0.09);
  --field: rgba(255, 255, 255, 0.9);
  --text: #1c1c1c;
  --muted: #666;
  --faint: #9a9a9a;
  --hover: rgba(0, 0, 0, 0.05);
  --active: rgba(0, 0, 0, 0.09);
  --btn: rgba(255, 255, 255, 0.75);
  --btn-border: rgba(0, 0, 0, 0.13);
  --btn-hover: #ffffff;
  --bubble-bg: #ffffff;
  --bubble-fg: #222;
  --danger: #c42b1c;
  --overdue: #d13438;
  --cb-border: #8a8a8a;
  --shadow-main: 0 18px 60px rgba(5, 15, 35, 0.5);
  --shadow-side: 0 4px 12px rgba(5, 15, 35, 0.22); /* 决策#19：两侧小阴影，不盖中间主窗 */

  width: 100vw;
  height: 100vh;
  overflow: hidden;
  color: var(--text);
  font-family: 'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', sans-serif;
}

.stage[data-theme='night'] {
  --accent: #4cc2ff;
  --accent-hover: #6fcdff;
  --accent-fg: #06131c;
  --win-bg: rgba(30, 30, 33, 0.96);
  --card: rgba(255, 255, 255, 0.055);
  --card-border: rgba(255, 255, 255, 0.11);
  --field: rgba(255, 255, 255, 0.07);
  --text: #f0f0f0;
  --muted: #a4a4a4;
  --faint: #7a7a7a;
  --hover: rgba(255, 255, 255, 0.06);
  --active: rgba(255, 255, 255, 0.12);
  --btn: rgba(255, 255, 255, 0.08);
  --btn-border: rgba(255, 255, 255, 0.15);
  --btn-hover: rgba(255, 255, 255, 0.16);
  --bubble-bg: #3a3a3c;
  --bubble-fg: #f0f0f0;
  --cb-border: #9a9a9a;
}

/* ===== 簇：基准尺寸 + zoom（容器尺寸=视口÷zoom，由 clusterStyle 内联绑定；
 * 主窗口 bounds 由主进程按同源 clusterBounds 设置） ===== */
.cluster {
  display: flex;
  align-items: flex-start; /* 顶边对齐 */
  gap: 6px; /* 决策#20 */
}

/* ===== 面板外观（原型 .win） ===== */
.stage :deep(.panel) {
  background: var(--win-bg);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  box-shadow: var(--shadow-main);
  color: var(--text);
  overflow: hidden;
  backdrop-filter: blur(30px) saturate(1.2);
}

/* 决策#19：两侧面板小阴影 */
.stage :deep(.side-panel) {
  box-shadow: var(--shadow-side);
}

/* 面板基准尺寸（决策#4/#18/#20，cluster-layout 同源） */
.stage :deep(.home-panel) {
  width: 470px;
  height: 640px;
  flex: none;
}

.stage :deep(.side-panel) {
  width: 310px;
  height: 640px;
  flex: none;
}

/* ===== 缩进小条（约 12px，划过弹出） ===== */
.tuck-bar {
  width: 200px;
  border-radius: 8px;
  background: var(--win-bg);
  box-shadow: var(--shadow-side);
  margin: 0 auto;
}
</style>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import { TUCK_BAR_HEIGHT, TUCK_BAR_WIDTH } from '../core/constants'
import { BASE_PANEL, visibleClusterWidth, effectiveClusterScale } from '../core/utils/cluster-layout'
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
  effectiveClusterScale(store.uiState.clusterScale, rendererWorkArea(), store.uiState.quickVisible, store.uiState.doneVisible)
)

/** zoom 容器尺寸=可见内容基准÷缩放（+2px 透明余量防取整裁切圆角）：
 * zoom 会把布局尺寸再乘一次，容器按内容基准定尺寸后 zoom×尺寸=真窗口尺寸，无溢出无裁切。
 * 四轮定稿 B：动态窗口——宽度只含可见面板（隐藏面板 v-if 移出，不再占位） */
const clusterStyle = computed(() => {
  const s = clusterScale.value
  const baseW = visibleClusterWidth(store.uiState.quickVisible, store.uiState.doneVisible)
  return { zoom: String(s), width: `calc(${baseW}px / ${s} + 2px)`, height: `calc(${BASE_PANEL.height}px / ${s} + 2px)` }
})

onMounted(() => {
  void store.init()
  ui.initSystemEvents()
  // 四轮二修：缩进弹出/缩回由主进程光标轮询权威驱动（onCursorInside）——
  // DOM mouseenter/mouseleave 会因窗口尺寸变化产生伪事件（闪烁/提前缩回根源），不再绑定
})
</script>

<template>
  <div
    class="stage"
    :data-theme="store.uiState.theme"
    :class="{ tucked }"
  >
    <div v-if="!tucked" class="cluster" :style="clusterStyle">
      <!-- 四轮定稿 B：动态窗口——隐藏面板 v-if 移出（不再 visibility 占位），窗口 bounds=可见面板并集 -->
      <QuickPanel v-if="store.uiState.quickVisible" data-testid="quick-panel" />
      <HomePanel />
      <DonePanel v-if="store.uiState.doneVisible" data-testid="done-panel" />
    </div>
    <!-- 三轮8.2-1：缩进胶囊（160×6 可见 + 12px 热区）；悬停弹出由主进程光标轮询判定 -->
    <div
      v-else
      class="tuck-bar"
      :style="{ height: TUCK_BAR_HEIGHT + 'px', width: TUCK_BAR_WIDTH + 'px' }"
      title="鼠标移到此条上弹出组件"
    />
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

/* ===== 面板外观（原型 .win）=====
 * 三轮反馈（8.2-5/8.2-7）：无投影（用户要求去除窗口阴影；投影还会把面板间隙填成整块深色）；
 * 无 backdrop-filter（透明窗口上的模糊合成是夜晚黑块根因之一，半透明底色仍透出壁纸） */
.stage :deep(.panel) {
  background: var(--win-bg);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  color: var(--text);
  overflow: hidden;
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

/* ===== 缩进胶囊（三轮8.2-1 用户定稿：160×6 半透明圆角胶囊，无阴影；12px 热区随窗口） ===== */
.tuck-bar {
  border-radius: 99px;
  margin: 0 auto;
  cursor: pointer;
}

/* 可见胶囊：热区中央 6px 高细条，随主题淡化 */
.tuck-bar::after {
  content: '';
  display: block;
  height: 6px;
  margin-top: 3px;
  border-radius: 99px;
  background: var(--tuck-bar-bg, rgba(255, 255, 255, 0.55));
  transition: background 0.15s;
}

.tuck-bar:hover::after {
  background: var(--tuck-bar-hover, rgba(255, 255, 255, 0.85));
}

.stage[data-theme='night'] .tuck-bar {
  --tuck-bar-bg: rgba(255, 255, 255, 0.28);
  --tuck-bar-hover: rgba(255, 255, 255, 0.5);
}
</style>

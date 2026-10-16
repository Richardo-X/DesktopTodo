<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { TUCK_BAR_HEIGHT, TUCK_BAR_WIDTH } from '../core/constants'
import { getApi } from '../services/api'

/**
 * 缩进白条独立窗（2026-10-17 §11.K 步1）：白条从"主窗内元素"搬进独立小窗。
 * 窗口=热区（160×6 请求；系统最小窗高钳制出的余高由主进程挂到屏幕上方，屏内可见区=热区本身），
 * 白条元素钉客户端底缘=屏幕可见条。命中=元素 mouseenter（系统真实命中——被遮挡天然不弹），
 * 经主进程中继到主窗渲染层状态机（等效原主窗内白条元素 mouseenter）。
 * 2026-10-17 用户裁定：点击弹出途径移除（白条只认"碰"）。
 * 主题经 store.init 读 uiState.theme，并随 stateUpdated 广播实时跟随。
 */
const store = useAppStore()

function onHit(): void {
  getApi().barHit()
}

onMounted(() => {
  void store.init()
})
</script>

<template>
  <div class="stage" :data-theme="store.uiState.theme">
    <div
      class="tuck-bar"
      :style="{ height: TUCK_BAR_HEIGHT + 'px', width: TUCK_BAR_WIDTH + 'px' }"
      title="鼠标移入弹出组件"
      @mouseenter="onHit"
    />
  </div>
</template>

<style scoped>
/* 白条窗：只有胶囊本身，不依赖面板色板（与三窗 PanelWindow 胶囊样式同源） */
.stage {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
}

/* 元素钉客户端底缘：系统最小窗高撑出的余高在元素上方（屏幕外，不可命中） */
.tuck-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  margin: 0 auto;
  border-radius: 99px;
  cursor: pointer;
}

.tuck-bar::after {
  content: '';
  display: block;
  height: 3px; /* 厚度=热区一半（2026-10-16 用户裁定减半，原 6px） */
  margin-top: 1.5px; /* 热区内垂直居中 */
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

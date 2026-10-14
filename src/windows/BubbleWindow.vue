<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { getApi } from '../services/api'

/** 四轮：气泡独立小窗口页面（?win=bubble）——纯展示、鼠标穿透、随内容自适应尺寸 */
const text = ref('')
const theme = ref<'day' | 'night'>('day')
const side = ref<'left' | 'right'>('left')
const rootEl = ref<HTMLElement | null>(null)

onMounted(() => {
  // 主题同步（用户 2026-10-14：切换昼夜后首次弹出先闪旧主题）——主窗提交即广播到全部窗口
  // （含本气泡窗），主题即时跟随，不再依赖显示时 payload 的单点传递（呈现竞态=首闪旧样式）
  void getApi().onStateUpdated((d) => {
    theme.value = d.uiState.theme === 'night' ? 'night' : 'day'
  })
  void getApi().onBubblePayload((p) => {
    text.value = p.text
    theme.value = p.theme
    side.value = p.side
    void nextTick(() => {
      // 常驻透明窗口 visibility=visible 持续产帧；等一帧确保新内容已渲染上屏再回包，
      // 主进程 setBounds+透明度恢复时首帧即新内容
      requestAnimationFrame(() => {
        const el = rootEl.value
        if (el) void getApi().bubbleResize({ w: el.offsetWidth, h: el.offsetHeight })
      })
    })
  })
})
</script>

<template>
  <div ref="rootEl" class="gbubble" :class="[theme, side]" data-testid="content-bubble">
    <span class="bubble-text">{{ text }}</span>
  </div>
</template>

<style scoped>
/* 照原型 #gbubble 规格；窗口即气泡容器（主进程按内容尺寸 setBounds）。
 * fit-content 让 offsetWidth/Height=内容真实尺寸（原 100% 恒量得窗口尺寸，收缩从未生效）；
 * min/max 与主进程 resizeBubble 钳制同限——盒恒恰好填满窗口；max-width=原型 BUBBLE_MAX_W 300 */
.gbubble {
  box-sizing: border-box;
  width: fit-content;
  min-width: 80px;
  max-width: 300px;
  height: auto;
  min-height: 30px;
  max-height: 160px;
  padding: 9px 12px;
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(10, 20, 40, 0.28); /* L1（v3.4）：投影色调化（纯黑→蓝黑） */
  font-family: 'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', sans-serif;
  font-size: 12px; /* L2 字阶 label 12（原 12.5） */
  line-height: 1.5; /* L2：正文行高统一 1.5（原 1.7） */
  word-break: break-all;
  white-space: normal;
  overflow: hidden;
}

.gbubble.day {
  background: #ffffff;
  color: #222222;
  border: 1px solid rgba(0, 0, 0, 0.09);
}

.gbubble.night {
  background: #3a3a3c;
  color: #f0f0f0;
  border: 1px solid rgba(255, 255, 255, 0.11);
}

/* 箭头：左弹出时指向右（行在气泡右侧）；右弹出时指向左 */
.gbubble::after {
  content: '';
  position: absolute;
  right: -6px;
  top: 50%;
  margin-top: -6px;
  border: 6px solid transparent;
  border-left-color: #ffffff;
}

.gbubble.day::after {
  border-left-color: #ffffff;
}

.gbubble.night::after {
  border-left-color: #3a3a3c;
}

.gbubble.side-right::after {
  right: auto;
  left: -6px;
  border-left-color: transparent;
  border-right-color: #ffffff;
}

.gbubble.side-right.night::after {
  border-right-color: #3a3a3c;
}
</style>

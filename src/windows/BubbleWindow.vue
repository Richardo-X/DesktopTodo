<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { getApi } from '../services/api'

/** 四轮：气泡独立小窗口页面（?win=bubble）——纯展示、鼠标穿透、随内容自适应尺寸 */
const text = ref('')
const theme = ref<'day' | 'night'>('day')
const side = ref<'left' | 'right'>('left')
const rootEl = ref<HTMLElement | null>(null)

onMounted(() => {
  void getApi().onBubblePayload((p) => {
    text.value = p.text
    theme.value = p.theme
    side.value = p.side
    void nextTick(() => {
      // 量实际内容尺寸回传主进程，窗口收缩贴合气泡（位置按 side 重排由主进程完成）
      const el = rootEl.value
      if (el) void getApi().bubbleResize({ w: el.offsetWidth, h: el.offsetHeight })
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
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.25);
  font-family: 'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', sans-serif;
  font-size: 12.5px;
  line-height: 1.7;
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

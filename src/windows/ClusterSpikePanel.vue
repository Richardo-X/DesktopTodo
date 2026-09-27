<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { getApi } from '../services/api'

/**
 * 批次 A spike 面板（HANDOFF §9.5）：三窗分离技术验证占位页。
 * 标题栏不做 app-region 原生拖动——pointerdown 通知主进程开始光标轮询整体拖动，
 * window pointerup 结束。三个实例由 DTODO_CLUSTER_SPIKE=1 的主进程分别创建（?panel=quick|main|done）。
 */
const props = defineProps<{ panel: 'quick' | 'main' | 'done' }>()

const TITLES: Record<'quick' | 'main' | 'done', string> = {
  quick: '快捷添加',
  main: '桌面待办',
  done: '已完成'
}

function onDragStart(): void {
  void getApi().clusterDragStart()
}

function onDragEnd(): void {
  void getApi().clusterDragEnd()
}

onMounted(() => window.addEventListener('pointerup', onDragEnd))
onUnmounted(() => window.removeEventListener('pointerup', onDragEnd))
</script>

<template>
  <section class="win spike" :class="`p-${props.panel}`" data-testid="spike-panel">
    <header class="titlebar" data-testid="spike-titlebar" @pointerdown.prevent="onDragStart">
      <span class="tb-title" data-testid="spike-title">{{ TITLES[props.panel] }}</span>
    </header>
    <div class="body">
      <p class="line">批次 A · 三窗分离技术验证</p>
      <p class="sub">拖动任一标题栏 = 三窗整体移动（主进程光标轮询同帧 setBounds）</p>
    </div>
  </section>
</template>

<style scoped>
.win {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(243, 246, 251, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  overflow: hidden;
  color: #1c1c1c;
  font-family: 'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', sans-serif;
}

.titlebar {
  height: 36px;
  flex: none;
  display: flex;
  align-items: center;
  padding-left: 12px;
  user-select: none;
  cursor: move;
}

.tb-title {
  font-size: 12.5px;
  color: #666;
}

.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 16px;
  text-align: center;
}

.line {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.sub {
  margin: 0;
  font-size: 11.5px;
  color: #9a9a9a;
}
</style>

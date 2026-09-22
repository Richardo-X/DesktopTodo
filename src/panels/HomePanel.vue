<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import TodoRow from '../components/TodoRow.vue'
import BatchBar from '../components/BatchBar.vue'
import { createDragSort } from '../components/useDragSort'
import { fmtTime, fmtDateCN } from '../core/utils/date'
import { getApi } from '../services/api'

const store = useAppStore()
const ui = useUiStore()

// 长按手柄拖动排序（批量模式下禁用）
const drag = createDragSort({
  enabled: () => !ui.batchMode,
  rowCount: () => store.todos.length,
  onDrop: (from, to) => {
    void store.reorderTodos(from, to)
  }
})

function isDragging(i: number): boolean {
  return drag.state.draggingIndex === i
}

function isOver(i: number): boolean {
  return drag.state.overIndex === i && drag.state.draggingIndex !== null && drag.state.draggingIndex !== i
}

// 顶部时钟：每秒刷新（PRD §3）
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})
onUnmounted(() => {
  if (timer !== undefined) clearInterval(timer)
})

const timeText = computed(() => fmtTime(now.value, store.settings.hour12))
const dateText = computed(() => fmtDateCN(now.value))
const countText = computed(() => `${store.todos.length}/${store.settings.maxItems}`)

onMounted(() => {
  window.addEventListener('pointermove', drag.handleMove)
  window.addEventListener('pointerup', drag.handleUp)
})

onUnmounted(() => {
  window.removeEventListener('pointermove', drag.handleMove)
  window.removeEventListener('pointerup', drag.handleUp)
})

function toggleTheme(): void {
  void store.updateUiState({ theme: store.uiState.theme === 'day' ? 'night' : 'day' })
}

function toggleTuckLock(): void {
  void store.updateUiState({ tuckLock: !store.uiState.tuckLock })
}

function toggleTopMost(): void {
  void store.updateUiState({ topMost: !store.uiState.topMost })
}

function toggleQuick(): void {
  void store.updateUiState({ quickVisible: !store.uiState.quickVisible })
}

function toggleDone(): void {
  void store.updateUiState({ doneVisible: !store.uiState.doneVisible })
}

// 勾选完成：先播放离场动画（250ms）再移入已完成（PRD §5.2 动画反馈）
const leavingId = ref<string | null>(null)

async function onComplete(id: string): Promise<void> {
  if (ui.batchMode) return
  leavingId.value = id
  setTimeout(() => {
    void store.completeTodo(id).then(() => {
      if (leavingId.value === id) leavingId.value = null
    })
  }, 250)
}
</script>

<template>
  <section class="panel home-panel" data-testid="home-panel">
    <header class="titlebar">
      <span class="title">待办</span>
      <div class="toolbar">
        <button data-testid="tb-theme" class="tb" title="日/夜主题切换" @click="toggleTheme">
          {{ store.uiState.theme === 'day' ? '☾' : '☀' }}
        </button>
        <button data-testid="tb-settings" class="tb" title="设置" @click="ui.openChild('settings')">⚙</button>
        <button
          data-testid="tb-tucklock"
          class="tb"
          :class="{ active: store.uiState.tuckLock }"
          title="缩进锁定"
          @click="toggleTuckLock"
        >
          ⇤
        </button>
        <button
          data-testid="tb-topmost"
          class="tb"
          :class="{ active: store.uiState.topMost }"
          title="窗口置顶"
          @click="toggleTopMost"
        >
          ↑
        </button>
        <button data-testid="tb-minimize" class="tb" title="缩小到通知栏" @click="getApi().minimizeToTray()">×</button>
      </div>
    </header>

    <div class="clock">
      <div class="clock-time" data-testid="clock-time">{{ timeText }}</div>
      <div class="clock-date" data-testid="clock-date">{{ dateText }}</div>
    </div>

    <div class="ops">
      <button class="op" data-testid="op-quick-toggle" @click="toggleQuick">快捷添加</button>
      <span class="op" data-testid="op-count">{{ countText }}</span>
      <button class="op" data-testid="op-batch" @click="ui.enterBatch('todos')">批量删除</button>
      <span class="spacer" />
      <button class="op" data-testid="op-done-toggle" @click="toggleDone">已完成</button>
      <button class="op new" data-testid="op-new" @click="ui.openChild('todo-new')">＋</button>
    </div>

    <ul v-if="store.todos.length > 0" class="todo-list">
      <li v-for="(t, i) in store.todos" :key="t.id">
        <TodoRow
          :item="t"
          :batch-mode="ui.batchMode"
          :selected="ui.selectedIds.includes(t.id)"
          :leaving="leavingId === t.id"
          :dragging="isDragging(i)"
          :over="isOver(i)"
          @toggle="onComplete(t.id)"
          @edit="ui.openChild('todo-edit', t.id)"
          @select-toggle="ui.toggleSelect(t.id)"
          @handle-down="drag.handleDown(i, $event)"
        />
      </li>
    </ul>
    <div v-else class="empty" data-testid="empty-state">
      <p>今日做点什么好呢</p>
      <p>点击右上角 ＋ 新建一条待办</p>
    </div>

    <BatchBar v-if="ui.batchTarget === 'todos'" target="todos" />
  </section>
</template>

<style scoped>
.home-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
}

.title {
  font-size: 13px;
  font-weight: 600;
  opacity: 0.75;
}

.toolbar {
  display: flex;
  gap: 4px;
}

.tb {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: inherit;
}

.tb:hover,
.tb.active {
  background: rgba(47, 111, 237, 0.18);
}

.clock {
  text-align: center;
  padding: 10px 0 6px;
}

.clock-time {
  font-size: 34px;
  font-weight: 300;
  letter-spacing: 1px;
}

.clock-date {
  font-size: 13px;
  opacity: 0.7;
  margin-top: 2px;
}

.ops {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 8px;
}

.op {
  border: none;
  background: transparent;
  font-size: 12px;
  color: inherit;
  opacity: 0.8;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 6px;
}

.op:hover {
  background: rgba(47, 111, 237, 0.14);
  opacity: 1;
}

.op.new {
  font-size: 16px;
  font-weight: 700;
}

.spacer {
  flex: 1;
}

.todo-list {
  list-style: none;
  margin: 0;
  padding: 0 8px 10px;
  overflow-y: auto;
  flex: 1;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  opacity: 0.6;
  font-size: 13px;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import { fmtTime } from '../core/utils/date'
import { useOverlayThumb } from '../components/useOverlayThumb'
import { createDblClickGuard } from '../components/useDblClickGuard'

const store = useAppStore()
const ui = useUiStore()

const title = computed(() => `已完成 · ${store.completed.length}`)

const sorted = computed(() => {
  const list = [...store.completed]
  list.sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''))
  if (store.settings.doneSort === 'desc') list.reverse()
  return list
})

const error = ref('')

// 8.2-9 连点保护窗：反选框点击后短时间内忽略行双击
const dblGuard = createDblClickGuard()

// 自绘悬浮滚动条（二轮反馈）：滑块位于右缘专用带，行宽不受影响
const listEl = ref<HTMLElement | null>(null)
const thumb = useOverlayThumb(listEl)

async function toggleBack(id: string): Promise<void> {
  dblGuard.mark()
  const r = await store.returnToActive(id)
  error.value = r.ok ? '' : r.reason === 'limit-reached' ? '待办数量已达上限' : '退回失败'
}

function onRowDblClick(id: string): void {
  if (dblGuard.blocked()) return
  void ui.openChild('detail', id)
}

function toggleSort(): void {
  void store.updateSettings({ doneSort: store.settings.doneSort === 'asc' ? 'desc' : 'asc' })
}

/** 完成时间显示精确到分钟（决策#2） */
function fmtDone(iso: string | null): string {
  if (!iso) return ''
  return fmtTime(new Date(iso), store.settings.hour12)
}
</script>

<template>
  <section class="panel side-panel" data-testid="done-panel" :class="{ frozen: ui.batchMode }">
    <!-- 决策#8：标题栏拖动；× 隐藏面板 -->
    <header class="titlebar">
      <span class="tb-title">已完成</span>
      <div class="win-actions right"></div>
    </header>

    <div class="win-body">
      <div class="panel-head">
        <span class="panel-title" data-testid="done-title">{{ title }}</span>
        <button
          class="icon-btn"
          data-testid="done-sort"
          :title="store.settings.doneSort === 'asc' ? '当前正序，点击切换为倒序' : '当前倒序，点击切换为正序'"
          @click="toggleSort"
        >
          <!-- 原型同款排序图标（升序/降序） -->
          <svg
            v-if="store.settings.doneSort === 'asc'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M7 20V6M7 6l-3 3M7 6l3 3" />
            <path d="M13 5h8M13 10h6M13 15h4" />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M7 4v14M7 18l-3-3M7 18l3-3" />
            <path d="M13 5h8M13 10h6M13 15h4" />
          </svg>
        </button>
      </div>

      <p v-if="error" class="error" data-testid="done-error">{{ error }}</p>

      <!-- 自绘悬浮滚动条（二轮反馈）：原生滚动条隐藏，滑块绘制在右缘专用带 -->
      <div class="list-wrap">
        <div v-if="store.completed.length > 0" ref="listEl" class="scroll hide-native-bar">
          <div
            v-for="t in sorted"
            :key="t.id"
            class="todo-row"
            data-testid="done-row"
            :data-id="t.id"
            @dblclick="onRowDblClick(t.id)"
          >
            <button
              type="button"
              class="checkbox checked"
              data-testid="done-check"
              title="点击退回待办"
              @click.stop="toggleBack(t.id)"
              @dblclick.stop
            >
              <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </button>
            <span class="content ellipsis">{{ t.content }}</span>
            <span v-if="t.overdue" class="tag overdue" data-testid="done-overdue-tag">逾期</span>
            <span class="done-time" data-testid="done-time">{{ fmtDone(t.completedAt) }}</span>
          </div>
        </div>
        <!-- 决策#18：空状态文案与样式（17px、字距 5px、水平垂直居中） -->
        <div v-else class="panel-empty empty-big" data-testid="done-empty">今天也要继续加油</div>

        <!-- 自绘滑块：溢出时显示于右缘专用带，可拖拽 -->
        <div
          v-show="thumb.state.visible"
          class="list-thumb"
          data-testid="done-thumb"
          :style="{ top: thumb.state.top + 'px', height: thumb.state.height + 'px' }"
          @pointerdown="thumb.onThumbPointerDown"
        />
      </div>

      <footer class="foot">
        <button class="btn block" data-testid="done-history" @click="ui.openChild('history')">
          <!-- L1.5 图标统一：🕘 emoji 换原型 I.clock SVG（13px 随 .btn svg） -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span>历史记录</span>
        </button>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.side-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ===== 标题栏（36px 拖动 + × 隐藏面板） ===== */
.titlebar {
  height: 36px;
  flex: none;
  display: flex;
  align-items: center;
  padding-left: 12px;
  user-select: none;
}

.tb-title {
  font-size: 12.5px;
  color: var(--muted);
  pointer-events: none;
}

.win-actions {
  margin-left: auto;
  display: flex;
  height: 100%;
}

.wbtn {
  width: 42px;
  height: 100%;
  border: none;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  font-size: 13px;
}

.wbtn:hover {
  background: var(--danger);
  color: #fff;
}

.win-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 2px 14px 24px;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px 8px;
  flex: none;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  margin-right: auto;
}

.icon-btn {
  width: 32px; /* L1.5 规格统一：图标按钮 32×32（原型 .icon-btn 全局单一规格；原 26px 为孤例） */
  height: 32px;
  padding: 0;
  border: 1px solid var(--btn-border);
  border-radius: 6px;
  background: var(--btn);
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  background: var(--btn-hover);
}

.icon-btn svg {
  width: 16px;
  height: 16px;
}

.error {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--danger);
}

.scroll {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px;
}

/* 空列表文案垂直居中（对齐原型 v3.4：.panel-empty 以 flex:1 在滚动区内居中；
 * 应用侧空态挂在 .list-wrap 直下——补 flex 列上下文使 flex:1 生效，
 * 原 block 上下文下 flex:1 失效、文案贴在列表区顶部） */
.list-wrap {
  display: flex;
  flex-direction: column;
}

.todo-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 8px;
  background: var(--card);
  border: 1px solid var(--card-border);
  cursor: default;
  /* L1（v3.4）：行 hover 过渡同主窗待办行 */
  transition:
    transform 0.15s var(--ease-out),
    box-shadow 0.15s var(--ease-out),
    background-color 0.15s var(--ease-out);
}

.todo-row:hover {
  border-color: var(--accent);
  background: var(--hover);
}

.checkbox {
  flex: none;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1.5px solid var(--cb-border);
  border-radius: 6px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
  cursor: pointer;
}

.checkbox:hover {
  filter: brightness(1.1);
}

.checkbox svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.content {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  line-height: 1.5;
  text-align: left;
}

.ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tag {
  flex: none;
  font-size: 10px;
  line-height: 15px;
  padding: 0 6px;
  border-radius: 99px;
  border: 1px solid currentColor;
  opacity: 0.95;
}

.tag.overdue {
  color: var(--overdue);
}

.done-time {
  flex: none;
  font-size: 11px;
  color: var(--faint);
}

/* 决策#18：空状态 17px、字距 5px、窗口内水平垂直居中 */
.panel-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--faint);
  font-size: 12px;
  text-align: center;
}

.panel-empty.empty-big {
  font-size: 17px;
  color: var(--muted);
  letter-spacing: 5px;
}

.foot {
  flex: none;
  margin-top: 8px;
}

.btn.block {
  width: 100%;
  height: 30px;
  border: 1px solid var(--btn-border);
  border-radius: 6px;
  background: var(--btn);
  color: inherit;
  font-size: 12.5px;
  cursor: pointer;
  display: inline-flex; /* L1.5：带图标按钮（clock+文字）居中 */
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn.block svg {
  width: 13px;
  height: 13px;
  flex: none;
}

.btn.block:hover {
  background: var(--btn-hover);
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import BatchBar from '../components/BatchBar.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { getApi } from '../services/api'
import { useOverlayThumb } from '../components/useOverlayThumb'
import { shiftDateKey, localDateKey } from '../core/utils/date'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

const store = useAppStore()
const ui = useUiStore()

const todayKey = localDateKey(new Date())
// 历史口径（用户裁定）：打开默认定位「当天的前一天」；前一天为空就显示空
const currentDate = ref(shiftDateKey(todayKey, -1))
const exportFrom = ref('')
const exportTo = ref('')
const exportError = ref('')

// 自绘悬浮滚动条（二轮反馈）：滑块位于右缘专用带，行宽不受影响
const listEl = ref<HTMLElement | null>(null)
const thumb = useOverlayThumb(listEl)

const earliest = computed(() => {
  const keys = Object.keys(store.archive).sort()
  return keys[0] ?? todayKey
})

const items = computed(() => {
  // 决策#15：历史记录只显示已结算归档的记录（当天完成在"已完成"窗口，不在此合并）
  return store.archive[currentDate.value] ?? []
})
const dateLabel = computed(() => currentDate.value)
const isToday = computed(() => currentDate.value === todayKey)

function prevDay(): void {
  currentDate.value = shiftDateKey(currentDate.value, -1)
}

function nextDay(): void {
  currentDate.value = shiftDateKey(currentDate.value, 1)
}

function onDateInput(e: Event): void {
  const v = (e.target as HTMLInputElement).value
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) currentDate.value = v
}

function enterBatch(): void {
  ui.enterBatch('history')
}

function fmtDone(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function doExport(): Promise<void> {
  exportError.value = ''
  if (exportFrom.value === '' || exportTo.value === '') {
    exportError.value = '请选择导出的起止日期'
    return
  }
  if (exportFrom.value > exportTo.value) {
    exportError.value = '起始日期不能晚于结束日期'
    return
  }
  const r = await store.exportCsv(exportFrom.value, exportTo.value)
  if (!r.ok) {
    exportError.value = r.reason === 'no-records' ? '该区间暂无记录' : r.reason === 'canceled' ? '' : '导出失败'
  }
}
</script>

<template>
  <div class="child-window">
    <header class="titlebar">
      <span class="title">历史记录</span>
      <span class="spacer" />
      <!-- 决策#6：浏览类窗口标题栏右「×」 -->
      <button class="close" data-testid="hist-close" title="关闭" @click="getApi().closeSelf()">×</button>
    </header>

    <div class="body">
      <div class="nav">
        <button class="b" data-testid="hist-prev" @click="prevDay">前一天</button>
        <input
          type="date"
          class="date"
          data-testid="hist-date-input"
          :value="currentDate"
          :min="earliest"
          :max="todayKey"
          @change="onDateInput"
        />
        <button class="b" data-testid="hist-next" :disabled="isToday" @click="nextDay">后一天</button>
        <button class="b" data-testid="hist-today" :disabled="isToday" @click="currentDate = todayKey">回到今天</button>
        <span class="spacer" />
        <button v-if="!ui.batchMode" class="b" data-testid="hist-batch" @click="enterBatch">批量删除</button>
      </div>

      <div class="meta">
        <span class="date-label" data-testid="hist-date-label">{{ dateLabel }}</span>
        <span data-testid="hist-count">{{ items.length }} 条</span>
      </div>

      <!-- 自绘悬浮滚动条（二轮反馈）：原生滚动条隐藏，滑块绘制在右缘专用带 -->
      <div class="list-wrap">
        <div v-if="items.length > 0" ref="listEl" class="list hide-native-bar">
          <div
            v-for="t in items"
            :key="t.id"
            class="hist-row"
            data-testid="hist-row"
            :data-id="t.id"
            :class="{ selrow: ui.batchMode && ui.selectedIds.includes(t.id) }"
            @click="ui.batchMode && ui.toggleSelect(t.id)"
            @dblclick="!ui.batchMode && ui.openChild('detail', t.id)"
          >
            <span class="content ellipsis">{{ t.content }}</span>
            <span v-if="t.overdue" class="tag overdue">逾期</span>
            <span class="time">{{ fmtDone(t.completedAt) }}</span>
            <button
              v-if="ui.batchMode"
              type="button"
              class="checkbox"
              :class="{ checked: ui.selectedIds.includes(t.id) }"
              @click.stop="ui.toggleSelect(t.id)"
              @dblclick.stop
            >
              <svg viewBox="0 0 16 16"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
            </button>
          </div>
        </div>
        <div v-else class="panel-empty" data-testid="hist-empty">该日期暂无已完成事项</div>

        <!-- 自绘滑块：溢出时显示于右缘专用带，可拖拽 -->
        <div
          v-show="thumb.state.visible"
          class="list-thumb"
          data-testid="hist-thumb"
          :style="{ top: thumb.state.top + 'px', height: thumb.state.height + 'px' }"
          @pointerdown="thumb.onThumbPointerDown"
        />
      </div>

      <BatchBar v-if="ui.batchTarget === 'history'" target="history" :history-date-key="currentDate" />

      <div class="export">
        <span class="label">导出</span>
        <input type="date" class="date" data-testid="hist-export-from" v-model="exportFrom" />
        <span class="label">至</span>
        <input type="date" class="date" data-testid="hist-export-to" v-model="exportTo" />
        <button class="b primary-sm" data-testid="hist-export" @click="doExport">导出 CSV</button>
      </div>
      <p v-if="exportError" class="error" data-testid="hist-export-error">{{ exportError }}</p>
    </div>

    <ConfirmDialog />
  </div>
</template>

<style scoped>
.nav {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.date {
  height: 28px;
  border: 1px solid var(--btn-border);
  border-radius: 5px;
  background: var(--field);
  color: var(--text);
  font-family: inherit;
  font-size: 11.5px;
  padding: 0 5px;
  outline: none;
}

.spacer {
  flex: 1;
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--muted);
  flex: none;
}

.date-label {
  font-weight: 600;
}

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--card-border);
  border-radius: 8px;
}

.hist-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--card);
  border: 1px solid var(--card-border);
  cursor: default;
  user-select: none;
}

.hist-row:hover {
  border-color: var(--accent);
  background: var(--hover);
}

.hist-row.selrow {
  border-color: var(--accent);
  background: var(--hover);
}

.content {
  flex: 1;
  min-width: 0;
  font-size: 13px;
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
  color: var(--overdue);
}

.time {
  flex: none;
  font-size: 11px;
  color: var(--faint);
}

.checkbox {
  flex: none;
  width: 19px;
  height: 19px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1.5px solid var(--cb-border, #8a8a8a);
  border-radius: 5px;
  background: transparent;
  color: transparent;
  cursor: pointer;
}

.checkbox.checked {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}

.checkbox svg {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.panel-empty {
  flex: 1;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--faint);
  font-size: 12px;
}

.export {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding-top: 8px;
  border-top: 1px solid var(--card-border);
}

.label {
  font-size: 11.5px;
  color: var(--muted);
}

.primary-sm {
  border-color: transparent !important;
  background: var(--accent) !important;
  color: var(--accent-fg) !important;
}

.primary-sm:hover {
  background: var(--accent-hover) !important;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import BatchBar from '../components/BatchBar.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { shiftDateKey, localDateKey } from '../core/utils/date'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

const store = useAppStore()
const ui = useUiStore()

const todayKey = localDateKey(new Date())
const currentDate = ref(todayKey)
const exportFrom = ref('')
const exportTo = ref('')
const exportError = ref('')

const earliest = computed(() => {
  const keys = Object.keys(store.archive).sort()
  return keys[0] ?? todayKey
})

const items = computed(() => {
  // 今天的视图包含已完成区（与导出口径 F1 一致）；其余日期读归档
  if (currentDate.value === todayKey) {
    return [...(store.archive[currentDate.value] ?? []), ...store.completed]
  }
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
  <div class="child-window" data-theme="day">
    <header class="titlebar">
      <span class="title">历史记录</span>
      <span class="spacer" />
    </header>

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
    </div>

    <div class="meta">
      <span class="date-label" data-testid="hist-date-label">{{ dateLabel }}</span>
      <span data-testid="hist-count">{{ items.length }} 条</span>
      <span class="spacer" />
      <button v-if="!ui.batchMode" class="b" data-testid="hist-batch" @click="enterBatch">批量删除</button>
    </div>

    <ul v-if="items.length > 0" class="list">
      <li v-for="t in items" :key="t.id">
        <div
          class="hist-row"
          data-testid="hist-row"
          :data-id="t.id"
          :class="{ selected: ui.batchMode && ui.selectedIds.includes(t.id) }"
          @click="ui.batchMode && ui.toggleSelect(t.id)"
          @dblclick="!ui.batchMode && ui.openChild('detail', t.id)"
        >
          <span v-if="ui.batchMode" class="circle" :class="{ checked: ui.selectedIds.includes(t.id) }" />
          <span class="content ellipsis">{{ t.content }}</span>
          <span v-if="t.overdue" class="overdue red">逾期</span>
          <span class="time">{{ fmtDone(t.completedAt) }}</span>
        </div>
      </li>
    </ul>
    <div v-else class="empty" data-testid="hist-empty">该日期暂无已完成事项</div>

    <div class="export">
      <span class="label">导出</span>
      <input type="date" class="date" data-testid="hist-export-from" v-model="exportFrom" />
      <span class="label">至</span>
      <input type="date" class="date" data-testid="hist-export-to" v-model="exportTo" />
      <button class="b" data-testid="hist-export" @click="doExport">导出 CSV</button>
    </div>
    <p v-if="exportError" class="error" data-testid="hist-export-error">{{ exportError }}</p>

    <BatchBar
      v-if="ui.batchTarget === 'history'"
      target="history"
      :history-date-key="currentDate"
    />

    <ConfirmDialog />
  </div>
</template>

<style scoped>
.child-window {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(252, 252, 253, 0.97);
  color: #2a2f3a;
  border-radius: 12px;
  overflow: hidden;
}

.titlebar {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.title {
  font-size: 14px;
  font-weight: 600;
}

.spacer {
  flex: 1;
}

.nav {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px 4px;
}

.date {
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 12px;
  background: transparent;
  color: inherit;
}

.b {
  border: none;
  background: rgba(0, 0, 0, 0.06);
  font-size: 12px;
  cursor: pointer;
  border-radius: 8px;
  padding: 4px 10px;
  color: inherit;
}

.b:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.meta {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  font-size: 12px;
  opacity: 0.85;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0 12px;
  overflow-y: auto;
  flex: 1;
}

.hist-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 10px;
}

.hist-row:hover {
  background: rgba(0, 0, 0, 0.05);
}

.hist-row.selected {
  background: rgba(47, 111, 237, 0.12);
}

.circle {
  flex: none;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  opacity: 0.6;
}

.circle.checked {
  background: currentColor;
  opacity: 1;
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

.overdue {
  flex: none;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 6px;
  color: #fff;
}

.red {
  background: #e5484d;
}

.time {
  flex: none;
  font-size: 11px;
  opacity: 0.6;
}

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.55;
  font-size: 13px;
}

.export {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.label {
  font-size: 12px;
  opacity: 0.7;
}

.error {
  margin: 0 12px 8px;
  font-size: 12px;
  color: #e5484d;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

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

async function toggleBack(id: string): Promise<void> {
  const r = await store.returnToActive(id)
  error.value = r.ok ? '' : r.reason === 'limit-reached' ? '待办数量已达上限' : '退回失败'
}

function toggleSort(): void {
  void store.updateSettings({ doneSort: store.settings.doneSort === 'asc' ? 'desc' : 'asc' })
}

function fmtDone(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <section class="panel side-panel" data-testid="done-panel">
    <header class="titlebar">
      <span class="title" data-testid="done-title">{{ title }}</span>
      <span class="spacer" />
      <button class="b" data-testid="done-sort" @click="toggleSort">
        {{ store.settings.doneSort === 'asc' ? '正序↑' : '倒序↓' }}
      </button>
    </header>

    <p v-if="error" class="error" data-testid="done-error">{{ error }}</p>

    <ul v-if="store.completed.length > 0" class="list">
      <li v-for="t in sorted" :key="t.id">
        <div class="done-row" data-testid="done-row" :data-id="t.id" @dblclick="ui.openChild('detail', t.id)">
          <input
            type="checkbox"
            class="check"
            data-testid="done-check"
            title="点击退回待办"
            @click.stop="toggleBack(t.id)"
            @dblclick.stop
          />
          <span class="content ellipsis">{{ t.content }}</span>
          <span v-if="t.overdue" class="overdue red" data-testid="done-overdue-tag">逾期</span>
          <span class="time" data-testid="done-time">{{ fmtDone(t.completedAt) }}</span>
        </div>
      </li>
    </ul>
    <div v-else class="empty" data-testid="done-empty">今天还没有完成的事项</div>

    <footer class="footer">
      <button class="b" data-testid="done-history" @click="ui.openChild('history')">历史记录</button>
    </footer>
  </section>
</template>

<style scoped>
.side-panel {
  width: 260px;
  height: 520px;
  flex: none;
  display: flex;
  flex-direction: column;
}

.titlebar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
}

.title {
  font-size: calc(var(--fs, 14px) * 13 / 14);
  font-weight: 600;
}

.spacer {
  flex: 1;
}

.b {
  border: none;
  background: transparent;
  font-size: calc(var(--fs, 14px) * 12 / 14);
  cursor: pointer;
  border-radius: 6px;
  padding: 3px 6px;
  color: inherit;
}

.b:hover {
  background: rgba(47, 111, 237, 0.14);
}

.error {
  margin: 0 12px 6px;
  font-size: calc(var(--fs, 14px) * 12 / 14);
  color: #e5484d;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0 8px;
  overflow-y: auto;
  flex: 1;
}

.done-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 10px;
}

.done-row:hover {
  background: rgba(0, 0, 0, 0.05);
}

.check {
  flex: none;
  width: 15px;
  height: 15px;
  cursor: pointer;
}

.content {
  flex: 1;
  min-width: 0;
  font-size: calc(var(--fs, 14px) * 13 / 14);
  text-align: left;
}

.ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.overdue {
  flex: none;
  font-size: calc(var(--fs, 14px) * 11 / 14);
  padding: 1px 6px;
  border-radius: 6px;
  color: #fff;
}

.red {
  background: #e5484d;
}

.time {
  flex: none;
  font-size: calc(var(--fs, 14px) * 11 / 14);
  opacity: 0.6;
}

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.55;
  font-size: calc(var(--fs, 14px) * 12 / 14);
}

.footer {
  padding: 8px 12px 12px;
  display: flex;
  justify-content: center;
}
</style>

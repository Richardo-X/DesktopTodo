<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { fmtLocalDateTime } from '../core/utils/date'
import type { RecycleEntry, RecycleEntryType } from '../core/models/types'

const store = useAppStore()
const ui = useUiStore()

const GROUPS: Array<{ type: RecycleEntryType; label: string }> = [
  { type: 'todo', label: '待办' },
  { type: 'template', label: '模板' },
  { type: 'history', label: '历史记录' }
]

const grouped = computed(() =>
  GROUPS.map((g) => ({
    ...g,
    entries: store.recycleBin.filter((e) => e.type === g.type)
  })).filter((g) => g.entries.length > 0)
)

const isEmpty = computed(() => store.recycleBin.length === 0)

function deletedAtText(e: RecycleEntry): string {
  return fmtLocalDateTime(new Date(e.deletedAt))
}

function payloadText(e: RecycleEntry): string {
  return e.payload.content
}

async function restore(e: RecycleEntry): Promise<void> {
  await store.restore(e.id)
}

async function permanentDelete(e: RecycleEntry): Promise<void> {
  const ok = await ui.confirm(`确定彻底删除“${e.payload.content}”吗？此操作不可恢复。`)
  if (!ok) return
  await store.permanentDelete(e.id)
}

async function clearAll(): Promise<void> {
  const ok = await ui.confirm('确定清空回收站吗？此操作不可恢复。')
  if (!ok) return
  await store.clearBin()
}
</script>

<template>
  <div class="child-window" data-theme="day">
    <header class="titlebar">
      <span class="title">回收站</span>
      <span class="spacer" />
      <button v-if="!isEmpty" class="b danger" data-testid="recycle-clear" @click="clearAll">一键清空</button>
    </header>

    <div v-if="isEmpty" class="empty" data-testid="recycle-empty">回收站是空的</div>

    <div v-else class="body">
      <section
        v-for="g in grouped"
        :key="g.type"
        class="group"
        data-testid="recycle-group"
        :data-group="g.type"
      >
        <h3 class="group-title">{{ g.label }}</h3>
        <ul class="list">
          <li v-for="e in g.entries" :key="e.id" class="entry" :data-testid="`recycle-entry-${e.id}`">
            <span class="content ellipsis">{{ payloadText(e) }}</span>
            <span class="time">删除于 {{ deletedAtText(e) }}</span>
            <button class="b" :data-testid="`recycle-restore-${e.id}`" @click="restore(e)">恢复</button>
            <button class="b danger" :data-testid="`recycle-delete-${e.id}`" @click="permanentDelete(e)">彻底删除</button>
          </li>
        </ul>
      </section>
    </div>

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
  font-size: calc(var(--fs, 14px) * 14 / 14);
  font-weight: 600;
}

.spacer {
  flex: 1;
}

.b {
  border: none;
  background: rgba(0, 0, 0, 0.06);
  font-size: calc(var(--fs, 14px) * 12 / 14);
  cursor: pointer;
  border-radius: 8px;
  padding: 4px 10px;
  color: inherit;
}

.b.danger {
  color: #e5484d;
}

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.55;
  font-size: calc(var(--fs, 14px) * 13 / 14);
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.group-title {
  margin: 0 0 6px;
  font-size: calc(var(--fs, 14px) * 12 / 14);
  font-weight: 600;
  opacity: 0.7;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.04);
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

.time {
  flex: none;
  font-size: calc(var(--fs, 14px) * 11 / 14);
  opacity: 0.6;
}
</style>

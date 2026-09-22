<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import BatchBar from '../components/BatchBar.vue'
import { TEMPLATE_LIMIT } from '../core/services/templates'

const store = useAppStore()
const ui = useUiStore()

const title = computed(() => `模板 · ${store.templates.length}/${TEMPLATE_LIMIT}`)

const error = ref('')

async function quickAdd(id: string): Promise<void> {
  const r = await store.quickAdd(id)
  error.value = r.ok ? '' : r.reason === 'limit-reached' ? '待办数量已达上限' : '添加失败'
}

function enterBatch(): void {
  ui.enterBatch('templates')
}
</script>

<template>
  <section class="panel side-panel" data-testid="quick-panel">
    <header class="titlebar">
      <span class="title" data-testid="quick-title">{{ title }}</span>
      <span class="spacer" />
      <button class="b" data-testid="quick-batch" @click="enterBatch">批量删除</button>
      <button class="b new" data-testid="quick-new" @click="ui.openChild('template-new')">＋</button>
    </header>

    <p v-if="error" class="error" data-testid="quick-error">{{ error }}</p>

    <ul v-if="store.templates.length > 0" class="list">
      <li v-for="t in store.templates" :key="t.id">
        <div
          class="tpl-row"
          data-testid="tpl-row"
          :class="{ selected: ui.batchMode && ui.selectedIds.includes(t.id) }"
          @click="ui.batchMode && ui.toggleSelect(t.id)"
          @dblclick="!ui.batchMode && ui.openChild('template-edit', t.id)"
        >
          <span class="handle" data-testid="tpl-handle" title="长按拖动排序" />
          <span class="content ellipsis" data-testid="tpl-content">{{ t.content }}</span>
          <span v-if="!ui.batchMode" class="add" data-testid="tpl-add" @click.stop="quickAdd(t.id)">＋</span>
          <span v-else class="select-circle" :class="{ checked: ui.selectedIds.includes(t.id) }" />
        </div>
      </li>
    </ul>
    <div v-else class="empty">还没有模板，点右上角 ＋ 新建</div>

    <p class="note" data-testid="quick-note">
      模板不计入待办数量上限；点击条目右侧 ＋ 可加入今日待办，模板不会消失
    </p>

    <BatchBar v-if="ui.batchTarget === 'templates'" target="templates" />
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

.b.new {
  font-size: calc(var(--fs, 14px) * 15 / 14);
  font-weight: 700;
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

.tpl-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px;
  border-radius: 10px;
}

.tpl-row:hover {
  background: rgba(0, 0, 0, 0.05);
}

.tpl-row.selected {
  background: rgba(47, 111, 237, 0.12);
}

.handle {
  width: 12px;
  height: 18px;
  flex: none;
  border-radius: 4px;
  background: radial-gradient(circle, currentColor 1px, transparent 1.4px);
  background-size: 6px 6px;
  opacity: 0.45;
  cursor: grab;
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

.add {
  flex: none;
  width: 22px;
  height: 22px;
  line-height: 20px;
  text-align: center;
  border-radius: 50%;
  border: 1px solid rgba(47, 111, 237, 0.6);
  color: #2f6fed;
  cursor: pointer;
  font-weight: 700;
}

.select-circle {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  opacity: 0.6;
}

.select-circle.checked {
  background: currentColor;
  opacity: 1;
}

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.55;
  font-size: calc(var(--fs, 14px) * 12 / 14);
}

.note {
  margin: 0;
  padding: 8px 12px 10px;
  font-size: calc(var(--fs, 14px) * 11 / 14);
  opacity: 0.6;
  line-height: 1.6;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { clampMaxItems } from '../core/services/limits'
import type { RecycleKeepDays } from '../core/models/types'

const store = useAppStore()
const ui = useUiStore()

const importError = ref('')

// —— 1. 待办数量上限 ——
const maxItems = computed(() => store.settings.maxItems)
const todoCount = computed(() => store.todos.length)
const canDecrease = computed(() => maxItems.value - 1 >= Math.max(1, todoCount.value))
const canIncrease = computed(() => maxItems.value + 1 <= 10)
const atFloor = computed(() => !canDecrease.value)

async function stepMax(delta: number): Promise<void> {
  const next = clampMaxItems(maxItems.value + delta, todoCount.value)
  if (next === maxItems.value) return
  await store.updateSettings({ maxItems: next })
}

// —— 2. 时间制式 ——
async function toggleHour12(): Promise<void> {
  await store.updateSettings({ hour12: !store.settings.hour12 })
}

// —— 3. 字体三档 ——
async function setFont(scale: 'small' | 'medium' | 'large'): Promise<void> {
  await store.updateSettings({ fontScale: scale })
}

// —— 4. 导入历史记录 ——
async function importCsv(mode: 'cover' | 'merge'): Promise<void> {
  importError.value = ''
  if (mode === 'cover') {
    const ok = await ui.confirm('覆盖导入将清空现有全部历史记录（含当天已完成），被清掉的内容不会进入回收站。确定继续吗？')
    if (!ok) return
  }
  const r = await store.importCsv(mode === 'cover' ? 'cover' : 'merge')
  if (!r.ok) {
    importError.value = r.reason === 'format-error' ? '文件格式不正确，只支持本软件导出的 CSV' : ''
  }
}

// —— 5. 开机自启 ——
async function toggleAutoStart(): Promise<void> {
  await store.updateSettings({ autoStart: !store.settings.autoStart })
}

// —— 6. 回收站 ——
async function setRecycleKeep(days: RecycleKeepDays): Promise<void> {
  await store.updateSettings({ recycleKeep: days })
}
</script>

<template>
  <div class="child-window" data-theme="day">
    <header class="titlebar">
      <span class="title">设置</span>
      <span class="spacer" />
    </header>

    <div class="body">
      <section class="item" data-testid="set-max">
        <span class="label">待办数量上限</span>
        <div class="stepper">
          <button class="step" data-testid="set-max-minus" :disabled="!canDecrease" @click="stepMax(-1)">−</button>
          <span class="value" data-testid="set-max-value">{{ maxItems }}</span>
          <button class="step" data-testid="set-max-plus" :disabled="!canIncrease" @click="stepMax(1)">＋</button>
        </div>
        <span v-if="atFloor" class="note" data-testid="set-max-note">不可低于当前待办数量</span>
      </section>

      <section class="item" data-testid="set-hour12">
        <span class="label">时间显示制式</span>
        <button class="b" data-testid="set-hour12-btn" @click="toggleHour12">
          {{ store.settings.hour12 ? '12 小时制' : '24 小时制' }}
        </button>
      </section>

      <section class="item" data-testid="set-font">
        <span class="label">字体大小</span>
        <div class="row">
          <button class="b" data-testid="set-font-small" :class="{ active: store.settings.fontScale === 'small' }" @click="setFont('small')">小</button>
          <button class="b" data-testid="set-font-medium" :class="{ active: store.settings.fontScale === 'medium' }" @click="setFont('medium')">中</button>
          <button class="b" data-testid="set-font-large" :class="{ active: store.settings.fontScale === 'large' }" @click="setFont('large')">大</button>
        </div>
      </section>

      <section class="item" data-testid="set-import">
        <span class="label">导入历史记录</span>
        <div class="row">
          <button class="b" data-testid="set-import-cover" @click="importCsv('cover')">覆盖导入</button>
          <button class="b" data-testid="set-import-merge" @click="importCsv('merge')">合并导入</button>
        </div>
        <p v-if="importError" class="error" data-testid="set-import-error">{{ importError }}</p>
      </section>

      <section class="item" data-testid="set-autostart">
        <span class="label">开机自启</span>
        <button class="b" data-testid="set-autostart-btn" @click="toggleAutoStart">
          {{ store.settings.autoStart ? '已开启' : '已关闭' }}
        </button>
      </section>

      <section class="item" data-testid="set-recycle">
        <span class="label">回收站</span>
        <div class="row">
          <button class="b" data-testid="set-recycle-keep7" :class="{ active: store.settings.recycleKeep === 7 }" @click="setRecycleKeep(7)">7 天清理</button>
          <button class="b" data-testid="set-recycle-keep30" :class="{ active: store.settings.recycleKeep === 30 }" @click="setRecycleKeep(30)">30 天清理</button>
          <button class="b" data-testid="set-recycle-never" :class="{ active: store.settings.recycleKeep === 'never' }" @click="setRecycleKeep('never')">永不清理</button>
          <button class="b link" data-testid="set-recycle-open" @click="ui.openChild('recycle')">打开回收站</button>
        </div>
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
  font-size: 14px;
  font-weight: 600;
}

.spacer {
  flex: 1;
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.label {
  width: 110px;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
}

.row {
  display: flex;
  gap: 6px;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.step {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.07);
  font-size: 15px;
  cursor: pointer;
  color: inherit;
}

.step:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.value {
  min-width: 22px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
}

.note {
  font-size: 11px;
  color: #e5484d;
}

.b {
  border: none;
  background: rgba(0, 0, 0, 0.06);
  font-size: 12px;
  cursor: pointer;
  border-radius: 8px;
  padding: 5px 12px;
  color: inherit;
}

.b.active {
  background: #2f6fed;
  color: #fff;
}

.b.link {
  color: #2f6fed;
  background: transparent;
  text-decoration: underline;
}

.error {
  margin: 0;
  font-size: 12px;
  color: #e5484d;
}
</style>

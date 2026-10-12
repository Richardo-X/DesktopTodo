<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { getApi } from '../services/api'
import { clampMaxItems } from '../core/services/limits'

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

// —— 2. 时间制式（seg：24h/12h） ——
async function setHour12(v: boolean): Promise<void> {
  await store.updateSettings({ hour12: v })
}

// —— 3. 导入历史记录 ——
async function importCsv(mode: 'cover' | 'merge'): Promise<void> {
  importError.value = ''
  if (mode === 'cover') {
    const ok = await ui.confirm('覆盖导入将清空现有全部历史记录（含当天已完成），被清掉的内容将直接消失、无法恢复。确定继续吗？')
    if (!ok) return
  }
  const r = await store.importCsv(mode === 'cover' ? 'cover' : 'merge')
  if (!r.ok) {
    importError.value = r.reason === 'format-error' ? '文件格式不正确，只支持本软件导出的 CSV' : ''
  }
}

// —— 4. 开机自启（switch） ——
const autoStartError = ref('')

async function toggleAutoStart(): Promise<void> {
  autoStartError.value = ''
  const r = await store.updateSettings({ autoStart: !store.settings.autoStart })
  // 三轮：系统登录项写入未生效（如被任务管理器禁用/策略拦截）→ 明确提示
  if (r.ok && r.autoStartApplied === false) {
    autoStartError.value = '开机自启设置未生效（开发版不支持自启；安装版请检查任务管理器「启动应用」中「桌面待办」是否被禁用）'
  }
}

// 决策#6：设置=表单类，标题栏左「←」直接关闭
async function onBack(): Promise<void> {
  await getApi().closeSelf()
}
</script>

<template>
  <div class="child-window">
    <header class="titlebar">
      <button class="back" data-testid="set-back" title="返回" @click="onBack">
        <!-- L1.5 图标统一：← 字形换原型 I.chevL SVG（13px 随 child-window .back svg） -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <span class="title">设置</span>
      <span class="spacer" />
    </header>

    <div class="body">
      <div class="form-row">
        <span class="form-label">
          <b>待办数量上限</b>
          <span>1~10 条；不可低于当前待办数量</span>
        </span>
        <div class="stepper" data-testid="set-max">
          <button class="step" data-testid="set-max-minus" :disabled="!canDecrease" @click="stepMax(-1)">−</button>
          <span class="val" data-testid="set-max-value">{{ maxItems }}</span>
          <button class="step" data-testid="set-max-plus" :disabled="!canIncrease" @click="stepMax(1)">＋</button>
        </div>
      </div>
      <p v-if="atFloor" class="note" data-testid="set-max-note">不可低于当前待办数量</p>

      <div class="divider" />

      <div class="form-row">
        <span class="form-label">
          <b>时间显示制式</b>
          <span>作用于主窗时钟与各列表时间</span>
        </span>
        <div class="seg" data-testid="set-hour12">
          <button :class="{ on: !store.settings.hour12 }" @click="setHour12(false)">24 小时制</button>
          <button data-testid="set-hour12-btn" :class="{ on: store.settings.hour12 }" @click="setHour12(true)">12 小时制</button>
        </div>
      </div>

      <div class="divider" />

      <div class="form-col" data-testid="set-import">
        <span class="form-label">
          <b>导入历史记录</b>
          <span>只接受本软件导出的 CSV；覆盖导入将替换现有全部历史</span>
        </span>
        <div class="row">
          <button class="b" data-testid="set-import-cover" @click="importCsv('cover')">覆盖导入</button>
          <button class="b" data-testid="set-import-merge" @click="importCsv('merge')">合并导入</button>
        </div>
        <p v-if="importError" class="error" data-testid="set-import-error">{{ importError }}</p>
      </div>

      <div class="divider" />

      <div class="form-row" data-testid="set-autostart">
        <span class="form-label">
          <b>开机自启</b>
          <span>开启后开机直接显示组件窗口</span>
        </span>
        <button class="switch" data-testid="set-autostart-btn" :class="{ on: store.settings.autoStart }" @click="toggleAutoStart">
          <span class="knob" />
        </button>
      </div>
      <p v-if="autoStartError" class="error" data-testid="set-autostart-error">{{ autoStartError }}</p>

      <p class="meta-line">所有设置即时生效并保留。</p>
    </div>

    <ConfirmDialog />
  </div>
</template>

<style scoped>
.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px; /* L2：14→12（4px 栅格） */
  padding: 8px 0; /* L2：6→8（4px 栅格） */
}

.form-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0; /* L2：6→8（4px 栅格） */
}

.form-label {
  display: flex;
  flex-direction: column;
  gap: 4px; /* L2：3→4（4px 栅格） */
  text-align: left;
}

.form-label b {
  font-size: 13.5px; /* L2 字阶 body 13.5（原 13；设置项标签同正文档） */
  font-weight: 600;
}

.form-label span {
  font-size: 11px; /* L2 字阶 caption 11（原 11.5） */
  color: var(--muted);
  line-height: 1.5;
}

.divider {
  height: 1px;
  background: var(--card-border);
  flex: none;
}

.row {
  display: flex;
  gap: 8px; /* L2：6→8（4px 栅格） */
}

.stepper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.step {
  width: 28px;
  height: 28px;
  border: 1px solid var(--btn-border);
  border-radius: 6px;
  background: var(--btn);
  color: var(--text);
  font-size: 15px;
  cursor: pointer;
  line-height: 1;
  font-family: inherit;
}

.step:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.val {
  width: 44px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--btn-border);
  border-radius: 6px;
  background: var(--field);
  color: var(--text);
  font-size: 12px; /* L2 字阶 label 12（原 12.5） */
}

.seg {
  display: flex;
  border: 1px solid var(--btn-border);
  border-radius: 6px;
  overflow: hidden;
}

.seg button {
  border: none;
  background: var(--btn);
  color: var(--muted);
  font-size: 11px; /* L2 字阶 caption 11（原 11.5） */
  padding: 5px 10px;
  cursor: pointer;
  font-family: inherit;
}

.seg button.on {
  background: var(--accent);
  color: var(--accent-fg);
}

.switch {
  width: 40px;
  height: 21px;
  flex: none;
  border-radius: 99px;
  border: 1px solid var(--btn-border);
  background: var(--btn);
  position: relative;
  cursor: pointer;
  transition: 0.18s;
  padding: 0;
}

.switch .knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--muted);
  transition: 0.18s;
}

.switch.on {
  background: var(--accent);
  border-color: transparent;
}

.switch.on .knob {
  left: 21px;
  background: var(--accent-fg);
}

.note {
  margin: 0; /* L2：-2px 补偿取消（form-row 底距已统一 8px） */
  font-size: 11px; /* L2 字阶 caption 11（原 11.5） */
  color: var(--danger);
}
</style>

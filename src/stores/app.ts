import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AppData, AppSettings, UiState } from '../core/models/types'
import { defaultAppData } from '../core/models/defaults'
import { createTodoItem, DomainError } from '../core/models/factories'
import { canAddTodo } from '../core/services/limits'
import { markCompleted, returnToActive as returnToActiveCalc } from '../core/services/overdue'
import { addToTodoFromTemplate, createTemplate as createTemplateSvc, updateTemplate as updateTemplateSvc } from '../core/services/templates'
import { applySettings, type PatchResult } from '../core/services/settings'
import { coverImport, exportHistoryCsv, mergeImport, parseCsv } from '../core/services/csv'
import { localDateKey } from '../core/utils/date'
import { deepCloneJson, getApi } from '../services/api'

/** 数组移动（拖拽排序）：from → to，其余相对顺序不变 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

type OpResult = { ok: true } | { ok: false; reason: string }

/**
 * 应用仓库：渲染层唯一数据源（PRD §4 事项属性驱动一切展示）。
 * 领域规则全部复用 src/core 已测服务；每次动作后立即 commit 持久化
 * （"即时保存"语义，主进程侧防抖落盘）。
 */
export const useAppStore = defineStore('app', () => {
  const data = ref<AppData>(defaultAppData())
  const loaded = ref(false)

  const todos = computed(() => data.value.todos)
  const completed = computed(() => data.value.completed)
  const archive = computed(() => data.value.archive)
  const templates = computed(() => data.value.templates)
  const settings = computed(() => data.value.settings)
  const uiState = computed(() => data.value.uiState)

  const todayKey = (): string => localDateKey(new Date())
  const now = (): Date => new Date()

  async function init(): Promise<void> {
    data.value = await getApi().getState()
    loaded.value = true
    getApi().onStateUpdated((d) => {
      // 主进程结算/其他窗口提交后推送；替换本地状态
      data.value = d
    })
  }

  async function apply(fn: (d: AppData) => AppData): Promise<void> {
    data.value = fn(data.value)
    await getApi().commit(deepCloneJson(data.value))
  }

  // ---------- 待办 ----------

  async function addTodo(content: string): Promise<OpResult> {
    const limit = canAddTodo(data.value.todos.length, data.value.settings.maxItems)
    if (!limit.ok) return { ok: false, reason: 'limit-reached' }
    try {
      const item = createTodoItem({ content, now: now() })
      await apply((d) => ({ ...d, todos: [...d.todos, item] }))
      return { ok: true }
    } catch (e) {
      return { ok: false, reason: e instanceof DomainError ? e.reason : 'unknown' }
    }
  }

  async function updateTodoContent(id: string, content: string): Promise<OpResult> {
    try {
      const trimmed = content.trim()
      if (trimmed.length === 0) return { ok: false, reason: 'empty-content' }
      if (trimmed.length > 300) return { ok: false, reason: 'too-long' }
      await apply((d) => ({
        ...d,
        todos: d.todos.map((t) => (t.id === id ? { ...t, content: trimmed } : t))
      }))
      return { ok: true }
    } catch {
      return { ok: false, reason: 'unknown' }
    }
  }

  /** 勾选完成：动画由 UI 层负责；逾期标记随事项带入（PRD §5.2） */
  async function completeTodo(id: string): Promise<void> {
    const item = data.value.todos.find((t) => t.id === id)
    if (!item) return
    const doneItem = markCompleted(item, now())
    await apply((d) => ({
      ...d,
      todos: d.todos.filter((t) => t.id !== id),
      completed: [...d.completed, doneItem]
    }))
  }

  /** 反选退回：回待办末尾并重算逾期（受上限，PRD §5.4） */
  async function returnToActive(id: string): Promise<OpResult> {
    const item = data.value.completed.find((t) => t.id === id)
    if (!item) return { ok: false, reason: 'not-found' }
    const limit = canAddTodo(data.value.todos.length, data.value.settings.maxItems)
    if (!limit.ok) return { ok: false, reason: 'limit-reached' }
    const restored = returnToActiveCalc(item, todayKey())
    await apply((d) => ({
      ...d,
      completed: d.completed.filter((t) => t.id !== id),
      todos: [...d.todos, restored]
    }))
    return { ok: true }
  }

  /** 长按手柄拖动排序（跨天只加标签不改位置，位置仅由此调整） */
  async function reorderTodos(from: number, to: number): Promise<void> {
    await apply((d) => ({ ...d, todos: moveItem(d.todos, from, to) }))
  }

  /** 模板拖拽排序 */
  async function reorderTemplates(from: number, to: number): Promise<void> {
    await apply((d) => ({ ...d, templates: moveItem(d.templates, from, to) }))
  }

  async function batchDeleteTemplates(ids: string[]): Promise<number> {
    let n = 0
    for (const id of ids) {
      if ((await deleteTemplate(id)).ok) n++
    }
    return n
  }

  // ---------- 模板 ----------

  async function createTemplate(content: string): Promise<OpResult> {
    const r = createTemplateSvc(data.value, content, now())
    if (!r.ok) return { ok: false, reason: r.reason }
    await apply(() => r.data)
    return { ok: true }
  }

  async function updateTemplate(id: string, content: string): Promise<OpResult> {
    const r = updateTemplateSvc(data.value, id, content)
    if (!r.ok) return { ok: false, reason: r.reason }
    await apply(() => r.data)
    return { ok: true }
  }

  async function quickAdd(templateId: string): Promise<OpResult> {
    const r = addToTodoFromTemplate(data.value, templateId, now())
    if (!r.ok) return { ok: false, reason: r.reason }
    await apply(() => r.data)
    return { ok: true }
  }

  // ---------- 删除（B1.5：删除即永久删除，不可恢复） ----------

  async function deleteTodo(id: string): Promise<OpResult> {
    const item = data.value.todos.find((t) => t.id === id)
    if (!item) return { ok: false, reason: 'not-found' }
    await apply((d) => ({ ...d, todos: d.todos.filter((t) => t.id !== id) }))
    return { ok: true }
  }

  async function deleteTemplate(id: string): Promise<OpResult> {
    const item = data.value.templates.find((t) => t.id === id)
    if (!item) return { ok: false, reason: 'not-found' }
    await apply((d) => ({ ...d, templates: d.templates.filter((t) => t.id !== id) }))
    return { ok: true }
  }

  async function deleteHistory(dateKey: string, id: string): Promise<OpResult> {
    const group = data.value.archive[dateKey]
    const item = group?.find((t) => t.id === id)
    if (!group || !item) return { ok: false, reason: 'not-found' }
    await apply((d) => ({ ...d, archive: { ...d.archive, [dateKey]: d.archive[dateKey].filter((t) => t.id !== id) } }))
    return { ok: true }
  }

  async function batchDeleteTodos(ids: string[]): Promise<number> {
    let n = 0
    for (const id of ids) {
      if ((await deleteTodo(id)).ok) n++
    }
    return n
  }

  async function batchDeleteHistory(dateKey: string, ids: string[]): Promise<number> {
    let n = 0
    for (const id of ids) {
      if ((await deleteHistory(dateKey, id)).ok) n++
    }
    return n
  }

  // ---------- 设置与界面记忆 ----------

  async function updateSettings(patch: Partial<AppSettings>): Promise<PatchResult> {
    const next = applySettings(data.value.settings, patch)
    await apply((d) => ({ ...d, settings: next }))
    if (patch.autoStart !== undefined) await getApi().setAutoStart(patch.autoStart)
    return { ok: true, settings: next }
  }

  async function updateUiState(patch: Partial<UiState>): Promise<void> {
    await apply((d) => ({ ...d, uiState: { ...d.uiState, ...patch } }))
    if (patch.topMost !== undefined) await getApi().setTopMost(patch.topMost)
  }

  /** 子窗口分组等比缩放（T40） */
  async function setChildScale(group: string, scale: number): Promise<void> {
    await apply((d) => ({
      ...d,
      uiState: { ...d.uiState, childScales: { ...d.uiState.childScales, [group]: scale } }
    }))
  }

  // ---------- 导入导出 ----------

  async function exportCsv(from: string, to: string): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
    const r = exportHistoryCsv(data.value, from, to, todayKey())
    if (!r.ok) return { ok: false, reason: r.reason }
    const path = await getApi().saveCsv({ fileName: r.fileName, content: r.content })
    if (path === null) return { ok: false, reason: 'canceled' }
    return { ok: true, path }
  }

  async function importCsv(
    mode: 'merge' | 'cover'
  ): Promise<{ ok: true; imported: number; duplicates: number } | { ok: false; reason: string }> {
    const text = await getApi().openCsv()
    if (text === null) return { ok: false, reason: 'canceled' }
    const parsed = parseCsv(text, todayKey())
    if (!parsed.ok) return { ok: false, reason: parsed.reason }
    if (mode === 'merge') {
      const r = mergeImport(data.value, parsed.records, todayKey())
      await apply(() => r.data)
      return { ok: true, imported: r.addedCount, duplicates: r.duplicateCount }
    }
    const r = coverImport(data.value, parsed.records, todayKey())
    await apply(() => r.data)
    return { ok: true, imported: r.importedCount, duplicates: 0 }
  }

  function setUnsavedEdits(flag: boolean): void {
    getApi().setUnsavedEdits(flag)
  }

  return {
    data,
    loaded,
    todos,
    completed,
    archive,
    templates,
    settings,
    uiState,
    init,
    addTodo,
    updateTodoContent,
    completeTodo,
    returnToActive,
    reorderTodos,
    reorderTemplates,
    batchDeleteTemplates,
    createTemplate,
    updateTemplate,
    quickAdd,
    deleteTodo,
    deleteTemplate,
    deleteHistory,
    batchDeleteTodos,
    batchDeleteHistory,
    updateSettings,
    updateUiState,
    setChildScale,
    exportCsv,
    importCsv,
    setUnsavedEdits
  }
})

import type { AppData, RecycleEntry, RecycleEntryType, TemplateItem, TodoItem } from '../models/types'
import { createRecycleEntry } from '../models/factories'
import { canAddTodo } from './limits'
import { TEMPLATE_LIMIT } from './templates'

/** 回收站操作失败原因 */
export type RecycleError = 'not-found' | 'limit-reached' | 'invalid-date'

export type RecycleOpResult =
  | { ok: true; data: AppData }
  | { ok: false; reason: RecycleError }

/** 删除待办 → 回收站（入站：type + 原始数据 + deletedAt，PRD §5.6） */
export function deleteTodo(data: AppData, id: string, now: Date): RecycleOpResult {
  const item = data.todos.find((t) => t.id === id)
  if (!item) return { ok: false, reason: 'not-found' }
  const entry = createRecycleEntry({ type: 'todo', payload: item, deletedAt: now })
  return {
    ok: true,
    data: { ...data, todos: data.todos.filter((t) => t.id !== id), recycleBin: [...data.recycleBin, entry] }
  }
}

/** 删除模板 → 回收站 */
export function deleteTemplate(data: AppData, id: string, now: Date): RecycleOpResult {
  const item = data.templates.find((t) => t.id === id)
  if (!item) return { ok: false, reason: 'not-found' }
  const entry = createRecycleEntry({ type: 'template', payload: item, deletedAt: now })
  return {
    ok: true,
    data: { ...data, templates: data.templates.filter((t) => t.id !== id), recycleBin: [...data.recycleBin, entry] }
  }
}

/** 删除历史记录（按日期组内 id）→ 回收站 */
export function deleteHistory(data: AppData, dateKey: string, id: string, now: Date): RecycleOpResult {
  const group = data.archive[dateKey]
  const item = group?.find((t) => t.id === id)
  if (!group || !item) return { ok: false, reason: 'not-found' }
  const entry = createRecycleEntry({ type: 'history', payload: item, deletedAt: now })
  return {
    ok: true,
    data: {
      ...data,
      archive: { ...data.archive, [dateKey]: group.filter((t) => t.id !== id) },
      recycleBin: [...data.recycleBin, entry]
    }
  }
}

function isTodo(payload: TodoItem | TemplateItem): payload is TodoItem {
  return 'completedAt' in payload && 'overdue' in payload
}

/** 恢复：待办/模板回列表末尾（待办受上限、模板受 10 上限），历史回对应日期组末尾 */
export function restoreEntry(data: AppData, entryId: string): RecycleOpResult {
  const entry = data.recycleBin.find((e) => e.id === entryId)
  if (!entry) return { ok: false, reason: 'not-found' }

  const rest = data.recycleBin.filter((e) => e.id !== entryId)

  if (entry.type === 'todo' && isTodo(entry.payload)) {
    const limit = canAddTodo(data.todos.length, data.settings.maxItems)
    if (!limit.ok) return { ok: false, reason: 'limit-reached' }
    return { ok: true, data: { ...data, todos: [...data.todos, entry.payload], recycleBin: rest } }
  }

  if (entry.type === 'template' && !isTodo(entry.payload)) {
    if (data.templates.length >= TEMPLATE_LIMIT) return { ok: false, reason: 'limit-reached' }
    return { ok: true, data: { ...data, templates: [...data.templates, entry.payload], recycleBin: rest } }
  }

  // history：按完成日期回组末尾
  const payload = entry.payload as TodoItem
  const dateKey = payload.completedAt ? completionDateKey(payload.completedAt) : null
  if (dateKey === null) return { ok: false, reason: 'invalid-date' }
  const group = data.archive[dateKey] ?? []
  return {
    ok: true,
    data: { ...data, archive: { ...data.archive, [dateKey]: [...group, payload] }, recycleBin: rest }
  }
}

function completionDateKey(completedAtIso: string): string | null {
  const d = new Date(completedAtIso)
  if (Number.isNaN(d.getTime())) return null
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 彻底删除单条（UI 先弹确认框） */
export function permanentDelete(data: AppData, entryId: string): RecycleOpResult {
  const entry = data.recycleBin.find((e) => e.id === entryId)
  if (!entry) return { ok: false, reason: 'not-found' }
  return { ok: true, data: { ...data, recycleBin: data.recycleBin.filter((e) => e.id !== entryId) } }
}

/** 一键清空（UI 先弹确认框） */
export function clearRecycleBin(data: AppData): AppData {
  return { ...data, recycleBin: [] }
}

/**
 * 到期自动清理（附录 A4：deletedAt + N 天 ≤ now 即清除，含恰好到期）。
 * 按本地日历天推算，避免夏令时/时区偏移误差。时限 'never' 永不清除（E5）。
 * 启动时与每天跨天结算时执行（PRD §5.6）。
 */
export function purgeExpired(data: AppData, now: Date): AppData {
  const keep = data.settings.recycleKeep
  if (keep === 'never') return data

  const deleted = data.recycleBin.filter((entry: RecycleEntry) => {
    const at = new Date(entry.deletedAt)
    const deadline = new Date(at.getFullYear(), at.getMonth(), at.getDate() + keep, at.getHours(), at.getMinutes(), at.getSeconds())
    return deadline.getTime() <= now.getTime()
  })

  if (deleted.length === 0) return data
  const ids = new Set(deleted.map((e) => e.id))
  return { ...data, recycleBin: data.recycleBin.filter((e) => !ids.has(e.id)) }
}

export type { RecycleEntryType }

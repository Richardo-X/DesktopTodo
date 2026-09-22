import type { AppData, TemplateItem, TodoItem } from '../models/types'
import { createTemplateItem, createTodoItem, validateContent, type ContentError } from '../models/factories'
import { canAddTodo } from './limits'

export const TEMPLATE_LIMIT = 10

/** 模板操作失败原因（UI 映射 PRD 原文："已存在相同内容"、上限提示） */
export type TemplateError = 'limit-reached' | 'duplicate' | ContentError

export type TemplateOpResult =
  | { ok: true; data: AppData }
  | { ok: false; reason: TemplateError }

export type QuickAddResult =
  | { ok: true; data: AppData; todo: TodoItem }
  | { ok: false; reason: 'limit-reached' | 'not-found' }

/** 内容 trim 后与现有模板比对（查重只针对模板，待办允许重复，PRD §5.2） */
export function findDuplicateTemplate(
  data: AppData,
  content: string,
  excludeId?: string
): TemplateItem | undefined {
  const trimmed = content.trim()
  return data.templates.find((t) => t.id !== excludeId && t.content === trimmed)
}

/** 新建模板：上限 10 + trim 查重 + 内容校验；成功追加到末尾 */
export function createTemplate(data: AppData, content: string, now: Date): TemplateOpResult {
  const v = validateContent(content)
  if (!v.ok) return { ok: false, reason: v.reason }
  if (findDuplicateTemplate(data, content)) return { ok: false, reason: 'duplicate' }
  if (data.templates.length >= TEMPLATE_LIMIT) return { ok: false, reason: 'limit-reached' }

  const item = createTemplateItem({ content, now })
  return { ok: true, data: { ...data, templates: [...data.templates, item] } }
}

/** 编辑模板：内容校验 + 查重（排除自身）；创建时间保留第一次不可改 */
export function updateTemplate(data: AppData, id: string, content: string): TemplateOpResult {
  const v = validateContent(content)
  if (!v.ok) return { ok: false, reason: v.reason }
  if (findDuplicateTemplate(data, content, id)) return { ok: false, reason: 'duplicate' }

  const trimmed = content.trim()
  return {
    ok: true,
    data: {
      ...data,
      templates: data.templates.map((t) => (t.id === id ? { ...t, content: trimmed } : t))
    }
  }
}

/**
 * 一键添加为待办（PRD §5.3）：待办列表末尾新增、createdAt=now、overdue=false，
 * 模板保留不消失；受待办上限约束。
 */
export function addToTodoFromTemplate(data: AppData, templateId: string, now: Date): QuickAddResult {
  const template = data.templates.find((t) => t.id === templateId)
  if (!template) return { ok: false, reason: 'not-found' }

  const limit = canAddTodo(data.todos.length, data.settings.maxItems)
  if (!limit.ok) return { ok: false, reason: 'limit-reached' }

  const todo = createTodoItem({ content: template.content, now })
  return { ok: true, data: { ...data, todos: [...data.todos, todo] }, todo }
}

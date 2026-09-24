import type { TemplateItem, TodoItem } from './types'

/** 内容校验失败原因（UI 层映射为 PRD 原文提示，附录 A11） */
export type ContentError = 'empty-content' | 'too-long'

export type ValidationResult = { ok: true } | { ok: false; reason: ContentError }

export const MAX_CONTENT_LENGTH = 300

/** 内容校验：trim 后非空且 ≤300 字（PRD §5.1） */
export function validateContent(raw: string): ValidationResult {
  const content = raw.trim()
  if (content.length === 0) return { ok: false, reason: 'empty-content' }
  if (content.length > MAX_CONTENT_LENGTH) return { ok: false, reason: 'too-long' }
  return { ok: true }
}

/** 领域错误：携带机器可读 reason */
export class DomainError extends Error {
  constructor(
    public readonly reason: ContentError
  ) {
    super(`domain error: ${reason}`)
    this.name = 'DomainError'
  }
}

function assertValidContent(raw: string): string {
  const r = validateContent(raw)
  if (!r.ok) throw new DomainError(r.reason)
  return raw.trim()
}

export function createTodoItem(params: { content: string; now: Date; id?: string }): TodoItem {
  return {
    id: params.id ?? crypto.randomUUID(),
    content: assertValidContent(params.content),
    createdAt: params.now.toISOString(),
    completedAt: null,
    overdue: false
  }
}

export function createTemplateItem(params: { content: string; now: Date; id?: string }): TemplateItem {
  return {
    id: params.id ?? crypto.randomUUID(),
    content: assertValidContent(params.content),
    createdAt: params.now.toISOString()
  }
}

import type { AppSettings, DoneSort } from '../models/types'
import { defaultSettings } from '../models/defaults'

export { defaultSettings }

/**
 * 设置服务（PRD §5.6：所有设置即时生效并保留）。
 * 纯函数：applySettings 返回新对象；非法字段保留当前值。
 * maxItems 的"不可低于当前待办数量"约束由 UI 层先经 limits.clampMaxItems 调节，
 * 这里只做 1~10 的兜底 clamp。
 */

const DONE_SORTS: readonly DoneSort[] = ['asc', 'desc']

/** 单字段校验后的补丁结果 */
export type PatchResult =
  | { ok: true; settings: AppSettings }
  | { ok: false; field: keyof AppSettings }

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function clampMax(v: number): number {
  return Math.min(10, Math.max(1, Math.floor(v)))
}

/** 应用部分补丁：合法字段生效，非法字段保留当前值 */
export function applySettings(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    maxItems: isInt(patch.maxItems) ? clampMax(patch.maxItems) : current.maxItems,
    hour12: typeof patch.hour12 === 'boolean' ? patch.hour12 : current.hour12,
    autoStart: typeof patch.autoStart === 'boolean' ? patch.autoStart : current.autoStart,
    doneSort: DONE_SORTS.includes(patch.doneSort as never) ? (patch.doneSort as DoneSort) : current.doneSort
  }
}

/** 提交前整体校验：任一字段非法则整体拒绝并报告字段（供 UI 提示） */
export function validateSettingsPatch(patch: Partial<AppSettings>): PatchResult {
  if (patch.maxItems !== undefined && (!isInt(patch.maxItems) || patch.maxItems < 1 || patch.maxItems > 10)) {
    return { ok: false, field: 'maxItems' }
  }
  if (patch.hour12 !== undefined && typeof patch.hour12 !== 'boolean') return { ok: false, field: 'hour12' }
  if (patch.autoStart !== undefined && typeof patch.autoStart !== 'boolean') return { ok: false, field: 'autoStart' }
  if (patch.doneSort !== undefined && !DONE_SORTS.includes(patch.doneSort)) return { ok: false, field: 'doneSort' }

  return { ok: true, settings: applySettings(defaultSettings(), patch) }
}

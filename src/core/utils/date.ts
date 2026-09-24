/**
 * 时间工具（领域层唯一时间口径）。
 * 统一规则（开发计划 §7 风险 5）：
 * - 存储侧时间戳一律 ISO 8601 UTC 字符串（toISOString），可排序、无歧义
 * - 展示/分组/跨天判定一律用本地时区 getter，经 localDateKey 输出 YYYY-MM-DD
 * - 禁止在领域代码中直接使用 toISOString 做日期比较
 */

/** 本地日期键：YYYY-MM-DD */
export function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 解析 "YYYY-MM-DD HH:mm:ss" 为本地 Date；格式非法返回 null */
export function parseLocalDateTime(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, se] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se ?? '0'))
  // 反向校验（如 2026-02-30 会被 Date 进位到 3 月）
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(mo) - 1 ||
    date.getDate() !== Number(d)
  ) {
    return null
  }
  return date
}

/** "YYYY-MM-DD HH:mm:ss"（本地时间） */
export function fmtLocalDateTime(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${localDateKey(date)} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
}

/** "HH:mm" 或 12 小时制 "h:mm AM/PM"（决策#2：时钟精确到分钟，内部仍每秒刷新） */
export function fmtTime(date: Date, hour12: boolean): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  if (!hour12) return `${p(date.getHours())}:${p(date.getMinutes())}`
  const h24 = date.getHours()
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${p(date.getMinutes())} ${h24 < 12 ? 'AM' : 'PM'}`
}

/** "YYYY年M月D日 星期X" */
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const

export function fmtDateCN(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 星期${WEEKDAYS[date.getDay()]}`
}

/** 本地日期键 +1/-1 天（用于历史记录翻页）；负数 back */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return localDateKey(date)
}

/** dateKey 是否早于 other（字符串比较安全：定宽格式） */
export function isBeforeDateKey(key: string, other: string): boolean {
  return key < other
}

/** dateKey 是否晚于 other */
export function isAfterDateKey(key: string, other: string): boolean {
  return key > other
}

/**
 * 时钟抽象：所有领域逻辑取时间必须经由 IClock 注入，
 * 测试与 E2E 通过注入偏移量实现"模拟跨天"，不依赖真实时间（开发计划 §2.4）。
 */
export interface IClock {
  now(): Date
}

/** 生产环境系统时钟 */
export class SystemClock implements IClock {
  now(): Date {
    return new Date()
  }
}

/**
 * 取本地日期键（按本地时区，格式 YYYY-MM-DD）。
 * 全项目统一使用本函数做跨天判定，禁止直接使用 toISOString()（其按 UTC，存在时区误差风险 §7-5）。
 */
export function typeLocalISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

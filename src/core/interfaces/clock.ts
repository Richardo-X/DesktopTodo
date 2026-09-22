/**
 * 时钟抽象：所有领域逻辑取时间必须经由 IClock 注入，
 * 测试与 E2E 通过注入偏移量实现"模拟跨天"，不依赖真实时间（开发计划 §2.4）。
 * 本地日期键统一使用 utils/date 的 localDateKey。
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

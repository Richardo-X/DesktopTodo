import type { IClock } from '../../src/core/interfaces/clock'

/** 固定偏移时钟：E2E 用（DTODO_CLOCK_OFFSET_H），模拟跨天不依赖真实时间 */
export class OffsetClock implements IClock {
  constructor(private readonly offsetHours: number) {}

  now(): Date {
    return new Date(Date.now() + this.offsetHours * 3_600_000)
  }
}

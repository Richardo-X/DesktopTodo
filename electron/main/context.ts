import type { IRepository } from '../../src/core/interfaces/repository'
import type { IClock } from '../../src/core/interfaces/clock'
import type { AppData } from '../../src/core/models/types'
import { defaultAppData, normalizeAppData } from '../../src/core/models/defaults'
import { settle } from '../../src/core/services/settlement'
import { purgeExpired } from '../../src/core/services/recycle'
import { localDateKey } from '../../src/core/utils/date'

/** 跨天检测：日期键变化或从未结算 */
export function hasCrossedMidnight(lastSettleDate: string | null, nowKey: string): boolean {
  return lastSettleDate !== nowKey
}

/**
 * 应用上下文（主进程核心，脱离 Electron 可测，T20）：
 * - boot：载入 →（关机跨天）静默补结算 + 回收站清理 → 有变更落盘
 * - commit：渲染层提交数据，合并窗口位置后持久化（防抖语义由仓储实现）
 * - flush：退出前强制落盘（唯一数据丢失风险点，before-quit 调用）
 */
export class AppContext {
  #data: AppData | null = null

  constructor(
    private readonly repo: IRepository<AppData>,
    private readonly clock: IClock
  ) {}

  /** 启动：返回结算后的初始数据（PRD §7.4：启动补结算，全程静默） */
  async boot(): Promise<AppData> {
    const raw = await this.repo.load()
    const loaded = raw ?? defaultAppData()
    const normalized = normalizeAppData(loaded)
    const { data, changed } = this.settleIfNeeded(normalized)
    this.#data = data
    if (changed || raw === null) {
      await this.repo.save(data)
      await this.repo.flush()
    }
    return data
  }

  /** 运行中跨天结算（主进程定时器触发） */
  async settleIfCrossed(): Promise<{ data: AppData; changed: boolean }> {
    if (this.#data === null) throw new Error('boot() must be called first')
    const r = this.settleIfNeeded(this.#data)
    if (r.changed) {
      this.#data = r.data
      await this.repo.save(r.data)
    }
    return r
  }

  current(): AppData {
    if (this.#data === null) throw new Error('boot() must be called first')
    return this.#data
  }

  /** 渲染层提交：pos 由主进程采集（窗口归属主进程），其余以渲染层为准 */
  async commit(data: AppData, pos: { x: number; y: number } | null): Promise<void> {
    const merged: AppData = { ...data, uiState: { ...data.uiState, pos } }
    this.#data = merged
    await this.repo.save(merged)
  }

  /** 退出前 flush（唯一退出途径经确认后调用） */
  async flush(): Promise<void> {
    await this.repo.flush()
  }

  /** 结算 + 回收站清理；返回新数据与是否有变更 */
  private settleIfNeeded(data: AppData): { data: AppData; changed: boolean } {
    const now = this.clock.now()
    const todayKey = localDateKey(now)
    if (!hasCrossedMidnight(data.uiState.lastSettleDate, todayKey) && data.uiState.lastSettleDate !== null) {
      return { data, changed: false }
    }
    const purged = purgeExpired(data, now)
    const r = settle(purged, now)
    return { data: r.data, changed: true }
  }
}

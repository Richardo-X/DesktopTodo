import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { IRepository } from '../interfaces/repository'
import { normalizeAppData, defaultAppData } from '../models/defaults'
import type { AppData } from '../models/types'

/**
 * 文件 IO 适配接口：生产注入 node:fs/promises，测试注入内存实现
 * （统计写盘次数、模拟 rename 中断等）。
 */
export interface FileIo {
  readFile(path: string): Promise<string>
  writeFile(path: string, data: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>
}

export const nodeFileIo: FileIo = {
  readFile: (p) => readFile(p, 'utf8'),
  writeFile: async (p, data) => {
    await writeFile(p, data, 'utf8')
  },
  rename: async (f, t) => {
    await rename(f, t)
  },
  mkdir: async (p, opts) => {
    await mkdir(p, opts)
  }
}

export interface FileRepositoryOptions {
  io?: FileIo
  /** 防抖窗口毫秒数；0 = 立即写 */
  debounceMs?: number
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT'
}

/**
 * 文件仓储（生产实现）：
 * - 原子写：写 .tmp 后 rename（中断不损原文件，G2）
 * - 防抖合并写 + flush 强制落盘（G5；对用户仍是"即时保存"语义，附录 A6）
 * - 损坏文件：改名 .corrupt-<时间戳> 留档 → 返回 null（首次启动态，G3 / 附录 A2）
 * - 加载归一化：旧档缺字段补默认值（G4）
 */
export class FileRepository implements IRepository<AppData> {
  readonly filePath: string
  readonly #io: FileIo
  readonly #debounceMs: number
  #pending: AppData | null = null
  #timer: ReturnType<typeof setTimeout> | null = null

  constructor(filePath: string, options: FileRepositoryOptions = {}) {
    this.filePath = filePath
    this.#io = options.io ?? nodeFileIo
    this.#debounceMs = options.debounceMs ?? 100
  }

  async load(): Promise<AppData | null> {
    let raw: string
    try {
      raw = await this.#io.readFile(this.filePath)
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      await this.#archiveCorrupt()
      return null
    }

    return normalizeAppData(parsed)
  }

  async save(data: AppData): Promise<void> {
    this.#pending = structuredClone(data)
    if (this.#debounceMs <= 0) {
      await this.#doWrite()
      return
    }
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = setTimeout(() => {
      void this.#doWrite()
    }, this.#debounceMs)
  }

  async flush(): Promise<void> {
    if (this.#timer !== null) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    if (this.#pending !== null) await this.#doWrite()
  }

  async #doWrite(): Promise<void> {
    if (this.#pending === null) return
    const data = this.#pending
    // 写盘失败时保留 #pending，下一次 save/flush 自动重试（G2：中断不丢数据）
    await this.#io.mkdir(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    await this.#io.writeFile(tmp, JSON.stringify(data, null, 2))
    await this.#io.rename(tmp, this.filePath)
    this.#pending = null
    this.#timer = null
  }

  async #archiveCorrupt(): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    try {
      await this.#io.rename(this.filePath, `${this.filePath}.corrupt-${stamp}`)
    } catch {
      // 留档失败不阻塞首次启动兜底
    }
  }
}

export { defaultAppData }

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtempSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { MemoryRepository } from '../../src/core/repositories/memory'
import { FileRepository, type FileIo } from '../../src/core/repositories/file'
import { defaultAppData, type AppData } from '../../src/core/models'

/** T05 仓储层（开发计划 §4-T05，附录 G 用例） */
describe('MemoryRepository', () => {
  it('save→load 往返一致（深拷贝隔离）', async () => {
    const repo = new MemoryRepository<AppData>()
    const data = defaultAppData()
    data.todos.push({ id: 'a', content: 'x', createdAt: '2026-09-21T00:00:00.000Z', completedAt: null, overdue: false })
    await repo.save(data)
    const loaded = await repo.load()
    expect(loaded).toEqual(data)
    // 修改加载结果不影响仓储内部
    loaded!.todos.push({ id: 'b', content: 'y', createdAt: '2026-09-21T00:00:00.000Z', completedAt: null, overdue: false })
    expect(await repo.load()).toEqual(data)
  })

  it('首次 load 返回 null（首次启动态）', async () => {
    expect(await new MemoryRepository().load()).toBeNull()
  })
})

/** 可注入的内存文件系统，用于统计写盘次数与模拟故障 */
function makeMemoryIo(initial: Record<string, string> = {}): FileIo & { writes: number[]; files: Map<string, string>; failRenameOnce: () => void } {
  const files = new Map<string, string>(Object.entries(initial))
  const writes: number[] = []
  let failRename = false
  return {
    files,
    writes,
    failRenameOnce() {
      failRename = true
    },
    async readFile(path: string) {
      if (!files.has(path)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return files.get(path)!
    },
    async writeFile(path: string, data: string) {
      writes.push(writes.length + 1)
      files.set(path, data)
    },
    async rename(from: string, to: string) {
      if (failRename) {
        failRename = false
        throw new Error('EINTERRUPTED')
      }
      if (!files.has(from)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      files.set(to, files.get(from)!)
      files.delete(from)
    },
    async mkdir() {}
  }
}

describe('FileRepository', () => {
  let dir: string
  let filePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dtodo-repo-'))
    filePath = join(dir, 'data.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('G1 真实文件系统：save(flush)→load 往返完全一致（含 uiState 全部记忆项）', async () => {
    const repo = new FileRepository(filePath)
    const data = defaultAppData()
    data.uiState.pos = { x: 120, y: 40 }
    data.uiState.theme = 'night'
    data.uiState.topMost = true
    data.uiState.quickVisible = false
    data.settings.maxItems = 3
    data.templates.push({ id: 'tpl', content: '喝水', createdAt: '2026-09-21T00:00:00.000Z' })
    await repo.save(data)
    await repo.flush()

    const loaded = await new FileRepository(filePath).load()
    expect(loaded).toEqual(data)
  })

  it('首次 load：文件不存在 → null', async () => {
    expect(await new FileRepository(filePath).load()).toBeNull()
  })

  it('G3 损坏 JSON → 改名 .corrupt-<时间戳> 留档 → 返回 null（重建默认空数据）', async () => {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(filePath, '{"todos":')
    const loaded = await new FileRepository(filePath).load()
    expect(loaded).toBeNull()
    const corrupted = readdirSync(dir).filter((f) => f.startsWith('data.json.corrupt-'))
    expect(corrupted).toHaveLength(1)
  })

  it('G2 rename 前异常：原文件不受损，重试可恢复', async () => {
    const io = makeMemoryIo()
    const repo = new FileRepository('mem://data.json', { io, debounceMs: 0 })
    const v1 = defaultAppData()
    v1.settings.maxItems = 5
    await repo.save(v1)
    await repo.flush()
    const firstWrite = io.files.get('mem://data.json')

    const v2 = defaultAppData()
    v2.settings.maxItems = 9
    io.failRenameOnce()
    await repo.save(v2)
    await expect(repo.flush()).rejects.toThrow('EINTERRUPTED')
    // 原文件仍是 v1
    expect(io.files.get('mem://data.json')).toBe(firstWrite)

    // 重试成功
    await repo.flush()
    const reloaded = await new FileRepository('mem://data.json', { io, debounceMs: 0 }).load()
    expect(reloaded!.settings.maxItems).toBe(9)
  })

  it('G5 防抖合并：300ms 内连续 10 次变更只落少量盘，flush 强制全部落盘', async () => {
    vi.useFakeTimers()
    try {
      const io = makeMemoryIo()
      const repo = new FileRepository('mem://data.json', { io, debounceMs: 100 })
      const data = defaultAppData()
      for (let i = 1; i <= 10; i++) {
        data.settings.maxItems = i
        await repo.save(data)
      }
      // 防抖窗口内尚未写盘
      expect(io.writes.length).toBe(0)
      await vi.advanceTimersByTimeAsync(150)
      // 合并为一次写，内容为最后一次
      expect(io.writes.length).toBe(1)
      const merged = await new FileRepository('mem://data.json', { io, debounceMs: 100 }).load()
      expect(merged!.settings.maxItems).toBe(10)

      // flush：即使处于防抖窗口内也立即落盘
      data.settings.maxItems = 3
      await repo.save(data)
      await repo.flush()
      expect(io.writes.length).toBe(2)
      const afterFlush = await new FileRepository('mem://data.json', { io, debounceMs: 100 }).load()
      expect(afterFlush!.settings.maxItems).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('G4 旧档缺新字段：load 返回补齐默认值后的数据', async () => {
    await import('node:fs').then((fs) => fs.writeFileSync(filePath, JSON.stringify({ todos: [], settings: { maxItems: 2 } })))
    const loaded = await new FileRepository(filePath).load()
    expect(loaded!.v).toBe(1)
    expect(loaded!.archive).toEqual({})
    expect(loaded!.settings.maxItems).toBe(2)
    expect(loaded!.settings.recycleKeep).toBe('never')
    expect(loaded!.uiState.theme).toBe('day')
  })

  it('写盘自动创建父目录', async () => {
    const deep = join(dir, 'a', 'b', 'data.json')
    const repo = new FileRepository(deep)
    await repo.save(defaultAppData())
    await repo.flush()
    expect(existsSync(deep)).toBe(true)
  })
})

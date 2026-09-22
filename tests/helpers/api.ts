import { AppContext } from '../../electron/main/context'
import { MemoryRepository } from '../../src/core/repositories/memory'
import { SystemClock } from '../../src/core/interfaces/clock'
import { defaultAppData, normalizeAppData, type AppData } from '../../src/core/models'
import type { ChildKind, DesktopTodoApi } from '../../src/ipc/contract'

export interface TestApi extends DesktopTodoApi {
  snapshot(): AppData
  emitStateUpdated(data: AppData): void
  autoStartCalls: boolean[]
  savedCsv: Array<{ fileName: string; content: string }>
  openChildCalls: Array<{ kind: ChildKind; id?: string }>
  topMostCalls: boolean[]
  minimizeCalls: number
}

/**
 * 组件/单元测试用内存 API：复用真实领域层（AppContext + MemoryRepository），
 * 使组件测试运行在真实业务规则上（而非 mock 规则）。
 */
export function createTestApi(seed?: Partial<AppData>): TestApi {
  const initial = normalizeAppData({ ...defaultAppData(), ...seed })
  const repo = new MemoryRepository<AppData>(initial)
  const ctx = new AppContext(repo, new SystemClock())
  const listeners = new Set<(d: AppData) => void>()
  const autoStartCalls: boolean[] = []
  const savedCsv: Array<{ fileName: string; content: string }> = []
  const openChildCalls: Array<{ kind: ChildKind; id?: string }> = []
  const topMostCalls: boolean[] = []
  let minimizeCalls = 0

  const booted: Promise<unknown> = ctx.boot()

  const api: TestApi = {
    autoStartCalls,
    savedCsv,
    openChildCalls,
    topMostCalls,
    get minimizeCalls() {
      return minimizeCalls
    },
    snapshot: () => ctx.current(),
    emitStateUpdated(data) {
      listeners.forEach((l) => l(data))
    },
    getState: async () => {
      await booted
      return ctx.current()
    },
    onStateUpdated(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    commit: async (data) => {
      await ctx.commit(data, data.uiState.pos)
      listeners.forEach((l) => l(data))
    },
    flush: async () => undefined,
    setTopMost: async (enabled) => {
      topMostCalls.push(enabled)
    },
    setVisibility: async () => undefined,
    setIgnoreMouseEvents: async () => undefined,
    setAutoStart: async (enabled) => {
      autoStartCalls.push(enabled)
      return true
    },
    saveCsv: async (p) => {
      savedCsv.push(p)
      return `C:\\fake\\${p.fileName}`
    },
    openCsv: async () => null,
    minimizeToTray: async () => {
      minimizeCalls++
    },
    setUnsavedEdits: () => undefined,
    openChild: async (p) => {
      openChildCalls.push(p)
    }
  }
  return api
}

/** 挂载到 window.desktopTodo；返回实例供断言 */
export function installTestApi(seed?: Partial<AppData>): TestApi {
  const api = createTestApi(seed)
  ;(window as unknown as { desktopTodo: TestApi }).desktopTodo = api
  return api
}

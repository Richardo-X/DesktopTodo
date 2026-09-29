import { AppContext } from '../../electron/main/context'
import { MemoryRepository } from '../../src/core/repositories/memory'
import { SystemClock } from '../../src/core/interfaces/clock'
import { defaultAppData, normalizeAppData, type AppData } from '../../src/core/models'
import type { ChildKind, DesktopTodoApi } from '../../src/ipc/contract'

export interface TestApi extends DesktopTodoApi {
  snapshot(): AppData
  emitStateUpdated(data: AppData): void
  autoStartCalls: boolean[]
  bubbleShowCalls: Array<{ text: string; theme: 'day' | 'night'; row: { left: number; top: number; right: number; bottom: number } }>
  bubbleHideCalls: number[]
  autoStartResult: boolean
  savedCsv: Array<{ fileName: string; content: string }>
  openChildCalls: Array<{ kind: ChildKind; id?: string }>
  topMostCalls: boolean[]
  minimizeCalls: number
  closeSelfCalls: number
  resizeSelfCalls: Array<{ width: number; height: number }>
  unsavedCalls: boolean[]
  openCsvCalls: number
  tuckedCalls: boolean[]
  snapListeners: Set<(snapped: boolean) => void>
  cursorInsideListeners: Array<(inside: boolean) => void>
  childCloseListeners: Set<() => void>
  dragStartCalls: number[]
  dragEndCalls: number[]
  batchStateCalls: Array<'todos' | 'templates' | 'history' | null>
  batchStateListeners: Array<(target: 'todos' | 'templates' | 'history' | null) => void>
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
  const bubbleShowCalls: Array<{ text: string; theme: 'day' | 'night'; row: { left: number; top: number; right: number; bottom: number } }> = []
  const bubbleHideCalls: number[] = []
  let autoStartResult = true
  const savedCsv: Array<{ fileName: string; content: string }> = []
  const openChildCalls: Array<{ kind: ChildKind; id?: string }> = []
  const topMostCalls: boolean[] = []
  let minimizeCalls = 0
  let closeSelfCalls = 0
  const resizeSelfCalls: Array<{ width: number; height: number }> = []
  let openCsvCalls = 0
  const unsavedCalls: boolean[] = []
  const tuckedCalls: boolean[] = []
  const snapListeners = new Set<(snapped: boolean) => void>()
  const cursorInsideListeners = Array<(inside: boolean) => void>()
  const childCloseListeners = new Set<() => void>()
  const dragStartCalls: number[] = []
  const dragEndCalls: number[] = []
  const batchStateCalls: Array<'todos' | 'templates' | 'history' | null> = []
  const batchStateListeners: Array<(target: 'todos' | 'templates' | 'history' | null) => void> = []

  const booted: Promise<unknown> = ctx.boot()

  const api: TestApi = {
    autoStartCalls,
    bubbleShowCalls,
    bubbleHideCalls,
    get autoStartResult() {
      return autoStartResult
    },
    set autoStartResult(v: boolean) {
      autoStartResult = v
    },
    savedCsv,
    openChildCalls,
    topMostCalls,
    tuckedCalls,
    snapListeners,
    cursorInsideListeners,
    childCloseListeners,
    dragStartCalls,
    dragEndCalls,
    batchStateCalls,
    batchStateListeners,
    get minimizeCalls() {
      return minimizeCalls
    },
    get closeSelfCalls() {
      return closeSelfCalls
    },
    get resizeSelfCalls() {
      return resizeSelfCalls
    },
    get openCsvCalls() {
      return openCsvCalls
    },
    unsavedCalls,
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
    setAutoStart: async (enabled) => {
      autoStartCalls.push(enabled)
      return autoStartResult
    },
    saveCsv: async (p) => {
      savedCsv.push(p)
      return `C:\\fake\\${p.fileName}`
    },
    openCsv: async () => {
      openCsvCalls++
      return null
    },
    minimizeToTray: async () => {
      minimizeCalls++
    },
    closeSelf: async () => {
      closeSelfCalls++
    },
    resizeSelf: async (params: { width: number; height: number }) => {
      resizeSelfCalls.push(params)
    },
    onWindowMoving: (_cb: (now: number) => void) => () => {},
    bubbleShow: async (p) => {
      bubbleShowCalls.push(p)
    },
    bubbleHide: async () => {
      bubbleHideCalls.push(1)
    },
    bubbleResize: async () => undefined,
    onBubblePayload: (_cb) => () => {},
    onCursorInside: (cb) => {
      cursorInsideListeners.push(cb)
      return () => undefined
    },
    setTucked: async (tucked: boolean) => {
      tuckedCalls.push(tucked)
    },
    onSnapChanged: (cb: (snapped: boolean) => void) => {
      snapListeners.add(cb)
      return () => snapListeners.delete(cb)
    },
    onChildClosed: (cb: () => void) => {
      childCloseListeners.add(cb)
      return () => childCloseListeners.delete(cb)
    },
    setUnsavedEdits: (flag: boolean) => {
      unsavedCalls.push(flag)
    },
    openChild: async (p) => {
      openChildCalls.push(p)
    },
    clusterDragStart: async () => {
      dragStartCalls.push(1)
    },
    clusterDragEnd: async () => {
      dragEndCalls.push(1)
    },
    setBatchState: async (target) => {
      batchStateCalls.push(target)
    },
    onBatchState: (cb) => {
      batchStateListeners.push(cb)
      return () => undefined
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

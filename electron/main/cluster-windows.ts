import { BrowserWindow, screen, type IpcMain } from 'electron'
import { join } from 'node:path'
import { IPC } from '../../src/ipc/contract'
import { applyTopMost } from './window-state'
import { threeWindowBoundsForAnchor, type WinBounds } from '../../src/core/utils/cluster-layout'

/**
 * 批次 A 技术验证（HANDOFF §9.5）：三窗分离 spike——快捷添加/待办/已完成 = 三个独立 BrowserWindow。
 * ①手写整体拖动：弃用 app-region 原生拖动，主进程 16ms（~60fps）光标轮询，
 *   每 tick 锚点+=光标位移，threeWindowBoundsForAnchor 逐窗 setBounds（同一 tick 内三窗=同帧定位）。
 * ②z-order 绑定：任一窗 focus → 三窗按固定顺序 moveTop 同升（防其他软件插入组件中间造成层级交错）。
 * 由 DTODO_CLUSTER_SPIKE=1 启用（bootstrap 分支），默认单窗路径不受影响；
 * 位置/缩放不在此持久化（批次 B 几何迁移落位）。拖动手感需真机验证（§9.3 质量标准 E/F）。
 */

/** 拖动轮询间隔：8ms 对齐标准鼠标 125Hz 上报率——降低拖动滞后，手感更跟手 */
export const SPIKE_DRAG_INTERVAL_MS = 8

interface SpikeState {
  windows: { quick: BrowserWindow | null; main: BrowserWindow; done: BrowserWindow | null }
  anchor: { x: number; y: number }
  scale: number
  quickVisible: boolean
  doneVisible: boolean
}

let spike: SpikeState | null = null
let dragTimer: ReturnType<typeof setInterval> | null = null
let dragStart: { cursor: { x: number; y: number }; anchor: { x: number; y: number } } | null = null
/** 上次已应用锚点：光标静止时跳过冗余 setBounds（Windows 每次调用都是一次原生 SetWindowPos） */
let lastAppliedAnchor: { x: number; y: number } | null = null

function webPreferences(): { preload: string; contextIsolation: boolean; nodeIntegration: boolean; sandbox: boolean } {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false
  }
}

function loadPage(w: BrowserWindow, panel: 'quick' | 'main' | 'done'): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    const u = new URL(process.env.ELECTRON_RENDERER_URL)
    u.search = new URLSearchParams({ win: 'spike', panel }).toString()
    void w.loadURL(u.toString())
  } else {
    void w.loadFile(join(__dirname, '../renderer/index.html'), { query: { win: 'spike', panel } })
  }
}

function makeWindow(panel: 'quick' | 'main' | 'done', bounds: WinBounds, topMost: boolean): BrowserWindow {
  const w = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    thickFrame: false,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    show: false,
    webPreferences: webPreferences()
  })
  // 监听必须先于 loadPage 挂载：极快的小页面 file:// 加载会在 loadPage 返回前触发 ready-to-show
  w.on('ready-to-show', () => {
    w.show()
    if (topMost) applyTopMost(w, true)
  })
  // z-order 绑定：任一窗激活 → 三窗同升
  w.on('focus', () => raiseSpikeAll())
  loadPage(w, panel)
  return w
}

/** 创建 spike 三窗（锚点=待办左上角；隐藏侧窗不创建） */
export function createSpikeCluster(opts: {
  anchor: { x: number; y: number }
  scale: number
  quickVisible: boolean
  doneVisible: boolean
  topMost: boolean
}): void {
  const b = threeWindowBoundsForAnchor(opts.anchor, opts.scale, opts.quickVisible, opts.doneVisible)
  const main = makeWindow('main', b.main, opts.topMost)
  const quick = b.quick ? makeWindow('quick', b.quick, opts.topMost) : null
  const done = b.done ? makeWindow('done', b.done, opts.topMost) : null
  spike = {
    windows: { quick, main, done },
    anchor: opts.anchor,
    scale: opts.scale,
    quickVisible: opts.quickVisible,
    doneVisible: opts.doneVisible
  }
}

/** 三窗同帧定位：一个锚点 → 同一 tick 内逐窗 setPosition（拖动只改位置不改尺寸，
 * setPosition 比 setBounds 少一次尺寸处理，Windows 上明显更顺滑） */
export function applySpikeBounds(anchor: { x: number; y: number }): void {
  if (!spike) return
  if (lastAppliedAnchor && lastAppliedAnchor.x === anchor.x && lastAppliedAnchor.y === anchor.y) return
  const b = threeWindowBoundsForAnchor(anchor, spike.scale, spike.quickVisible, spike.doneVisible)
  spike.anchor = anchor
  lastAppliedAnchor = { x: anchor.x, y: anchor.y }
  const { quick, main, done } = spike.windows
  if (quick && b.quick && !quick.isDestroyed()) quick.setPosition(b.quick.x, b.quick.y)
  if (!main.isDestroyed()) main.setPosition(b.main.x, b.main.y)
  if (done && b.done && !done.isDestroyed()) done.setPosition(b.done.x, b.done.y)
}

/** z-order 绑定：任一窗激活 → 三窗按固定顺序 moveTop 同升（moveTop 不夺焦，不产生焦点抖动） */
export function raiseSpikeAll(): void {
  if (!spike) return
  for (const w of [spike.windows.quick, spike.windows.main, spike.windows.done]) {
    if (w && !w.isDestroyed()) w.moveTop()
  }
}

/** 手写整体拖动开始：记录光标/锚点起点，8ms 轮询系统光标 */
export function startSpikeDrag(): void {
  if (!spike || dragTimer !== null) return
  dragStart = { cursor: screen.getCursorScreenPoint(), anchor: { ...spike.anchor } }
  lastAppliedAnchor = null
  dragTimer = setInterval(() => {
    if (dragStart === null) {
      stopSpikeDrag()
      return
    }
    const pt = screen.getCursorScreenPoint()
    applySpikeBounds({
      x: dragStart.anchor.x + (pt.x - dragStart.cursor.x),
      y: dragStart.anchor.y + (pt.y - dragStart.cursor.y)
    })
  }, SPIKE_DRAG_INTERVAL_MS)
}

/** 拖动结束（渲染层 window pointerup / 页面卸载） */
export function stopSpikeDrag(): void {
  if (dragTimer !== null) {
    clearInterval(dragTimer)
    dragTimer = null
  }
  dragStart = null
}

/** E2E 钩子：跳过真实光标，经同一 applySpikeBounds 路径平移锚点（验证"三窗同帧位移"几何不变量） */
export function spikeDragDeltaBy(dx: number, dy: number): void {
  if (!spike) return
  applySpikeBounds({ x: spike.anchor.x + dx, y: spike.anchor.y + dy })
}

/** 读取三窗当前 OS bounds（E2E 断言用） */
export function getSpikeBounds(): { quick: WinBounds | null; main: WinBounds | null; done: WinBounds | null } {
  if (!spike) return { quick: null, main: null, done: null }
  const read = (w: BrowserWindow | null): WinBounds | null =>
    w && !w.isDestroyed() ? w.getBounds() : null
  return { quick: read(spike.windows.quick), main: read(spike.windows.main), done: read(spike.windows.done) }
}

export function isSpikeActive(): boolean {
  return spike !== null
}

export function closeSpikeWindows(): void {
  stopSpikeDrag()
  if (!spike) return
  for (const w of [spike.windows.quick, spike.windows.main, spike.windows.done]) {
    if (w && !w.isDestroyed()) w.destroy()
  }
  spike = null
}

/** spike 专属 IPC：拖动开始/结束（渲染层标题栏）+ E2E 位移钩子（仅 DTODO_TEST=1） */
export function registerSpikeIpc(ipcMain: IpcMain): void {
  ipcMain.handle(IPC.clusterDragStart, () => startSpikeDrag())
  ipcMain.handle(IPC.clusterDragEnd, () => stopSpikeDrag())
  if (process.env.DTODO_TEST === '1') {
    ipcMain.handle('test:spike-drag-delta', (_e, p: { dx: number; dy: number }) => spikeDragDeltaBy(p.dx, p.dy))
  }
}

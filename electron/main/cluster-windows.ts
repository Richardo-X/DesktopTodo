import { BrowserWindow, screen, type IpcMain } from 'electron'
import { join } from 'node:path'
import { IPC } from '../../src/ipc/contract'
import { applyClusterTopMost } from './window-state'
import { isCloaked, sendWindowToBottom, sysShowWindow, uncloak } from './win32'
import { SNAP_THRESHOLD } from '../../src/core/constants'
import {
  threeWindowBoundsForAnchor,
  clampAnchorForEdges,
  tuckBarBounds,
  effectiveClusterScale,
  type WinBounds
} from '../../src/core/utils/cluster-layout'
import type { WorkArea } from '../../src/core/utils/cluster-layout'

/**
 * 三窗分离架构（v1.1.0 批次 B-1，HANDOFF §9.5/§9.8）：
 * 快捷添加/待办/已完成 = 三个常驻 BrowserWindow（?win=cluster&panel=X）。
 * - 手写整体拖动：任一窗标题栏 pointerdown → 主进程 8ms 光标轮询，每帧 setBounds 重申
 *   逻辑尺寸（跨 DPI 双屏防 Windows 建议矩形复利放大，用户实测）+ 三窗同帧定位
 * - z-order 绑定：任一窗 focus → 三窗 moveTop 同升
 * - 可见性：quickVisible/doneVisible → 侧窗 show/hide（隐藏不占位，锚点不动）
 * - 缩进形态 B：tucked 时侧窗隐藏 + 待办窗收缩为胶囊（渲染层切 tuck-bar，窗口 bounds=胶囊）
 * - 锚点=待办窗左上角（缩放/开关面板唯一不动点，pos 持久化语义=锚点）
 */
export type ClusterPanel = 'quick' | 'main' | 'done'

/** 拖动轮询间隔：8ms 对齐标准鼠标 125Hz 上报率 */
export const CLUSTER_DRAG_INTERVAL_MS = 8

interface ClusterState {
  windows: { quick: BrowserWindow; main: BrowserWindow; done: BrowserWindow }
  anchor: { x: number; y: number }
  scale: number
  quickVisible: boolean
  doneVisible: boolean
  tucked: boolean
  snapped: boolean
  topMost: boolean
  visible: boolean
}

let cluster: ClusterState | null = null
let dragTimer: ReturnType<typeof setInterval> | null = null
let dragStart: { cursor: { x: number; y: number }; anchor: { x: number; y: number } } | null = null
let lastAppliedAnchor: { x: number; y: number } | null = null

function webPreferences(): { preload: string; contextIsolation: boolean; nodeIntegration: boolean; sandbox: boolean } {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false
  }
}

function loadPage(w: BrowserWindow, panel: ClusterPanel): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    const u = new URL(process.env.ELECTRON_RENDERER_URL)
    u.search = new URLSearchParams({ win: 'cluster', panel }).toString()
    void w.loadURL(u.toString())
  } else {
    void w.loadFile(join(__dirname, '../renderer/index.html'), { query: { win: 'cluster', panel } })
  }
}

/** 窗口此刻是否应当可见（ready-to-show/恢复判定的单一来源；cluster 未就绪时视为可见） */
function shouldShowPanel(panel: ClusterPanel): boolean {
  if (!cluster) return true
  if (panel === 'main') return !cluster.tucked
  const visibleFlag = panel === 'quick' ? cluster.quickVisible : cluster.doneVisible
  return cluster.visible && visibleFlag && !cluster.tucked
}

function makeWindow(panel: ClusterPanel, bounds: WinBounds, topMost: boolean): BrowserWindow {
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
    minimizable: false,
    resizable: false,
    movable: true,
    hasShadow: false,
    show: false,
    webPreferences: webPreferences()
  })
  w.on('ready-to-show', () => {
    // 迟到的 ready-to-show 不得复活已被隐藏的窗口（用户实测：点击隐藏后又弹回）
    if (!shouldShowPanel(panel)) return
    applyClusterBounds(true) // 全窗强制落位（三窗 show:false 创建、页面加载有先后，可能全部处于待落位状态）
    // 置顶语义（用户定稿）：topMost=true=最上层可激活；false=挂件态（不可激活+沉底），
    // 启动即挂件态且 showInactive 不抢前台
    if (topMost) {
      w.show()
      applyClusterTopMost(w, true)
    } else {
      w.showInactive()
      applyClusterTopMost(w, false)
      w.setSkipTaskbar(true) // 样式变更会触发 shell 回加任务栏 tab——重申后沉底收尾
      sendWindowToBottom(w.getNativeWindowHandle())
    }
    w.on('blur', () => onClusterWindowBlur())
    // C-1 兜底：任何路径（含系统广播）导致最小化 → 立即恢复（组件不进任务栏/不消失）
    w.on('minimize', () => {
      if (w.isDestroyed() || dragTimer !== null) return
      w.restore()
    })
    const dEvents: Array<'minimize' | 'restore' | 'hide' | 'close'> = ['minimize', 'restore', 'hide', 'close']
    for (const ev of dEvents) {
      w.on(ev as 'minimize', () => {
        if (process.env.DTODO_TEST === '1' || process.env.NODE_ENV !== 'production') {
          console.log('[win-d-dbg]', panel, ev)
        }
      })
    }
  })
  // z-order 绑定：任一窗激活 → 三窗同升（moveTop 不夺焦）
  w.on('focus', () => raiseClusterAll())
  if (panel === 'main') {
    // 待办窗=锚点窗：外部移动（Win+方向键等）经 moved 回写锚点；
    // 拖动（光标轮询自己 setBounds）与缩进胶囊 setBounds 不得污染位置记忆
    let lastMoveThrottled = 0
    w.on('move', () => {
      if (dragTimer !== null) {
        const now = Date.now()
        if (now - lastMoveThrottled < 150) return
        lastMoveThrottled = now
        sendToMain(IPC.windowMoving, now)
      }
    })
    w.on('moved', () => {
      if (dragTimer !== null || !cluster || cluster.tucked) return
      const b = w.getBounds()
      cluster.anchor = { x: b.x, y: b.y }
      detectSnap()
    })
  }
  loadPage(w, panel)
  return w
}

/** 创建三窗（三窗常驻；侧窗按可见性 show/hide） */
export function createClusterWindows(opts: {
  anchor: { x: number; y: number }
  scale: number
  quickVisible: boolean
  doneVisible: boolean
  topMost: boolean
}): void {
  const b = threeWindowBoundsForAnchor(opts.anchor, opts.scale, opts.quickVisible, opts.doneVisible)
  const main = makeWindow('main', b.main, opts.topMost)
  const quick = makeWindow('quick', b.quick ?? b.main, opts.topMost)
  const done = makeWindow('done', b.done ?? b.main, opts.topMost)
  cluster = {
    windows: { quick, main, done },
    anchor: opts.anchor,
    scale: opts.scale,
    quickVisible: opts.quickVisible,
    doneVisible: opts.doneVisible,
    tucked: false,
    snapped: false,
    topMost: opts.topMost,
    visible: true
  }
  if (!opts.quickVisible) quick.hide()
  if (!opts.doneVisible) done.hide()
}

function safe(w: BrowserWindow | null | undefined): w is BrowserWindow {
  return !!w && !w.isDestroyed()
}

/** 发消息给待办主窗（缩进状态机/吸附/光标轮询的唯一渲染层接收方） */
function sendToMain(channel: string, payload?: unknown): void {
  if (!cluster) return
  const { main } = cluster.windows
  if (safe(main)) main.webContents.send(channel, payload)
}

export function getMainWindow(): BrowserWindow | null {
  return cluster && safe(cluster.windows.main) ? cluster.windows.main : null
}

export function getAllClusterWindows(): BrowserWindow[] {
  if (!cluster) return []
  return [cluster.windows.quick, cluster.windows.main, cluster.windows.done].filter(safe)
}

export function getClusterAnchor(): { x: number; y: number } | null {
  return cluster ? { ...cluster.anchor } : null
}

export function clusterTucked(): boolean {
  return !!cluster && cluster.tucked
}

export function isClusterVisible(): boolean {
  return !!cluster && cluster.visible
}

/** 隐藏窗的待落位 bounds（Windows setBounds 会显示隐藏窗，故隐藏期间只登记） */
const pendingBounds = new Map<number, WinBounds>()

/** 显示侧窗：先落位（此时可能顺带显示）再确保可见，几何永远与锚点一致 */
function showSidePanel(panel: ClusterPanel): void {
  if (!cluster) return
  const w = panel === 'quick' ? cluster.windows.quick : cluster.windows.done
  if (!safe(w)) return
  const b = threeWindowBoundsForAnchor(cluster.anchor, cluster.scale, cluster.quickVisible, cluster.doneVisible)
  const bb = panel === 'quick' ? b.quick : b.done
  if (!bb) return
  pendingBounds.delete(w.id)
  w.setBounds(bb)
  if (!w.isVisible()) w.showInactive()
}

/** 三窗同帧定位：一个锚点 → 同一 tick 内逐窗 setBounds（每帧重申逻辑尺寸，压制跨 DPI 复利放大）。
 * placeAll=true（ready-to-show）：无视可见性强制全部落位——三窗 show:false 创建后页面加载有先后，
 * 迟到的 ready-to-show 若只 show 不落位，窗口会出现在旧位置（用户实测） */
export function applyClusterBounds(placeAll = false): void {
  if (!cluster) return
  if (lastAppliedAnchor && lastAppliedAnchor.x === cluster.anchor.x && lastAppliedAnchor.y === cluster.anchor.y) return
  if (cluster.tucked) {
    // 用户验收定稿：胶囊与待办窗口上边缘中心对齐（不算侧窗）——锚点=待办左上角
    const cap = tuckBarBounds({ x: cluster.anchor.x, y: cluster.anchor.y }, Math.round(470 * cluster.scale))
    if (safe(cluster.windows.main)) cluster.windows.main.setBounds(cap)
    lastAppliedAnchor = { x: cluster.anchor.x, y: cluster.anchor.y }
    return
  }
  const b = threeWindowBoundsForAnchor(cluster.anchor, cluster.scale, cluster.quickVisible, cluster.doneVisible)
  const { quick, main, done } = cluster.windows
  // 跨 DPI 校验（#40）：Windows 会对移入不同缩放比屏幕的窗口按建议矩形改写尺寸，
  // 拖回原屏后残留不还原（用户实测图3~5）——实测主窗尺寸偏离逻辑值 >1px 即本次全窗强制重申
  const actualMain = main.isVisible() ? main.getBounds() : null
  const needPlaceAll =
    placeAll ||
    (actualMain !== null &&
      (Math.abs(actualMain.width - b.main.width) > 1 || Math.abs(actualMain.height - b.main.height) > 1))
  // 隐藏窗跳过 setBounds：Windows 上对隐藏窗口 setBounds 会将其显示（用户实测点击隐藏后又弹回）；
  // 几何登记到 pendingBounds，showSidePanel 显示时先落位。
  // 落位顺序 done→main→quick：用户最敏感的快捷窗最后落位（缝隙错帧最后闭合）
  for (const [w, bb] of [
    [done, b.done ?? b.main],
    [main, b.main],
    [quick, b.quick ?? b.main]
  ] as const) {
    if (!safe(w)) continue
    if (!needPlaceAll && !w.isVisible()) pendingBounds.set(w.id, bb)
    else {
      pendingBounds.delete(w.id)
      w.setBounds(bb)
    }
  }
  lastAppliedAnchor = { x: cluster.anchor.x, y: cluster.anchor.y }
}

/** z-order 绑定：任一窗激活 → 三窗按固定顺序 moveTop 同升。
 * 跳过隐藏窗（缩进侧窗/托盘隐藏）：Windows 的 moveTop 会把隐藏窗口带出来
 * （用户实测：胶囊态托盘显示后侧窗复活）——重新显示走 showSidePanel 落位路径 */
export function raiseClusterAll(): void {
  if (!cluster) return
  for (const w of [cluster.windows.quick, cluster.windows.main, cluster.windows.done]) {
    if (safe(w) && w.isVisible()) w.moveTop()
  }
}

/**
 * 按 uiState 同步三窗（commit 后的单一入口）：
 * 缩放（决策#23 按待办窗所在屏钳制）、面板可见性（show/hide，锚点不动）。
 * tucked 是运行时状态（不经 uiState 持久化），仅由 setClusterTucked 改写，此处不触碰。
 */
export function syncClusterBounds(ui: {
  clusterScale: number
  quickVisible: boolean
  doneVisible: boolean
}): void {
  if (!cluster) return
  const mainBounds = safe(cluster.windows.main) ? cluster.windows.main.getBounds() : null
  const wa: WorkArea = mainBounds
    ? screen.getDisplayMatching(mainBounds).workArea
    : screen.getPrimaryDisplay().workArea
  cluster.scale = effectiveClusterScale(ui.clusterScale, wa, ui.quickVisible, ui.doneVisible)
  cluster.quickVisible = ui.quickVisible
  cluster.doneVisible = ui.doneVisible
  const { quick, done } = cluster.windows
  if (safe(quick)) {
    if (ui.quickVisible && cluster.visible && !cluster.tucked) showSidePanel('quick')
    else quick.hide()
  }
  if (safe(done)) {
    if (ui.doneVisible && cluster.visible && !cluster.tucked) showSidePanel('done')
    else done.hide()
  }
  lastAppliedAnchor = null
  applyClusterBounds()
}

/** 缩进切换（渲染层状态机经 IPC setTucked）。
 * 弹出（v=false）：先落位并显示侧窗，最后主窗从胶囊展开——三窗呈现同步（用户验收#4） */
export function setClusterTucked(v: boolean): void {
  if (!cluster) return
  cluster.tucked = v
  const { quick, done, main } = cluster.windows
  if (v) {
    // 缩进：先藏侧窗，主窗收胶囊
    if (safe(quick)) quick.hide()
    if (safe(done)) done.hide()
    lastAppliedAnchor = null
    applyClusterBounds()
    return
  }
  // 弹出：侧窗先落位显示（带完整内容），主窗最后从胶囊展开
  if (safe(quick) && cluster.quickVisible && cluster.visible) showSidePanel('quick')
  if (safe(done) && cluster.doneVisible && cluster.visible) showSidePanel('done')
  lastAppliedAnchor = null
  applyClusterBounds()
  if (safe(main) && !main.isVisible() && cluster.topMost) main.show()
  else if (safe(main) && !main.isVisible()) main.showInactive()
}

/** 吸附检测：待办窗顶边触碰工作区顶 → 三窗贴齐；状态变化通知待办窗状态机 */
export function detectSnap(): void {
  if (!cluster || cluster.tucked) return
  const { main } = cluster.windows
  if (!safe(main)) return
  // 主窗所在屏的工作区（双屏：副屏上的组件按副屏顶边吸附）
  const wa = screen.getDisplayMatching(main.getBounds()).workArea
  const b = main.getBounds()
  const now = b.y - wa.y <= SNAP_THRESHOLD
  if (now && b.y !== wa.y) {
    cluster.anchor = { x: cluster.anchor.x, y: wa.y }
    lastAppliedAnchor = null
    applyClusterBounds()
    return
  }
  if (now !== cluster.snapped) {
    cluster.snapped = now
    sendToMain(IPC.snapChanged, now)
  }
}

/** 手写整体拖动开始：记录光标/锚点起点，8ms 轮询系统光标 */
export function startClusterDrag(): void {
  if (!cluster || dragTimer !== null) return
  dragStart = { cursor: screen.getCursorScreenPoint(), anchor: { ...cluster.anchor } }
  lastAppliedAnchor = null
  let tick = 0
  dragTimer = setInterval(() => {
    if (dragStart === null) {
      stopClusterDrag()
      return
    }
    const pt = screen.getCursorScreenPoint()
    applyAnchor({
      x: dragStart.anchor.x + (pt.x - dragStart.cursor.x),
      y: dragStart.anchor.y + (pt.y - dragStart.cursor.y)
    })
    // 原生调用降频：detectSnap/DPI 校验每 4 tick（32ms）一次——8ms 满频时原生调用
    // 堆叠会拉长帧耗时，表现为缝隙错帧抖动（用户实测快捷窗最明显）
    tick += 1
    if (tick % 4 === 0) detectSnap()
  }, CLUSTER_DRAG_INTERVAL_MS)
}

/** 是否处于拖动/缩放热路径中（index.ts 据此决定提交是否免落盘） */
export function isClusterDragging(): boolean {
  return dragTimer !== null
}

/** 拖动结束（渲染层 window pointerup） */
export function stopClusterDrag(): void {
  if (dragTimer !== null) {
    clearInterval(dragTimer)
    dragTimer = null
  }
  dragStart = null
}

function applyAnchor(anchor: { x: number; y: number }): void {
  if (!cluster) return
  const mainBounds = safe(cluster.windows.main) ? cluster.windows.main.getBounds() : null
  const wa: WorkArea = mainBounds
    ? screen.getDisplayMatching(mainBounds).workArea
    : screen.getPrimaryDisplay().workArea
  // #31/#32：拖动钳制——左右不阻挡、主窗≥90px；按主窗所在屏工作区
  cluster.anchor = clampAnchorForEdges(anchor, Math.round(470 * cluster.scale), wa)
  lastAppliedAnchor = null
  applyClusterBounds()
}

/** E2E 钩子：跳过真实光标，经同一 applyClusterBounds 路径平移锚点 */
export function clusterDragDeltaBy(dx: number, dy: number): void {
  if (!cluster) return
  applyAnchor({ x: cluster.anchor.x + dx, y: cluster.anchor.y + dy })
}

/** 托盘隐藏=组件整体隐藏（决策#9）；拖动中隐藏则终止轮询 */
export function hideCluster(): void {
  if (!cluster) return
  stopClusterDrag()
  cluster.visible = false
  for (const w of getAllClusterWindows()) w.hide()
}

/** 显示=整体恢复（含置顶重应用——hide/show 可能重置 z-order）。
 * 胶囊态只显主窗短条；展开态 placeAll 强制全窗落位（修跨 DPI 尺寸残留——用户实测最小化再显示自愈，此处显式化） */
export function showCluster(): void {
  if (!cluster) return
  cluster.visible = true
  lastAppliedAnchor = null
  const { quick, main, done } = cluster.windows
  if (cluster.tucked) {
    applyClusterBounds()
    if (safe(main)) (cluster.topMost ? main.show() : main.showInactive())
    return
  } else {
    applyClusterBounds(true)
    // 未置顶=挂件态：showInactive 显示不激活（show 会激活浮到最前）
    if (safe(main)) (cluster.topMost ? main.show() : main.showInactive())
    if (safe(quick)) {
      if (cluster.quickVisible) showSidePanel('quick')
      else quick.hide()
    }
    if (safe(done)) {
      if (cluster.doneVisible) showSidePanel('done')
      else done.hide()
    }
  }
  applyTopMostToCluster(cluster.topMost)
}

/**
 * 置顶判定（用户定稿 2026-10-02 第三轮）：
 * - 开置顶：三窗最上层+可激活
 * - 关置顶瞬间组件持有焦点 → 保持现状（依旧在窗口上方、可交互），不立即沉底；
 *   点击其他非组件位置（三窗全失焦）→ 整体立即沉底 + 挂件态（不可激活，点击不浮上来）
 * - 关置顶瞬间焦点不在组件 → 立即沉底 + 挂件态
 */
let pendingSinkOnBlur = false

export function applyTopMostToCluster(enabled: boolean): void {
  if (!cluster) return
  cluster.topMost = enabled
  if (enabled) {
    pendingSinkOnBlur = false
    for (const w of getAllClusterWindows()) if (safe(w)) applyClusterTopMost(w, true)
    return
  }
  // 焦点判定必须先于 focusable 变更——setFocusable(false) 会杀掉焦点
  const anyFocused = getAllClusterWindows().some((w) => safe(w) && w.isFocused())
  if (anyFocused) {
    // 组件持有焦点：仅降层（普通层顶端=仍在窗口上方、保持可交互不沉底），
    // 点击其他非组件位置三窗全失焦后整体沉底+挂件态
    pendingSinkOnBlur = true
    for (const w of getAllClusterWindows()) if (safe(w)) w.setAlwaysOnTop(false, 'screen-saver')
  } else {
    enterWidgetMode()
  }
}

/** 挂件态：不可激活（点击不浮上来）+ 整体沉底（HWND_BOTTOM）。
 * 顺序关键（z 序探针实测）：setFocusable 的样式变更（SetWindowLong）会异步重插
 * z 序（窗口被抬回普通层顶端）——重排落地前沉底必被覆盖。因此：先完成全部
 * 样式变更，等其落地后再沉底（120ms），外加 400ms 兜底二次沉底 */
function enterWidgetMode(): void {
  if (!cluster) return
  pendingSinkOnBlur = false
  for (const w of getAllClusterWindows()) {
    if (safe(w)) applyClusterTopMost(w, false)
  }
  // skipTaskbar 重申先于沉底：它的 shell 重排不能盖过沉底（沉底必须是最后动作）
  const reassertSkipTaskbar = (): void => {
    for (const w of getAllClusterWindows()) {
      if (safe(w)) w.setSkipTaskbar(true)
    }
  }
  const sinkAll = (): void => {
    for (const w of getAllClusterWindows()) {
      if (safe(w)) sendWindowToBottom(w.getNativeWindowHandle())
    }
  }
  setTimeout(() => {
    reassertSkipTaskbar()
    sinkAll()
  }, 120)
  setTimeout(() => {
    reassertSkipTaskbar()
    sinkAll()
  }, 400)
}

/** 三窗 blur（点击其他非组件位置）→ 全失焦即沉底（判定第二段）。
 * blur 事件触发时 Chromium 内部焦点状态尚未更新（isFocused 仍返回旧值 true）——
 * 延迟一拍再判定；焦点在簇内转移（quick→main）时延迟后见其他窗 focused，不误沉 */
function onClusterWindowBlur(): void {
  if (!cluster || cluster.topMost || !pendingSinkOnBlur) return
  setTimeout(() => {
    if (!cluster || cluster.topMost || !pendingSinkOnBlur) return
    const allBlurred = getAllClusterWindows().every((w) => safe(w) && !w.isFocused())
    if (allBlurred) enterWidgetMode()
  }, 60)
}

/** 分辨率变化/拔显示器：按主窗可见拉回（#33），锚点随位移更新 */
export function repositionClusterToDisplays(displays: { workArea: WinBounds }[]): void {
  if (!cluster) return
  const main = cluster.windows.main
  if (!safe(main)) return
  const b = main.getBounds()
  const next = ((): { x: number; y: number } => {
    let best: { x: number; y: number } | null = null
    for (const d of displays) {
      const wa = d.workArea
      const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - Math.min(b.width, wa.width))
      const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - Math.min(b.height, wa.height))
      const inside = b.x + b.width > wa.x && b.x < wa.x + wa.width && b.y + b.height > wa.y && b.y < wa.y + wa.height
      if (inside) return { x: b.x, y: b.y }
      if (best === null) best = { x, y }
    }
    return best ?? { x: b.x, y: b.y }
  })()
  if (next.x === b.x && next.y === b.y) return
  applyAnchor(next)
}

/** C-1 轮询反制：Win+D 经 DWM cloak 隐藏组件（无事件可拦）——
 * 300ms 周期检测，被 cloak 即无激活重新显示（用户可见≤300ms 的闪没后回位）。
 * 组件整体隐藏（托盘 hideToTray）时跳过——那是合法隐藏 */
export function startCloakGuard(): void {
  if (process.platform !== 'win32') return
  setInterval(() => {
    if (!cluster || !cluster.visible) return
    for (const w of getAllClusterWindows()) {
      if (safe(w) && w.isVisible() && isCloaked(w.getNativeWindowHandle())) {
        console.log('[cloak-dbg] cloaked window detected, uncloaking')
        uncloak(w.getNativeWindowHandle())
      }
    }
  }, 300)
}

/** 缩进判定光标轮询：光标是否在可见组件范围内（缩进态=胶囊窗本体）；
 * 状态变化推送待办窗（权威驱动，DOM 事件不参与——三轮8.2-1） */
export function startTuckCursorPoll(): void {
  let lastInside = true
  setInterval(() => {
    if (!cluster || !cluster.visible) return
    const pt = screen.getCursorScreenPoint()
    let inside = false
    if (cluster.tucked) {
      const m = cluster.windows.main
      inside = safe(m) && contains(m.getBounds(), pt)
    } else {
      for (const w of [cluster.windows.quick, cluster.windows.main, cluster.windows.done]) {
        if (safe(w) && w.isVisible() && contains(w.getBounds(), pt)) {
          inside = true
          break
        }
      }
    }
    if (inside !== lastInside) {
      lastInside = inside
      sendToMain(IPC.cursorInside, inside)
    }
  }, 200)
}

function contains(b: WinBounds, pt: { x: number; y: number }): boolean {
  return pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height
}

/** spike→生产：拖动 IPC（标题栏）+ E2E 位移钩子（仅 DTODO_TEST=1） */
/** 测试调试：集群状态快照（DTODO_TEST=1 经 test:cluster-state 暴露） */
export function clusterDebugState(): Record<string, unknown> | null {
  if (!cluster) return null
  return {
    tucked: cluster.tucked,
    quickVisible: cluster.quickVisible,
    doneVisible: cluster.doneVisible,
    visible: cluster.visible,
    quickVis: cluster.windows.quick.isVisible(),
    mainVis: cluster.windows.main.isVisible(),
    doneVis: cluster.windows.done.isVisible(),
    quickBounds: cluster.windows.quick.getBounds(),
    mainBounds: cluster.windows.main.getBounds()
  }
}

export function registerClusterIpc(ipcMain: IpcMain): void {
  ipcMain.handle(IPC.clusterDragStart, () => startClusterDrag())
  ipcMain.handle(IPC.clusterDragEnd, () => stopClusterDrag())
  if (process.env.DTODO_TEST === '1') {
    ipcMain.handle('test:cluster-drag-delta', (_e, p: { dx: number; dy: number }) => clusterDragDeltaBy(p.dx, p.dy))
    ipcMain.handle('test:cluster-state', () => clusterDebugState())
    ipcMain.handle('test:sys-show-window', (_e, cmd: number) => {
      const m = cluster?.windows.main
      if (m && safe(m)) sysShowWindow(m.getNativeWindowHandle(), cmd)
      return true
    })
    ipcMain.handle('test:drag-state', () => ({ dragging: dragTimer !== null }))
    // 置顶判定 E2E：可见窗口 z 序链（顶到底）——沉底/置顶断言用

  }
}

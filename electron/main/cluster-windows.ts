import { app, BrowserWindow, screen, type IpcMain } from 'electron'
import { join } from 'node:path'
import { IPC } from '../../src/ipc/contract'
import { applyClusterTopMost } from './window-state'
import {
  disableDwmTransitions,
  getDwmTransitionsDisabled,
  getWindowExstyleFlags,
  makeToolWindow,
  postWmClose,
  screenPixelAt,
  sysShowWindow
} from './win32'
import { SNAP_THRESHOLD, TUCK_BAR_WIDTH, TUCK_BAR_HEIGHT } from '../../src/core/constants'
import {
  threeWindowBoundsForAnchor,
  clampAnchorForEdges,
  tuckBarBounds,
  effectiveClusterScale,
  quickCanvasMaxScale,
  quickCanvasBoundsForAnchor,
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
 * - 缩进形态 B：tucked 时侧窗隐藏 + 待办窗收缩为胶囊（渲染层切 tuck-bar，屏内可见区=胶囊热区，
 *   系统最小窗高撑出的余高挂屏幕上方——2026-10-16）
 * - 锚点=待办窗左上角（缩放/开关面板唯一不动点，pos 持久化语义=锚点）
 */
export type ClusterPanel = 'quick' | 'main' | 'done'

/** 拖动轮询间隔：8ms 对齐标准鼠标 125Hz 上报率 */
export const CLUSTER_DRAG_INTERVAL_MS = 8

interface ClusterState {
  windows: { quick: BrowserWindow; main: BrowserWindow; done: BrowserWindow; bar: BrowserWindow }
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

/** 快捷窗画布 maxScale（缩放抖动根治，方案《技术手册-快捷窗缩放修复-移植Electron版》§2-步骤1）：
 * 画布=当前工作区可达的最大档。只在工作区/可见性变化时重算（key 比对，缩放手势中绝不重算）；
 * 画布矩形在摆放时由 (anchor, maxScale) 现算——scale 不是输入，档位变化画布不动。 */
let quickCanvasMax = 1
let quickCanvasKey = ''
function refreshQuickCanvasScale(wa: WorkArea, quickVisible: boolean, doneVisible: boolean): void {
  const key = `${wa.x},${wa.y},${wa.width},${wa.height}|${quickVisible ? 1 : 0}${doneVisible ? 1 : 0}`
  if (key === quickCanvasKey) return
  quickCanvasKey = key
  quickCanvasMax = quickCanvasMaxScale(wa, quickVisible, doneVisible)
}

/** 快捷窗画布矩形（所有摆放路径统一用这套矩形——WPF P9 铁律） */
function quickCanvasBounds(): WinBounds {
  return quickCanvasBoundsForAnchor(cluster!.anchor, quickCanvasMax)
}
let dragTimer: ReturnType<typeof setInterval> | null = null
let dragStart: { cursor: { x: number; y: number }; anchor: { x: number; y: number } } | null = null
let lastAppliedAnchor: { x: number; y: number } | null = null

/** Alt+F4/系统关闭（WM_CLOSE）= 强制退出整个应用（用户 2026-10-05 裁定，无确认框；
 * before-quit 数据落盘照走）。防重入：退出流程中后续 close 事件不再重复触发 */
let quitRequested = false

/** 缩进态托盘恢复的自动弹出会话（用户 2026-10-05 新需求）：
 * 会话期内光标轮询强制 inside=true（状态机保持弹出），到期恢复真实判定 */
const AUTO_EXPAND_MS = 3000
let autoExpandUntil = 0
/** 二级窗开着（模态锁）：缩进禁止、窗口保持弹出——3 秒弹出会话不武装（用户 2026-10-08 裁定） */
let modalChildOpen = false
export function setModalChildOpen(open: boolean): void {
  modalChildOpen = open
  if (open) autoExpandUntil = 0 // 取消计时：二级窗开着期间不自动缩回
}

/** 缩进锁定镜像（2026-10-17 P1/P2）：锁定态下"停留 3 秒会话"不武装、锁定时清除挂起会话。
 * 由 uiState 提交路径同步（commit 时读 uiState.tuckLock；启动时随引导传入） */
let tuckLocked = false
export function setTuckLocked(on: boolean): void {
  tuckLocked = on
  if (on) autoExpandUntil = 0 // 锁定时清除挂起会话：锁定=贴边保持弹出，无"停留后缩回"语义
}

/** E2E fake 光标（CI 虚拟鼠标不移动系统光标，GetCursorScreenPoint 不可判定） */
let fakeCursorPoint: { x: number; y: number } | null = null
function cursorPoint(): { x: number; y: number } {
  return fakeCursorPoint ?? screen.getCursorScreenPoint()
}

function requestAppQuit(): void {
  if (quitRequested) return
  quitRequested = true
  app.quit()
}

/** E2E 钩子：按 panel 名取组件窗口句柄上发 WM_CLOSE（Alt+F4 系统等价物） */
export function sysWmCloseToPanel(panel: string): boolean {
  if (!cluster) return false
  const w = panel === 'quick' ? cluster.windows.quick : panel === 'done' ? cluster.windows.done : cluster.windows.main
  if (!safe(w)) return false
  return postWmClose(w.getNativeWindowHandle())
}

function webPreferences(): { preload: string; contextIsolation: boolean; nodeIntegration: boolean; sandbox: boolean } {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false
  }
}

function loadPage(w: BrowserWindow, panel: ClusterPanel, seedScale?: number): void {
  // 快捷窗画布方案：scale 经 URL 播种为渲染层初值（store 异步加载前的首帧防跳变）；
  // 之后仍以广播的 uiState.clusterScale 为唯一权威（只播种子，不构成第二信源）
  const extra: Record<string, string> = {}
  if (seedScale !== undefined) extra.scale = String(Math.round(seedScale * 10000) / 10000)
  if (process.env.ELECTRON_RENDERER_URL) {
    const u = new URL(process.env.ELECTRON_RENDERER_URL)
    const q = new URLSearchParams({ win: 'cluster', panel })
    for (const [k, v] of Object.entries(extra)) q.set(k, v)
    u.search = q.toString()
    void w.loadURL(u.toString())
  } else {
    void w.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { win: 'cluster', panel, ...extra }
    })
  }
}

/** 窗口此刻是否应当可见（ready-to-show/恢复判定的单一来源；cluster 未就绪时视为可见） */
function shouldShowPanel(panel: ClusterPanel): boolean {
  if (!cluster) return true
  if (panel === 'main') return !cluster.tucked
  const visibleFlag = panel === 'quick' ? cluster.quickVisible : cluster.doneVisible
  return cluster.visible && visibleFlag && !cluster.tucked
}

function makeWindow(panel: ClusterPanel, bounds: WinBounds, topMost: boolean, seedScale?: number): BrowserWindow {
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
  disableDwmTransitions(w.getNativeWindowHandle()) // 关系统"出现/消失"过渡动画（显隐弹动根因，2026-10-09 用户慢放实锤）
  w.on('ready-to-show', () => {
    // 迟到的 ready-to-show 不得复活已被隐藏的窗口（用户实测：点击隐藏后又弹回）
    if (!shouldShowPanel(panel)) return
    applyClusterBounds(true) // 全窗强制落位（三窗 show:false 创建、页面加载有先后，可能全部处于待落位状态）
    // 置顶语义（用户定稿 2026-10-06）：topMost=true=最上层可激活；
    // false=普通窗口层级（不沉底、不锁激活、点击浮上来获焦点）
    if (topMost) {
      w.show()
      applyClusterTopMost(w, true)
    } else {
      w.showInactive()
      applyClusterTopMost(w, false)
      w.setSkipTaskbar(true) // 重申任务栏排除（样式变更可能触发 shell 回加 tab）
    }
    // 显隐语义最终版：未置顶=普通窗口行为（Win+M/系统最小化后保持最小化，托盘恢复）；
    // 置顶=Win+M 免疫（最小化即恢复兜底；Win+D 靠置顶带常驻天然豁免）
    w.on('minimize', () => {
      if (w.isDestroyed() || dragTimer !== null) return
      if (clusterTopMost()) w.restore()
    })
    // Alt+F4/系统关闭（WM_CLOSE）= 强制退出整个应用（无确认框；before-quit 落盘照走）
    w.on('close', () => {
      requestAppQuit()
    })
    // 工具窗口样式：组件不进任务栏/Alt+Tab（UI 设计决策，2026-10-05 确认保留）
    makeToolWindow(w.getNativeWindowHandle())
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
  loadPage(w, panel, seedScale)
  return w
}

/** 白条窗页面加载（缩进改造步1：白条=独立第 4 窗） */
function loadBarPage(w: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    const u = new URL(process.env.ELECTRON_RENDERER_URL)
    u.search = new URLSearchParams({ win: 'bar' }).toString()
    void w.loadURL(u.toString())
  } else {
    void w.loadFile(join(__dirname, '../renderer/index.html'), { query: { win: 'bar' } })
  }
}

/** 白条独立窗（2026-10-17 §11.K 步1）：160×热区、贴工作区顶、水平=主窗上缘中心（用户裁定保持现状口径）。
 * 常驻透明（不 hide，防 show/hide 表面重建闪动）：缩进态=亮起+可命中（元素 mouseenter 真实命中，
 * 被遮挡天然不弹）；展开态=透明度 0+穿鼠标 */
function makeBarWindow(topMost: boolean): BrowserWindow {
  const w = new BrowserWindow({
    x: -32000,
    y: -32000,
    width: TUCK_BAR_WIDTH,
    height: TUCK_BAR_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    thickFrame: false,
    skipTaskbar: true,
    minimizable: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    show: false,
    webPreferences: webPreferences()
  })
  disableDwmTransitions(w.getNativeWindowHandle())
  w.on('ready-to-show', () => {
    // 落位（此时可能已被 applyBarBounds 请求过；重申保证首帧位置正确）→ 透明待机基态
    applyBarBounds()
    w.showInactive()
    hideBarWindow()
    if (topMost) applyClusterTopMost(w, true)
    else w.setSkipTaskbar(true)
    w.on('focus', () => raiseClusterAll())
    w.on('close', () => requestAppQuit())
    makeToolWindow(w.getNativeWindowHandle())
  })
  loadBarPage(w)
  return w
}

/** 白条窗摆放：水平=主窗上缘中心（现状口径，用户 2026-10-17 裁定）；系统最小窗高（实测 ~37-40，随 DPI）
 * 钳制多出的部分整体挂到屏幕上方（屏外不可命中）——屏内可见区=热区本身（同 v1.1.5 主窗校正） */
function applyBarBounds(): void {
  if (!cluster) return
  const bar = cluster.windows.bar
  if (!safe(bar)) return
  const cap = tuckBarBounds({ x: cluster.anchor.x, y: cluster.anchor.y }, Math.round(470 * cluster.scale))
  const targetBottom = cap.y + cap.height
  bar.setBounds(cap)
  for (let i = 0; i < 3; i++) {
    const cb = bar.getContentBounds()
    const delta = targetBottom - (cb.y + cb.height)
    if (Math.abs(delta) < 1) break
    const b = bar.getBounds()
    bar.setBounds({ x: b.x, y: b.y + delta, width: cap.width, height: cap.height })
  }
}

/** 缩进态：白条亮起并可命中（真实命中=元素 mouseenter；被遮挡天然不弹） */
function showBarWindow(): void {
  if (!cluster || !cluster.visible) return
  const bar = cluster.windows.bar
  if (!safe(bar)) return
  applyBarBounds()
  if (!bar.isVisible()) bar.showInactive()
  bar.setOpacity(1)
  bar.setIgnoreMouseEvents(false)
  if (!modalChildOpen) bar.moveTop()
}

/** 非缩进态/托盘隐藏：白条透明待机 + 穿鼠标（不 hide） */
function hideBarWindow(): void {
  const bar = cluster?.windows.bar
  if (!safe(bar)) return
  bar.setIgnoreMouseEvents(true)
  bar.setOpacity(0)
}

/** 主窗缩进态=透明待机（与侧窗同款，2026-10-17 步1）：不 hide（防表面重建闪动）、穿鼠标、几何不动 */
function veilMainWindow(veiled: boolean): void {
  const main = cluster?.windows.main
  if (!safe(main)) return
  if (veiled) {
    main.setIgnoreMouseEvents(true)
    main.setOpacity(0)
  } else {
    main.setOpacity(1)
    main.setIgnoreMouseEvents(false)
  }
}

/** 创建三窗+白条窗（三窗+白条常驻；侧窗按可见性 show/hide、白条按缩进态亮/隐） */
export function createClusterWindows(opts: {
  anchor: { x: number; y: number }
  scale: number
  quickVisible: boolean
  doneVisible: boolean
  topMost: boolean
}): void {
  // 画布 maxScale 首算（锚点所在屏工作区；之后仅工作区/可见性变化时重算）
  quickCanvasKey = ''
  refreshQuickCanvasScale(
    screen.getDisplayNearestPoint(opts.anchor).workArea,
    opts.quickVisible,
    opts.doneVisible
  )
  const b = threeWindowBoundsForAnchor(opts.anchor, opts.scale, opts.quickVisible, opts.doneVisible)
  const main = makeWindow('main', b.main, opts.topMost)
  // 快捷窗=固定画布窗（尺寸恒定；缩放档位变化不改变本矩形）
  const quick = makeWindow('quick', quickCanvasBoundsForAnchor(opts.anchor, quickCanvasMax), opts.topMost, opts.scale)
  const done = makeWindow('done', b.done ?? b.main, opts.topMost)
  const bar = makeBarWindow(opts.topMost)
  cluster = {
    windows: { quick, main, done, bar },
    anchor: opts.anchor,
    scale: opts.scale,
    quickVisible: opts.quickVisible,
    doneVisible: opts.doneVisible,
    tucked: false,
    snapped: false,
    topMost: opts.topMost,
    visible: true
  }
  // 创建期尚未首显：常驻窗预设透明+穿透（与后续显隐语义一致），非常驻窗真 hide
  // 快捷窗画布基态：forward 全穿透（首个 show 前即就位）
  if (!opts.quickVisible) hideSideWindow(quick, 'quick')
  else applyQuickMouseIgnoreBase(quick)
  if (!opts.doneVisible) hideSideWindow(done, 'done')
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
  return [cluster.windows.quick, cluster.windows.main, cluster.windows.done, cluster.windows.bar].filter(safe)
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

/** 组件真实置顶语义（Win+D 抢跑守卫的判定输入；绝不改写） */
export function clusterTopMost(): boolean {
  return !!cluster && cluster.topMost
}

/** 隐藏窗的待落位 bounds（Windows setBounds 会显示隐藏窗，故隐藏期间只登记） */
const pendingBounds = new Map<number, WinBounds>()

/** 透明常驻侧窗集合（C4 批次1 done 动态内容窗先行；批次2 quick 跟进——机制同源共用）。
 * hide→Chromium 挂起 GPU 表面，再显示时表面重建产生"出现→快速消失→再出现"三段闪动
 * （气泡同源问题，用户视频慢放实锤+气泡 A/B 对照验证透明常驻有效）。
 * 常驻窗隐藏=透明度 0+鼠标穿透（物理可见、表面永不销毁），显示=关穿透+拧亮。 */
const PERSISTENT_SIDE_PANELS: ReadonlySet<ClusterPanel> = new Set(['done', 'quick'])

/** 侧窗物理常驻？透明常驻窗 isVisible 恒 true，可见性判定一律走本函数 */
function isPersistent(panel: ClusterPanel): boolean {
  return PERSISTENT_SIDE_PANELS.has(panel)
}

/** 视觉可见判据（光标命中/模态唤醒等一切"窗在不在那"的判定统一入口）：
 * 物理可见 且 透明度>0——对真 hide 窗与透明待机窗语义一致 */
function sideWindowVisible(w: BrowserWindow): boolean {
  return w.isVisible() && w.getOpacity() > 0
}

/** 侧窗隐藏：常驻窗透明待机+穿透（不挡桌面），非常驻窗真 hide */
function hideSideWindow(w: BrowserWindow, panel: ClusterPanel): void {
  if (!safe(w)) return
  if (isPersistent(panel)) {
    w.setIgnoreMouseEvents(true)
    if (panel === 'quick') {
      quickMouseIgnore = true
      notifyQuickHitReset(w) // 隐藏=基态重置：渲染层命中记忆同步失效
    }
    w.setOpacity(0)
  } else {
    w.hide()
  }
}

/** 该窗口是否为快捷簇窗（画布命中切换 IPC 的权限门） */
export function isQuickClusterWindow(w: BrowserWindow): boolean {
  return !!cluster && safe(cluster.windows.quick) && w === cluster.windows.quick
}

/** 快捷窗穿透态跟踪（E2E 断言用；Electron 类型无 getIgnoreMouseEvents）。
 * 一切写入走本函数/显隐路径维护，基态=true（forward 全穿透） */
let quickMouseIgnore: boolean | null = null

/** 快捷窗穿透基态（显示/创建时）：forward 全穿透——命中切换由渲染层 hit-test 接管。
 * 每次重置基态都通知渲染层清空命中记忆（否则"记忆=命中"会短路后续卡面内 move，
 * 卡面持续穿透不可交互——2026-10-17 用户报告，v1.1.2 画布命中引入的旧缺陷） */
function applyQuickMouseIgnoreBase(w: BrowserWindow): void {
  w.setIgnoreMouseEvents(true, { forward: true })
  quickMouseIgnore = true
  notifyQuickHitReset(w)
}

/** 命中记忆失效通知（渲染层清空 cardHitInside，待下一次 move 重新断言真实状态） */
function notifyQuickHitReset(w: BrowserWindow | null | undefined): void {
  if (!safe(w)) return
  w.webContents.send(IPC.quickHitReset)
}

/** 渲染层 hit-test 切换入口（仅快捷窗；隐藏态不会被调用——forward 关闭收不到 move） */
export function setQuickMouseIgnore(ignore: boolean): void {
  if (!cluster || !safe(cluster.windows.quick)) return
  cluster.windows.quick.setIgnoreMouseEvents(ignore, { forward: true })
  quickMouseIgnore = ignore
}

export function quickMouseIgnoreState(): boolean | null {
  return quickMouseIgnore
}

/** 显示侧窗：先落位（此时可能顺带显示）再确保可见，几何永远与锚点一致。
 * 重新显示会重置隐藏期间设置的置顶带成员（真机第十轮：藏侧窗→开置顶→展开→
 * Win+D 侧窗被藏）——按真实置顶语义/抢设状态重申 */
function showSidePanel(panel: ClusterPanel): void {
  if (!cluster) return
  const w = panel === 'quick' ? cluster.windows.quick : cluster.windows.done
  if (!safe(w)) return
  // 快捷窗=画布矩形（恒定）；已完成窗=锚点推导矩形（机制不变）
  const bb = panel === 'quick' ? quickCanvasBounds() : threeWindowBoundsForAnchor(cluster.anchor, cluster.scale, cluster.quickVisible, cluster.doneVisible).done
  if (!bb) return
  pendingBounds.delete(w.id)
  w.setBounds(bb)
  if (isPersistent(panel)) {
    // 透明常驻：表面现成，关穿透+拧亮即显示（物理不可见时补一次首显）
    if (!sideWindowVisible(w)) {
      if (!w.isVisible()) w.showInactive()
      w.setOpacity(1)
    }
    // 快捷窗画布（步骤 3）：显示基态=forward 全穿透——卡面内/外的命中切换由渲染层
    // hit-test 接管（首个 mousemove 到达即恢复，静止光标+立即点击的窗口期见方案 §4-5）；
    // 已完成窗维持直接可点（整窗即卡面）
    if (panel === 'quick') applyQuickMouseIgnoreBase(w)
    else w.setIgnoreMouseEvents(false)
    // 应用级聚焦（用户 2026-10-07 裁定）：侧窗与主窗同层出现——透明常驻下
    // isVisible 恒真，原 !isVisible 守卫不再触发，moveTop 无条件执行保住同层语义。
    // 模态锁定期间（二级窗开着）例外：moveTop 会越过二级窗将其盖住（用户 2026-10-09 报告）
    if (!modalChildOpen) w.moveTop()
  } else if (!w.isVisible()) {
    w.showInactive()
    // 应用级聚焦（用户 2026-10-07 裁定）：侧窗与主窗同层出现——showInactive
    // 的插入层在真机上可能落在其它应用窗口之下，moveTop 显式提到应用组顶部
    // （不夺焦点：前台主窗保持前台，侧窗紧随其下）
    if (!modalChildOpen) w.moveTop()
  }
}

/** 三窗同帧定位：一个锚点 → 同一 tick 内逐窗 setBounds（每帧重申逻辑尺寸，压制跨 DPI 复利放大）。
 * placeAll=true（ready-to-show）：无视可见性强制全部落位——三窗 show:false 创建后页面加载有先后，
 * 迟到的 ready-to-show 若只 show 不落位，窗口会出现在旧位置（用户实测） */
export function applyClusterBounds(placeAll = false): void {
  if (!cluster) return
  if (lastAppliedAnchor && lastAppliedAnchor.x === cluster.anchor.x && lastAppliedAnchor.y === cluster.anchor.y) return
  if (cluster.tucked) {
    // 缩进态（2026-10-17 §11.K 步1：白条=独立窗，主窗改为透明待机不再收胶囊、几何不动）。
    // 白条水平=主窗上缘中心（现状口径，用户裁定）；摆放含系统最小窗高钳制的余高挂屏上校正
    applyBarBounds()
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
  // 隐藏窗跳过 setBounds：Windows 上对隐藏窗口 setBounds 会将其显示（用户实测点击隐藏又弹回）；
  // 几何登记到 pendingBounds，showSidePanel 显示时先落位。
  // 落位顺序 done→main→quick：用户最敏感的快捷窗最后落位（缝隙错帧最后闭合）
  // 快捷窗=画布矩形（恒定，右缘钉主窗左缘−4）：缩放档位变化时本矩形完全不动
  for (const [w, bb] of [
    [done, b.done ?? b.main],
    [main, b.main],
    [quick, quickCanvasBounds()]
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
  if (modalChildOpen) return // 模态锁定期间三窗不抬升：moveTop 会越过二级窗将其盖住
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
  // 可见性切换改变宽度上限 → 画布 maxScale 重算（key 比对；缩放提交时 key 不变=廉价空转）
  refreshQuickCanvasScale(wa, ui.quickVisible, ui.doneVisible)
  cluster.quickVisible = ui.quickVisible
  cluster.doneVisible = ui.doneVisible
  const { quick, done } = cluster.windows
  if (safe(quick)) {
    if (ui.quickVisible && cluster.visible && !cluster.tucked) showSidePanel('quick')
    else hideSideWindow(quick, 'quick')
  }
  if (safe(done)) {
    if (ui.doneVisible && cluster.visible && !cluster.tucked) showSidePanel('done')
    else hideSideWindow(done, 'done')
  }
  lastAppliedAnchor = null
  applyClusterBounds()
}

/** 缩进切换（渲染层状态机经 IPC setTucked）。
 * 步1（2026-10-17）：缩进=侧窗透明待机 + 主窗透明待机 + 白条独立窗亮起（主窗不再收胶囊）；
 * 弹出=白条收 + 主窗回亮 + 侧窗先落位显示（三窗呈现同步，用户验收#4 语义保留） */
export function setClusterTucked(v: boolean): void {
  if (!cluster) return
  cluster.tucked = v
  // 弹出/缩进切换后重置 inside 记忆：下一次 tick 必发一次真实状态——渲染层依赖该信号
  // 计算 leaveAt（C7 白条 mouseenter 弹出后，若无此重置且光标一直在组件外，渲染层收不到
  // mouse-leave 将无法自动缩回）
  lastInside = null
  if (v) autoExpandUntil = 0 // 重新缩进同样清除挂起会话（防跨状态闪退）
  const { quick, done, main } = cluster.windows
  if (v) {
    // 缩进：先藏侧窗，主窗透明待机，白条亮起
    if (safe(quick)) hideSideWindow(quick, 'quick')
    if (safe(done)) hideSideWindow(done, 'done')
    veilMainWindow(true)
    lastAppliedAnchor = null
    applyClusterBounds()
    showBarWindow()
    return
  }
  // 弹出：白条先收，主窗回亮，侧窗最后落位显示（带完整内容）
  hideBarWindow()
  veilMainWindow(false)
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
  // 非有限锚点整体忽略：NaN 定位经 Electron 退化为 0 尺寸 SetWindowPos，
  // Windows 把窗口钳塌到最小尺寸 (0,0,4×38) 且后续 setBounds 一并失效（E2E 实测）
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return
  const mainBounds = safe(cluster.windows.main) ? cluster.windows.main.getBounds() : null
  const wa: WorkArea = mainBounds
    ? screen.getDisplayMatching(mainBounds).workArea
    : screen.getPrimaryDisplay().workArea
  // 跨屏拖动=工作区变化 → 画布 maxScale 重算（key 比对，同屏拖动为廉价空转）
  refreshQuickCanvasScale(wa, cluster.quickVisible, cluster.doneVisible)
  // #31/#32：拖动钳制——左右不阻挡、主窗≥90px；按主窗所在屏工作区
  cluster.anchor = clampAnchorForEdges(anchor, Math.round(470 * cluster.scale), wa)
  lastAppliedAnchor = null
  applyClusterBounds()
}

/** E2E 钩子：跳过真实光标，经同一 applyClusterBounds 路径平移锚点；
 * 内联 detectSnap 对齐真实拖动轮询（每 4 tick 判定吸附）——否则位移测试无法进入吸附态 */
export function clusterDragDeltaBy(dx: number, dy: number): void {
  if (!cluster) return
  applyAnchor({ x: cluster.anchor.x + dx, y: cluster.anchor.y + dy })
  detectSnap()
}

/** 托盘隐藏=组件整体隐藏（决策#9）；拖动中隐藏则终止轮询。
 * 三窗统一真隐藏（用户 2026-10-09 定调：托盘显隐全用真隐藏/重新唤醒，不做透明待机特判）；
 * Win+D 抢设标志复位：隐藏期间守卫不动作（重申真实语义） */
export function hideCluster(): void {
  if (!cluster) return
  stopClusterDrag()
  cluster.visible = false
  autoExpandUntil = 0 // 清除挂起的自动弹出会话：否则下次显示时过期会话立即缩回（闪退根因，2026-10-07 日志实锤）
  for (const w of getAllClusterWindows()) {
    if (safe(w)) w.hide()
  }
}

/** 显示=整体恢复（含置顶重应用——hide/show 可能重置 z-order）。
 * 胶囊态只显主窗短条；展开态 placeAll 强制全窗落位（修跨 DPI 尺寸残留——用户实测最小化再显示自愈） */
export function showCluster(): void {
  if (!cluster) return
  cluster.visible = true
  lastAppliedAnchor = null
  const { quick, main, done } = cluster.windows
  if (cluster.tucked) {
    // 缩进态托盘恢复（用户 2026-10-05 新需求）：自动弹出 3 秒——主进程直接弹出
    // （几何即时生效），再注入 cursorInside(true) 同步渲染层状态机；会话期内
    // 光标轮询强制 inside=true，到期按真实光标位置收尾：在组件上=保持展开
    // （之后光标离开经状态机自动缩回）；不在=状态机自动缩回白条
    // P2（2026-10-17）：锁定时不武装会话——锁定=贴边保持弹出，无"停留后缩回"语义
    if (!modalChildOpen && !tuckLocked) autoExpandUntil = Date.now() + AUTO_EXPAND_MS
    setClusterTucked(false)
    const pendMain = pendingBounds.get(cluster.windows.main.id)
    if (pendMain) {
      pendingBounds.delete(cluster.windows.main.id)
      cluster.windows.main.setBounds(pendMain)
    }
    sendToMain(IPC.cursorInside, true)
    return
  } else {
    applyClusterBounds(true)
    // 未置顶=挂件态：showInactive 显示不激活（show 会激活浮到最前）
    if (safe(main)) (cluster.topMost ? main.show() : main.showInactive())
    // 用户 2026-10-07 裁定：顶部吸附位的展开态显示，**每次都**重新获得 3 秒弹出保持
    // （强制 inside=true 压住"光标离开→吸附缩进"的立即缩回——修复二次显示闪退），
    // 到期按真实光标位置收尾：光标不在组件上 → 缩回白条。
    // P2（2026-10-17 用户报告修复）：缩进锁定开启时不武装会话——锁定=贴边保持弹出，
    // "停留 3 秒后缩回"不适用（此前锁定时仍武装，到期由 900ms 兜底强制缩进=逻辑错误）
    if (cluster.snapped && !modalChildOpen && !tuckLocked) {
      autoExpandUntil = Date.now() + AUTO_EXPAND_MS
      sendToMain(IPC.cursorInside, true)
    }
    if (safe(quick)) {
      if (cluster.quickVisible) showSidePanel('quick')
      else hideSideWindow(quick, 'quick')
    }
    if (safe(done)) {
      if (cluster.doneVisible) showSidePanel('done')
      else hideSideWindow(done, 'done')
    }
    // 步1：白条窗随整体显隐唤醒（基态=透明待机；隐真 hide 过则先 showInactive 再隐，
    // 防下次缩进亮起时表面重建闪动）
    const bar = cluster.windows.bar
    if (safe(bar)) {
      if (!bar.isVisible()) bar.showInactive()
      hideBarWindow()
    }
  }
  applyTopMostToCluster(cluster.topMost)
}

/**
 * 置顶语义（用户定稿 2026-10-06，覆盖第三轮"挂件态"设计）：
 * - 开置顶：三窗最上层+可激活
 * - 未置顶：普通窗口层级——不沉底、不锁激活（NOACTIVATE 已删除），
 *   点击组件浮上来获焦点，被应用覆盖时保持被覆盖（普通窗口行为）
 */
export function applyTopMostToCluster(enabled: boolean): void {
  if (!cluster) return
  cluster.topMost = enabled
  for (const w of getAllClusterWindows()) if (safe(w)) applyClusterTopMost(w, enabled)
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

/** 缩进判定光标轮询：光标是否在可见组件范围内（缩进态=胶囊窗本体）；
 * 状态变化推送待办窗（权威驱动，DOM 事件不参与——三轮8.2-1）。
 * 自动弹出会话内（缩进态托盘恢复）强制 inside=true，到期恢复真实判定 */
let lastInside: boolean | null = true
export function startTuckCursorPoll(): void {
  setInterval(() => {
    if (!cluster || !cluster.visible) return
    const pt = cursorPoint()
    let inside = false
    if (cluster.tucked) {
      // 缩进态弹出改由渲染层白条 mouseenter 驱动（C7 用户方案 2026-10-10）：mouseenter=
      // 系统真实命中分发——鼠标物理碰到白条才触发；被遮挡时主窗收不到鼠标事件=天然不弹；
      // 判定范围=白条元素边界（热区 6px×160px 精确，2026-10-16 随白条减半）。tick 缩进态不做任何自算判定
      // （历史几何/原生查询自算在遮挡与贴屏顶场景均不可靠，C6 系列实验结论）
      inside = false
    } else {
      for (const w of [cluster.windows.quick, cluster.windows.main, cluster.windows.done]) {
        if (safe(w) && sideWindowVisible(w) && contains(w.getBounds(), pt)) {
          inside = true
          break
        }
      }
    }
    // 自动弹出会话到期：光标不在组件上 → 只广播光标事实，缩进决策回归渲染层状态机
    // （其 childOpen 门与主进程同步生效，两层永不分裂）。直调 setClusterTucked(true) 会
    // 绕过二级窗禁缩进门：主进程缩成胶囊而渲染层拒绝白条 → 窗口露出完整 UI 左上角
    // ="标题条"（用户真机 2026-10-08 截图实锤，间歇性=3 秒边界与开二级窗的毫秒级竞争）
    if (autoExpandUntil > 0 && Date.now() >= autoExpandUntil) {
      autoExpandUntil = 0
      const pt = cursorPoint()
      const over = [cluster.windows.quick, cluster.windows.main, cluster.windows.done].some(
        (w) => safe(w) && sideWindowVisible(w) && contains(w.getBounds(), pt)
      )
      if (!over) {
        sendToMain(IPC.cursorInside, false)
        lastInside = false
        // 负载兜底（P3，2026-10-17 用户裁定）：渲染层 400ms 缩进链在高负载下可能延迟——
        // 900/1800ms 仍未收尾时**只再喊两声**（重发同一"光标离开"信号），缩进的执行权始终
        // 只在渲染层状态机（单一权威：锁定/批量/拖动/缩放/未吸附等门由它统一判定）。
        // 主进程不再"动手收"：直调 setClusterTucked(true) 会绕过渲染层不可见门 →
        // 主进程已缩进而渲染层认为展开（状态分裂：白条悬停不弹），2026-10-17 用户报告实锤。
        // 守卫：仅在"渲染层当前认知仍为光标在外"时再喊（弹出/回窗后 poll 已改记 true，自动停喊）
        const nudge = (): void => {
          if (!cluster || cluster.tucked || lastInside !== false) return
          sendToMain(IPC.cursorInside, false)
        }
        setTimeout(nudge, 900)
        setTimeout(nudge, 1800)
        return
      }
    }
    if (Date.now() < autoExpandUntil) inside = true
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
    doneVis: sideWindowVisible(cluster.windows.done),
    doneOpacity: safe(cluster.windows.done) ? cluster.windows.done.getOpacity() : 0,
    quickBounds: cluster.windows.quick.getBounds(),
    mainBounds: cluster.windows.main.getBounds(),
    quickMouseIgnore: quickMouseIgnoreState(),
    // 步1：主窗透明待机与白条窗（E2E 缩进信号/几何断言）
    mainOpacity: safe(cluster.windows.main) ? cluster.windows.main.getOpacity() : 1,
    barVis: sideWindowVisible(cluster.windows.bar),
    barOpacity: safe(cluster.windows.bar) ? cluster.windows.bar.getOpacity() : 0,
    barBounds: safe(cluster.windows.bar) ? cluster.windows.bar.getBounds() : null
  }
}

/** 步1：白条命中 → 转交主窗渲染层状态机（等效原主窗内白条元素 mouseenter） */
export function relayBarHit(sender: unknown): void {
  if (!cluster || !safe(cluster.windows.bar)) return
  if (sender !== cluster.windows.bar.webContents) return // 仅白条窗可上报（越权忽略）
  sendToMain(IPC.barHit)
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
    ipcMain.handle('test:sys-wm-close', (_e, panel: string) => sysWmCloseToPanel(panel))
    ipcMain.handle('test:pixel-at', (_e, p: { x: number; y: number }) => {
      // DIP → 物理像素（按坐标所在屏缩放比换算）
      const disp = screen.getDisplayMatching({ x: p.x, y: p.y, width: 1, height: 1 })
      const sf = disp.scaleFactor || 1
      return screenPixelAt(Math.round(p.x * sf), Math.round(p.y * sf))
    })
    ipcMain.handle('test:set-fake-cursor', (_e, p: { x: number; y: number } | null) => {
      fakeCursorPoint = p
      return true
    })
    ipcMain.handle('test:dwm-transitions', () => {
      const read = (w: BrowserWindow | null | undefined): unknown =>
        w && safe(w)
          ? {
              dis: getDwmTransitionsDisabled(w.getNativeWindowHandle()),
              handle: w.getNativeWindowHandle().readBigUInt64LE(0).toString()
            }
          : null
      return cluster
        ? {
            quick: read(cluster.windows.quick),
            main: read(cluster.windows.main),
            done: read(cluster.windows.done),
            bar: read(cluster.windows.bar)
          }
        : { quick: null, main: null, done: null, bar: null }
    })
    ipcMain.handle('test:exstyle', (_e, panel: string) => {
      const w = panel === 'quick' ? cluster?.windows.quick : panel === 'done' ? cluster?.windows.done : cluster?.windows.main
      if (!w || !safe(w)) return { noactivate: false, tool: false, topmost: false }
      return getWindowExstyleFlags(w.getNativeWindowHandle())
    })
    ipcMain.handle('test:drag-state', () => ({ dragging: dragTimer !== null }))
    // 置顶判定 E2E：可见窗口 z 序链（顶到底）——沉底/置顶断言用

  }
}

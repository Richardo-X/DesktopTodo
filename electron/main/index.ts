import { app, BrowserWindow, Tray, Menu, ipcMain, screen, dialog, nativeImage } from 'electron'
import { join } from 'node:path'
import { writeFile, readFile } from 'node:fs/promises'
import { FileRepository } from '../../src/core/repositories/file'
import { SystemClock } from '../../src/core/interfaces/clock'
import { OffsetClock } from './clock'
import type { IClock } from '../../src/core/interfaces/clock'
import { AppContext } from './context'
import { effectiveClusterScale, initialPos } from './layout'
import { acquireSingleInstanceLock } from './single-instance'
import { buildTrayContextMenu, exitConfirmMessage } from './tray-menu'
import { trayIconPng } from './icon'
import { applyTopMost, refocusChildWindows } from './window-state'
import { setAutoStart, syncAutoStartOnBoot } from './auto-start'
import { clampPosToWorkArea } from '../../src/core/utils/screen-clamp'
import { shouldWakeModalFocus } from '../../src/core/utils/modal-wake'
import { isLeftButtonPressed } from './win32'
import { setModalChildOpen } from './cluster-windows'
import { disableDwmTransitions } from './win32'
import { showBubble, hideBubble, resizeBubble } from './bubble'
import { localDateKey } from '../../src/core/utils/date'
import { IPC, type ChildKind } from '../../src/ipc/contract'
import { GROUP_OF, childWindowOptions } from './child-windows'
import {
  createClusterWindows,
  clusterTucked,
  clusterTopMost,
  isClusterDragging,
  getMainWindow,
  getAllClusterWindows,
  getClusterAnchor,
  isQuickClusterWindow,
  setQuickMouseIgnore,
  raiseClusterAll,
  syncClusterBounds,
  setClusterTucked,
  hideCluster,
  showCluster,
  applyTopMostToCluster,
  repositionClusterToDisplays,
  registerClusterIpc,
  relayBarHit,
  setTuckLocked,
  startTuckCursorPoll
} from './cluster-windows'
import { anchorForWindowX, visibleClusterBounds, clampAnchorForEdges } from '../../src/core/utils/cluster-layout'

/** 启动/恢复钳制（#31/#32/#33）：左右边缘不阻挡、主窗≥90px 可见、幂等（原样恢复） */
function clampAnchorToWorkArea(
  anchor: { x: number; y: number },
  scale: number,
  _quickVisible: boolean,
  _doneVisible: boolean,
  wa: { x: number; y: number; width: number; height: number }
): { x: number; y: number } {
  return clampAnchorForEdges(anchor, Math.round(470 * scale), wa)
}

/** 首次启动锚点：沿用 initialPos 口径（窗口右缘距屏右 24、距顶 48） */
function initialAnchor(
  wa: { x: number; y: number; width: number; height: number },
  scale: number,
  quickVisible: boolean,
  doneVisible: boolean
): { x: number; y: number } {
  const wb = initialPos(wa, visibleClusterBounds(scale, quickVisible, doneVisible))
  return { x: anchorForWindowX(wb.x, scale, quickVisible), y: wb.y }
}

let tray: Tray | null = null
let visible = true
let hasUnsavedEdits = false
let lastSettleCheck = localDateKey(new Date())
let ctx: AppContext

// E2E 夹具：临时 userData 目录（T44）；必须在单实例锁之前设置（锁文件位于 userData）
if (process.env.DTODO_USER_DATA) {
  app.setPath('userData', process.env.DTODO_USER_DATA)
}

const gotLock = acquireSingleInstanceLock(() => {
  showWindow()
})

if (!gotLock) {
  app.quit()
} else {
  app.whenReady().then(bootstrap)
}

let appClock: IClock = new SystemClock()

function makeClock(): IClock {
  const offsetH = Number(process.env.DTODO_CLOCK_OFFSET_H ?? 0)
  appClock = Number.isFinite(offsetH) && offsetH !== 0 ? new OffsetClock(offsetH) : new SystemClock()
  return appClock
}

async function bootstrap(): Promise<void> {
  const repo = new FileRepository(join(app.getPath('userData'), 'data.json'))
  ctx = new AppContext(repo, makeClock())
  const data = await ctx.boot()

  // 三轮：自启加固——开关为开时重写登录项（路径始终指向当前 exe）
  syncAutoStartOnBoot(data.settings.autoStart)

  // 三窗分离（批次 B-1）：快捷添加/待办/已完成 = 三个常驻 BrowserWindow
  const wa = screen.getPrimaryDisplay().workArea
  const q = data.uiState.quickVisible
  const d = data.uiState.doneVisible
  const scale = effectiveClusterScale(data.uiState.clusterScale, wa, q, d)
  const anchor =
    data.uiState.pos !== null ? clampAnchorToWorkArea(data.uiState.pos, scale, q, d, wa) : initialAnchor(wa, scale, q, d)
  createClusterWindows({ anchor, scale, quickVisible: q, doneVisible: d, topMost: data.uiState.topMost })
  // P2：缩进锁定镜像入主进程（锁定时 3 秒会话不武装；启动即同步存档值）
  setTuckLocked(data.uiState.tuckLock)
  visible = true

  createTray()
  registerIpc()
  registerClusterIpc(ipcMain)
  startSettleTimer()
  watchDisplayChanges()
  startTuckCursorPoll()
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromBuffer(trayIconPng()))
  tray.setToolTip('桌面待办')
  const menu = Menu.buildFromTemplate(
    buildTrayContextMenu({ visible }).map((item) => ({
      label: item.label,
      click: (): void => {
        if (item.id === 'toggle-visibility') toggleVisibility()
        else void confirmExit()
      }
    }))
  )
  tray.setContextMenu(menu)
  tray.on('double-click', () => toggleVisibility())
}

function toggleVisibility(): void {
  if (visible) hideToTray()
  else showWindow()
}

function showWindow(): void {
  visible = true
  showCluster()
  // 决策#9：显示=组件整体恢复（含全部二级窗口）
  for (const c of childWindows) {
    if (!c.isDestroyed()) c.show()
  }
  reaplyTopMostAll()
  // 显示时整体置顶（用户 2026-10-07 新需求）：从隐藏切换为显示时，
  // 应用整体弹到其他所有窗口上方（二级窗保持最上），显示后可直接操作
  raiseClusterAll()
  for (const c of childWindows) {
    if (!c.isDestroyed()) c.moveTop()
  }
  refreshTrayMenu()
}

/** 置顶=整个组件（三窗+全部二级窗口） */
function reaplyTopMostAll(): void {
  if (!ctx) return
  const enabled = ctx.current().uiState.topMost
  applyTopMostToCluster(enabled)
  for (const c of childWindows) {
    if (!c.isDestroyed()) applyTopMost(c, enabled)
  }
}

function hideToTray(): void {
  visible = false
  hideCluster()
  // 决策#9：托盘隐藏=组件整体隐藏（含全部二级窗口）
  for (const c of childWindows) {
    if (!c.isDestroyed()) c.hide()
  }
  refreshTrayMenu()
}

/** 二级窗关闭：蒙层解除广播（三窗；打开由入口前置 setVeil(true)） */
function broadcastVeilOff(): void {
  for (const w of getAllClusterWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.veil, false)
  }
}

function refreshTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(
    Menu.buildFromTemplate(
      buildTrayContextMenu({ visible }).map((item) => ({
        label: item.label,
        click: (): void => {
          if (item.id === 'toggle-visibility') toggleVisibility()
          else void confirmExit()
        }
      }))
    )
  )
}

/** 唯一退出途径：托盘菜单 → 确认框 → 退出（PRD §2.2/速查 #3） */
async function confirmExit(): Promise<void> {
  const w = getMainWindow()
  if (!w) return quitNow()
  const r = await dialog.showMessageBox(w, {
    type: 'question',
    buttons: ['退出', '取消'],
    defaultId: 0,
    cancelId: 1,
    message: exitConfirmMessage(hasUnsavedEdits)
  })
  if (r.response === 0) quitNow()
}

function quitNow(): void {
  app.quit()
}

let childScaleTransientUntil = 0

const childWindows = new Set<BrowserWindow>()

/** 二级窗"意图关闭"标记：×/← 按钮（closeSelf IPC）关闭前置位——
 * close 事件据此区分"用户主动关二级窗"与"Alt+F4/系统关闭（=退出整个应用）" */
const intentionalChildCloses = new WeakSet<BrowserWindow>()

/** 模态唤醒轮询（用户 2026-10-07 新需求）：二级窗开着（三窗禁用锁定）时，
 * Windows 不向禁用窗投递点击——50ms 轮询「左键按下边缘 + 光标在任一可见组件窗内」
 * → 聚焦二级窗（应用整体浮到最上，可直接操作二级窗）；三窗保持锁定不变 */
let modalWakePoll: ReturnType<typeof setInterval> | null = null
let wakePrevPressed = false
const MODAL_WAKE_INTERVAL_MS = 50

function refreshModalWakePoll(): void {
  const should = childWindows.size > 0
  if (should && modalWakePoll === null) {
    wakePrevPressed = false
    modalWakePoll = setInterval(() => {
      const pressed = isLeftButtonPressed()
      const rising = pressed && !wakePrevPressed
      wakePrevPressed = pressed
      if (!rising) return
      const pt = screen.getCursorScreenPoint()
      const cursorInside = getAllClusterWindows().some((w) => {
        // 透明常驻窗（done）物理恒可见——判定走"物理可见且透明度>0"，透明待机不误触发唤醒
        if (w.isDestroyed() || !(w.isVisible() && w.getOpacity() > 0)) return false
        const b = w.getBounds()
        return pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height
      })
      if (!shouldWakeModalFocus({ pressed, prevPressed: !pressed, cursorInside, childOpen: true })) return
      for (const c of childWindows) {
        if (!c.isDestroyed() && c.isVisible()) {
          c.focus()
          break
        }
      }
    }, MODAL_WAKE_INTERVAL_MS)
  } else if (!should && modalWakePoll !== null) {
    clearInterval(modalWakePoll)
    modalWakePoll = null
  }
}

/** 强制退出请求（Alt+F4）：防重入后交给 app.quit()——before-quit 落盘流程照走 */
let appQuitRequested = false
function requestAppQuit(): void {
  if (appQuitRequested) return
  appQuitRequested = true
  app.quit()
}

/** 子窗口数量广播三窗（缩进状态机 childOpen 门跨窗同步） */
function broadcastChildCount(): void {
  for (const w of getAllClusterWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IPC.childCount, childWindows.size)
  }
}

/** 模态锁定：任一子窗口打开期间禁用其余窗口（三窗自动被覆盖，PRD §2.1/验收 38） */
function lockNonChildWindows(lock: boolean): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!childWindows.has(w)) w.setEnabled(!lock)
  }
}

/** 打开子窗口：屏内居中级联、位置不记忆、高度≤半屏（速查 #7）；尺寸按组缩放（决策#5/#24） */
function openChildWindow(kind: ChildKind, id?: string): void {
  const wa = screen.getPrimaryDisplay().workArea
  const groupScale = ctx.current().uiState.childScales[GROUP_OF[kind]] ?? 1
  const topMost = ctx.current().uiState.topMost
  const placement = childWindowOptions(kind, wa, childWindows.size, groupScale)
  const child = new BrowserWindow({
    width: placement.width,
    height: placement.height,
    x: placement.x,
    y: placement.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    thickFrame: false,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    alwaysOnTop: topMost,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  childWindows.add(child)
  disableDwmTransitions(child.getNativeWindowHandle()) // 关系统过渡动画（全局一致）
  lockNonChildWindows(true)
  setModalChildOpen(true) // 二级窗开着：缩进禁止+保持弹出+取消 3 秒弹出会话（用户 2026-10-08 裁定）
  refreshModalWakePoll()

  // 用户验收#5：打开二级窗=组件聚焦该窗并禁用缩进——若已缩进立即弹出；
  // 子窗数量广播三窗状态机（childOpen 门），侧窗发起的二级窗同样生效（跨窗）
  if (clusterTucked()) setClusterTucked(false)
  broadcastChildCount()
  child.on('ready-to-show', () => {
    child.show()
    child.focus()
    applyTopMost(child, topMost)
  })
  child.on('moved', () => {
    const b = child.getBounds()
    const clamped = clampPosToWorkArea({ x: b.x, y: b.y }, { width: b.width, height: b.height }, wa)
    if (clamped.x !== b.x || clamped.y !== b.y) child.setPosition(clamped.x, clamped.y)
  })
  child.on('close', () => {
    // Alt+F4/系统关闭（无意图标记）= 强制退出整个应用（用户 2026-10-05 裁定）；
    // ×/← 按钮（closeSelf）带意图标记 = 仅关自己
    if (!intentionalChildCloses.has(child)) requestAppQuit()
    // 提前解锁：close 与 closed 之间窗口仍 disabled 会吞掉主窗口的输入
    lockNonChildWindows(false)
  })
  // 置顶态 Win+M 免疫兜底：系统最小化二级窗 → 立即恢复（未置顶不设限=普通窗口行为）
  child.on('minimize', () => {
    if (!child.isDestroyed() && clusterTopMost()) child.restore()
  })
  child.on('closed', () => {
    broadcastVeilOff()
    childWindows.delete(child)
    if (childWindows.size === 0) lockNonChildWindows(false)
    setModalChildOpen(false)
    refreshModalWakePoll()
    broadcastChildCount()
    getMainWindow()?.webContents.send(IPC.childClosed)
  })

  const query: Record<string, string> = { win: kind }
  if (id !== undefined) query.id = id
  if (process.env.ELECTRON_RENDERER_URL) {
    const u = new URL(process.env.ELECTRON_RENDERER_URL)
    u.search = new URLSearchParams(query).toString()
    void child.loadURL(u.toString())
  } else {
    void child.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.openChild, (_e, p: { kind: ChildKind; id?: string }) => openChildWindow(p.kind, p.id))
  ipcMain.handle(IPC.closeSelf, (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    intentionalChildCloses.add(w) // ×/← 按钮=意图关闭：仅关自己
    w.close()
  })

  // 决策#7/#24：子窗口缩放=真窗口尺寸变化；Windows 限制：resizable=false 时 setSize 缩小不生效 → 临时解除
  // 手感迭代（2026-10-15）：resizeSelf 即子窗缩放热路径标志——随后 150ms 内的提交走免落盘通道
  //（对齐主窗缩放 isClusterDragging 语义；每次落盘的 I/O 尖峰=拖拽"卡一下"）
  ipcMain.handle(IPC.resizeSelf, (e, p: { width: number; height: number }) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w || w.isDestroyed()) return
    childScaleTransientUntil = Date.now() + 150
    const wa = screen.getPrimaryDisplay().workArea
    const width = Math.min(Math.round(p.width), wa.width - 24)
    const height = Math.max(120, Math.min(Math.round(p.height), wa.height - 24))
    const wasResizable = w.isResizable()
    if (!wasResizable) w.setResizable(true)
    w.setSize(width, height)
    if (!wasResizable) w.setResizable(false)
  })

  ipcMain.handle(IPC.setTucked, (_e, v: boolean) => {
    // 用户验收#5：有二级窗口打开时禁用缩进（主进程权威拦截）
    if (v && childWindows.size > 0) return
    setClusterTucked(v)
  })

  // 步1：白条独立窗命中 → 转交主窗渲染层状态机（等效原白条元素 mouseenter；仅白条窗可上报）
  ipcMain.on(IPC.barHit, (e) => relayBarHit(e.sender))

  // 快捷窗画布命中切换（画布方案步骤 3）：仅快捷簇窗可改自身穿透；
  // forward=true 时穿透中仍接收 mousemove（渲染层 hit-test 的活水）。
  // 显隐语义协调：hideSideWindow（透明待机）用无 forward 的全穿透，
  // showSidePanel 重置为 forward 全穿透基态——两侧不打架
  ipcMain.handle(IPC.setSelfMouseIgnore, (e, p: { ignore: boolean; forward: boolean }) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w || w.isDestroyed()) return
    if (!isQuickClusterWindow(w)) return
    setQuickMouseIgnore(p.ignore)
  })

  // 批次 B-5：批量模式跨窗同步——发起窗上报 → 广播全部组件窗口（瞬态状态，不持久化）
  ipcMain.handle(IPC.uiBatchState, (_e, target: 'todos' | 'templates' | 'history' | null) => {
    for (const w of getAllClusterWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.uiBatchState, target)
    }
  })
  ipcMain.handle(IPC.getState, () => ctx.current())

  ipcMain.handle(IPC.commit, async (_e, data: Awaited<ReturnType<AppContext['boot']>>) => {
    const anchor = getClusterAnchor()
    // 缩放拖动热路径免落盘（I/O 尖峰=三窗 setBounds 不规则到达=缝隙抖动）；拖动结束由 onGripUp 正式提交
    if (isClusterDragging() || Date.now() < childScaleTransientUntil) await ctx.commitTransient(data, anchor)
    else await ctx.commit(data, anchor)
    // P2：缩进锁定镜像同步（锁定时不武装 3 秒会话；turn-on 时同时清除挂起会话）
    setTuckLocked(data.uiState.tuckLock)
    // 广播先行（批次 B 验收#2）：侧窗卡片缩放重绘与 OS 窗口尺寸变化同帧到位——
    // 若先 setBounds 后广播，侧窗卡片会滞后窗口边缘 1~2 帧（缩放时表现为缝隙挤压抖动）
    const latest = ctx.current()
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.stateUpdated, latest)
    }
    syncClusterBounds(data.uiState)
  })

  ipcMain.handle(IPC.flush, () => ctx.flush())

  // E2E（仅测试模式）：驱动缩放档位——完整复刻 IPC.commit 的真实路径
  // （commitTransient 热路径语义 → 广播 stateUpdated 先行 → syncClusterBounds），
  // 直调 syncClusterBounds 会跳过 uiState 广播，渲染层收不到新档位（卡面停旧值）
  if (process.env.DTODO_TEST === '1') {
    ipcMain.handle('test:cluster-scale', async (_e, p: { scale: number }) => {
      const cur = ctx.current()
      await ctx.commitTransient({ ...cur, uiState: { ...cur.uiState, clusterScale: p.scale } }, getClusterAnchor())
      const latest = ctx.current()
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(IPC.stateUpdated, latest)
      }
      syncClusterBounds(latest.uiState)
      return true
    })
  }

  // 方案 A（内容冻结）：缩放手柄按下/松开 → 广播三窗渲染层冻结/解冻内容更新
  ipcMain.handle(IPC.resizeFreeze, (_e, frozen: boolean) => {
    for (const w of getAllClusterWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.resizeFreeze, frozen)
    }
  })

  // 批次 C-2：蒙层前置信号——打开入口先广播蒙层再创建二级窗（蒙层与窗口同步出现）
  ipcMain.handle(IPC.setVeil, (_e, v: boolean) => {
    for (const w of getAllClusterWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.veil, v)
    }
  })

  ipcMain.handle(IPC.setTopMost, (_e, enabled: boolean) => {
    // 置顶=整个组件（三窗+全部二级窗口）；渲染层已先 commit
    applyTopMostToCluster(enabled)
    for (const c of childWindows) {
      if (!c.isDestroyed()) applyTopMost(c, enabled)
    }
  })

  ipcMain.handle(IPC.setVisibility, (_e, v: boolean) => {
    if (v) showWindow()
    else hideToTray()
  })

  ipcMain.handle(IPC.bubbleShow, (e, p: { text: string; theme: 'day' | 'night'; row: { left: number; top: number; right: number; bottom: number } }) => {
    const wb = BrowserWindow.fromWebContents(e.sender)?.getBounds()
    if (!wb) return
    showBubble(wb, p)
  })

  ipcMain.handle(IPC.bubbleHide, () => {
    hideBubble()
  })

  ipcMain.handle(IPC.bubbleResize, (_e, p: { w: number; h: number }) => {
    resizeBubble(p)
  })

  ipcMain.handle(IPC.setAutoStart, (_e, enabled: boolean) => setAutoStart(enabled))

  ipcMain.handle(IPC.minimizeToTray, () => hideToTray())

  ipcMain.handle(IPC.saveCsv, async (e, p: { fileName: string; content: string }) => {
    try {
      // E2E：跳过系统对话框，直接写入指定目录（T47）
      if (process.env.DTODO_TEST_EXPORT_DIR) {
        const target = join(process.env.DTODO_TEST_EXPORT_DIR, p.fileName)
        await writeFile(target, p.content, 'utf8')
        return target
      }
      const w0 = getMainWindow()
      if (!w0) return null
      const r = await dialog.showSaveDialog(w0, {
        defaultPath: p.fileName,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (r.canceled || !r.filePath) return null
      await writeFile(r.filePath, p.content, 'utf8')
      return r.filePath
    } finally {
      // 8.2-4：对话框归还焦点后，抬升子窗口并聚焦发起窗口
      refocusChildWindows(childWindows, BrowserWindow.fromWebContents(e.sender) ?? undefined)
    }
  })

  ipcMain.handle(IPC.openCsv, async (e) => {
    try {
      // E2E：跳过系统对话框，读取指定文件（T47）
      if (process.env.DTODO_TEST_IMPORT_FILE) {
        return readFile(process.env.DTODO_TEST_IMPORT_FILE, 'utf8')
      }
      const w1 = getMainWindow()
      if (!w1) return null
      const r = await dialog.showOpenDialog(w1, {
        properties: ['openFile'],
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (r.canceled || r.filePaths.length === 0) return null
      return readFile(r.filePaths[0], 'utf8')
    } finally {
      refocusChildWindows(childWindows, BrowserWindow.fromWebContents(e.sender) ?? undefined)
    }
  })

  // 渲染层标记是否存在未保存的编辑输入（退出确认提示用，速查 #3）
  ipcMain.on('app:set-unsaved', (_e, flag: boolean) => {
    hasUnsavedEdits = flag
  })

  // TEMP 文本光标诊断日志（用户 2026-10-06 报告；发版前移除）

  // E2E 测试钩子：强制以偏移时钟结算（仅 DTODO_TEST=1 时注册）
  if (process.env.DTODO_TEST === '1') {
    ipcMain.handle('test:force-settle', async (_e, days: number) => {
      const r = await ctx.settleWith(new OffsetClock(Number(days) * 24))
      if (r.changed) {
        for (const w of getAllClusterWindows()) {
          if (!w.isDestroyed()) w.webContents.send(IPC.stateUpdated, r.data)
        }
      }
      return r.changed
    })
  }
}

/** 运行中跨 0 点：静默结算并推送新状态（三窗都需要刷新，PRD §7.4） */
function startSettleTimer(): void {
  setInterval(() => {
    const nowKey = localDateKey(appClock.now())
    if (nowKey === lastSettleCheck) return
    lastSettleCheck = nowKey
    void ctx
      .settleIfCrossed()
      .then((r) => {
        if (r.changed) {
          for (const w of getAllClusterWindows()) {
            if (!w.isDestroyed()) w.webContents.send(IPC.stateUpdated, r.data)
          }
        }
      })
      .catch(() => {})
  }, 30_000)
}

/** 分辨率变化/拔显示器 → 组件回到可见范围（#33：按主窗可见拉回） */
function watchDisplayChanges(): void {
  const reposition = (): void => {
    if (!ctx) return
    repositionClusterToDisplays(screen.getAllDisplays())
  }
  screen.on('display-removed', reposition)
  screen.on('display-metrics-changed', reposition)
}

let isQuitting = false

app.on('before-quit', async (e) => {
  if (isQuitting) return // 第二次进入：放行退出
  isQuitting = true
  // 阻止本次退出，等落盘完成后再真正退出（否则异步 flush 会被进程退出截断）
  e.preventDefault()
  try {
    if (ctx) {
      const anchor = getClusterAnchor()
      const d = ctx.current()
      await ctx.commit({ ...d, uiState: { ...d.uiState, pos: anchor } }, anchor)
    }
    if (ctx) await ctx.flush()
  } catch {
    // 落盘失败也要能退出
  }
  app.quit()
})

app.on('window-all-closed', () => {
  // 托盘常驻：窗口关闭不退出（唯一退出途径为托盘菜单）
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && ctx) {
    const wa = screen.getPrimaryDisplay().workArea
    const d = ctx.current()
    const scale = effectiveClusterScale(d.uiState.clusterScale, wa, d.uiState.quickVisible, d.uiState.doneVisible)
    createClusterWindows({
      anchor: d.uiState.pos ?? initialAnchor(wa, scale, d.uiState.quickVisible, d.uiState.doneVisible),
      scale,
      quickVisible: d.uiState.quickVisible,
      doneVisible: d.uiState.doneVisible,
      topMost: d.uiState.topMost
    })
  }
})

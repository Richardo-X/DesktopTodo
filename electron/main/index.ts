import { app, BrowserWindow, Tray, Menu, ipcMain, screen, dialog, nativeImage } from 'electron'
import { join } from 'node:path'
import { writeFile, readFile } from 'node:fs/promises'
import { FileRepository } from '../../src/core/repositories/file'
import { SystemClock } from '../../src/core/interfaces/clock'
import { OffsetClock } from './clock'
import type { IClock } from '../../src/core/interfaces/clock'
import { AppContext } from './context'
import { defaultWindowOptions, effectiveClusterScale, initialPos } from './layout'
import { acquireSingleInstanceLock } from './single-instance'
import { buildTrayContextMenu, exitConfirmMessage } from './tray-menu'
import { trayIconPng } from './icon'
import { applyTopMost, refocusChildWindows } from './window-state'
import { setAutoStart, syncAutoStartOnBoot } from './auto-start'
import { ensureOnSomeDisplay, clampPosToWorkArea } from '../../src/core/utils/screen-clamp'
import { localDateKey } from '../../src/core/utils/date'
import { IPC, type ChildKind } from '../../src/ipc/contract'
import { GROUP_OF, childWindowOptions } from './child-windows'
import {
  tuckBarBounds,
  windowBoundsForAnchor,
  anchorForWindowX,
  visibleClusterBounds
} from '../../src/core/utils/cluster-layout'
import { SNAP_THRESHOLD } from '../../src/core/constants'

/** 四轮定稿 B：锚点语义的屏幕钳制——锚点换算成窗口 bounds，钳制后换回锚点 */
function clampAnchorToWorkArea(
  anchor: { x: number; y: number },
  scale: number,
  quickVisible: boolean,
  doneVisible: boolean,
  wa: { x: number; y: number; width: number; height: number }
): { x: number; y: number } {
  const wb = windowBoundsForAnchor(anchor, scale, quickVisible, doneVisible)
  const c = clampPosToWorkArea({ x: wb.x, y: wb.y }, { width: wb.width, height: wb.height }, wa)
  return { x: anchorForWindowX(c.x, scale, quickVisible), y: c.y }
}

/** 首次启动锚点：沿用 initialPos 口径（窗口右缘距屏右 24、距顶 48），换算为待办左上角锚点 */
function initialAnchor(
  wa: { x: number; y: number; width: number; height: number },
  scale: number,
  quickVisible: boolean,
  doneVisible: boolean
): { x: number; y: number } {
  const wb = initialPos(wa, visibleClusterBounds(scale, quickVisible, doneVisible))
  return { x: anchorForWindowX(wb.x, scale, quickVisible), y: wb.y }
}

let win: BrowserWindow | null = null
let tray: Tray | null = null

/** 窗口已销毁时返回 null，避免 "Object has been destroyed"（所有异步回调必须经此访问） */
function safeWin(): BrowserWindow | null {
  return win !== null && !win.isDestroyed() ? win : null
}
let visible = true
let hasUnsavedEdits = false
let lastSettleCheck = localDateKey(new Date())
let tucked = false
let snapped = false
let currentPos: { x: number; y: number } | null = null
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
  currentPos = data.uiState.pos

  // 三轮：自启加固——开关为开时重写登录项（路径始终指向当前 exe）
  syncAutoStartOnBoot(data.settings.autoStart)

  createWindow(data)
  createTray()
  registerIpc()
  startSettleTimer()
  watchDisplayChanges()
}

function createWindow(data: ReturnType<AppContext['current']>): void {
  const wa = screen.getPrimaryDisplay().workArea
  const q = data.uiState.quickVisible
  const d = data.uiState.doneVisible
  // 决策#23：初始缩放按所在屏钳制（高度≤半屏、宽度≤屏宽），窗口与渲染层 zoom 1:1；
  // 四轮定稿 B：钳制基准=可见面板并集（隐藏面板不占位）
  const scale = effectiveClusterScale(data.uiState.clusterScale, wa, q, d)
  // 四轮定稿 B：pos=待办左上角锚点；窗口 bounds 由锚点推导（快捷可见时窗口左缘在锚点左侧）
  const anchor =
    data.uiState.pos !== null
      ? clampAnchorToWorkArea(data.uiState.pos, scale, q, d, wa)
      : initialAnchor(wa, scale, q, d)
  const bounds = windowBoundsForAnchor(anchor, scale, q, d)

  const win_ = new BrowserWindow({
    ...defaultWindowOptions(bounds),
    x: bounds.x,
    y: bounds.y,
    alwaysOnTop: data.uiState.topMost, // 8.2-2：构造期即带置顶（Windows 上 show 前的 setAlwaysOnTop 可能被覆盖，双保险）
    webPreferences: {
      ...defaultWindowOptions(bounds).webPreferences,
      preload: join(__dirname, '../preload/index.js')
    }
  })
  win = win_
  visible = true
  currentPos = anchor

  win_.on('ready-to-show', () => {
    win_!.show()
    // 8.2-2：show 之后再应用置顶（构造期 setAlwaysOnTop 在部分场景会被 show 重置）
    applyTopMost(win_!, data.uiState.topMost)
  })
  // 三轮8.2-1：窗口移动期间节流通知渲染层（moving 抑制自动缩进，修拖动中伪 leave 误缩回）
  let lastMoveSent = 0
  win_.on('move', () => {
    // 缩进态的 setBounds 自身会触发 move——回传会让渲染层用旧状态把窗口弹回（反馈环），必须跳过
    if (tucked) return
    const now = Date.now()
    if (now - lastMoveSent < 150) return
    lastMoveSent = now
    win_?.webContents.send(IPC.windowMoving, now)
  })
  win_.on('moved', () => {
    // 三轮8.2-1：缩进态 setBounds 会改 x——不得污染位置记忆，也不做吸附判定
    if (tucked) return
    const b = win_!.getBounds()
    // 四轮定稿 B：pos=待办左上角锚点（快捷可见时窗口左缘在锚点左侧）
    if (!ctx) {
      currentPos = { x: b.x, y: b.y }
    } else {
      const ui = ctx.current().uiState
      const scale = effectiveClusterScale(ui.clusterScale, screen.getPrimaryDisplay().workArea, ui.quickVisible, ui.doneVisible)
      currentPos = { x: anchorForWindowX(b.x, scale, ui.quickVisible), y: b.y }
    }
    detectSnap()
  })
  win_.on('closed', () => {
    if (win === win_) win = null
  })
  win_.on('close', (e) => {
    // 唯一退出途径是托盘菜单；点 × 等同缩小到通知栏（PRD §2.1）
    if (!isQuitting) {
      e.preventDefault()
      hideToTray()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win_.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win_.loadFile(join(__dirname, '../renderer/index.html'))
  }
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
  safeWin()?.show()
  // 决策#9：显示=组件整体恢复（含全部二级窗口）
  for (const c of childWindows) {
    if (!c.isDestroyed()) c.show()
  }
  // 8.2-2：恢复后重新应用置顶（Windows hide/show 可能重置 z-order）
  reaplyTopMostAll()
  refreshTrayMenu()
}

/** 置顶=整个组件（8.2-2）：主窗+全部二级窗口统一应用当前 uiState.topMost */
function reaplyTopMostAll(): void {
  if (!ctx) return
  const enabled = ctx.current().uiState.topMost
  const w = safeWin()
  if (w) applyTopMost(w, enabled)
  for (const c of childWindows) {
    if (!c.isDestroyed()) applyTopMost(c, enabled)
  }
}

function hideToTray(): void {
  visible = false
  safeWin()?.hide()
  // 决策#9：托盘隐藏=组件整体隐藏（含全部二级窗口）
  for (const c of childWindows) {
    if (!c.isDestroyed()) c.hide()
  }
  refreshTrayMenu()
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
  const w = safeWin()
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

const childWindows = new Set<BrowserWindow>()

/** 按 uiState（缩放/缩进）同步主窗口尺寸（T38/T39/T43）；
 * 缩放经决策#23 钳制；面板开关在恒定槽位内显隐，不改变窗口几何（二轮反馈：主窗居中零残影） */
function syncMainBounds(): void {
  const w = safeWin()
  if (!w || !ctx) return
  const d = ctx.current()
  const wa = screen.getPrimaryDisplay().workArea
  const q = d.uiState.quickVisible
  const done = d.uiState.doneVisible
  // 四轮定稿 B：钳制基准=可见面板并集；pos=待办左上角锚点
  const scale = effectiveClusterScale(d.uiState.clusterScale, wa, q, done)
  const wb = windowBoundsForAnchor(currentPos ?? { x: 0, y: 0 }, scale, q, done)
  if (tucked) {
    // 三轮8.2-1：缩进=胶囊窗口（宽 160、水平居中于可见簇、贴顶）——感应区=胶囊本身
    w.setBounds(tuckBarBounds({ x: wb.x, y: wb.y }, wb.width))
    return
  }
  w.setBounds(wb)
}

/** 吸附检测（三轮8.2-1：SNAP_THRESHOLD=0——顶边真正触碰屏幕上边缘才吸附）：
 * 判定成立时把窗口贴齐 y=工作区顶（不再悬空），并通知渲染层状态机 */
function detectSnap(): void {
  const w = safeWin()
  if (!w) return
  const wa = screen.getPrimaryDisplay().workArea
  const b = w.getBounds()
  const now = b.y - wa.y <= SNAP_THRESHOLD
  if (now && b.y !== wa.y) {
    // 吸附成立：贴齐屏顶
    w.setPosition(b.x, wa.y)
    currentPos = { x: b.x, y: wa.y }
    return
  }
  if (now !== snapped) {
    snapped = now
    w.webContents.send(IPC.snapChanged, snapped)
  }
}

function childWebPreferences(): { preload: string; contextIsolation: boolean; nodeIntegration: boolean; sandbox: boolean } {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false
  }
}

/** 模态锁定：任一子窗口打开期间禁用其余窗口（PRD §2.1/验收 38） */
function lockNonChildWindows(lock: boolean): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!childWindows.has(w)) w.setEnabled(!lock)
  }
}

/** 打开子窗口：屏内居中级联、位置不记忆、高度≤半屏（速查 #7）；尺寸按组缩放（决策#5/#24）；
 * 置顶=整个组件（8.2-2）：主窗置顶时子窗口必须同层级，否则被模态锁定压在身后假死 */
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
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    alwaysOnTop: topMost,
    webPreferences: childWebPreferences()
  })
  childWindows.add(child)
  lockNonChildWindows(true)

  child.on('ready-to-show', () => {
    child.show()
    applyTopMost(child, topMost)
  })
  child.on('moved', () => {
    const b = child.getBounds()
    const clamped = clampPosToWorkArea({ x: b.x, y: b.y }, { width: b.width, height: b.height }, wa)
    if (clamped.x !== b.x || clamped.y !== b.y) child.setPosition(clamped.x, clamped.y)
  })
  child.on('close', () => {
    // 提前解锁：close 与 closed 之间窗口仍 disabled 会吞掉主窗口的输入
    lockNonChildWindows(false)
  })
  child.on('closed', () => {
    childWindows.delete(child)
    if (childWindows.size === 0) lockNonChildWindows(false)
    safeWin()?.webContents.send(IPC.childClosed)
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
    BrowserWindow.fromWebContents(e.sender)?.close()
  })

  // 决策#7/#24→二轮反馈照原型：子窗口缩放=真窗口尺寸变化（内容流式 reflow 无 zoom）；
  // 尺寸钳制同原型（屏幕放不下按 -24）。Windows 限制：resizable=false 时 setSize 缩小不生效 → 临时解除
  ipcMain.handle(IPC.resizeSelf, (e, p: { width: number; height: number }) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w || w.isDestroyed()) return
    const wa = screen.getPrimaryDisplay().workArea
    const width = Math.min(Math.round(p.width), wa.width - 24)
    const height = Math.max(120, Math.min(Math.round(p.height), wa.height - 24))
    const wasResizable = w.isResizable()
    if (!wasResizable) w.setResizable(true)
    w.setSize(width, height)
    if (!wasResizable) w.setResizable(false)
  })

  ipcMain.handle(IPC.setTucked, (_e, v: boolean) => {
    tucked = v
    syncMainBounds()
  })
  ipcMain.handle(IPC.getState, () => ctx.current())

  ipcMain.handle(IPC.commit, async (_e, data: Awaited<ReturnType<AppContext['boot']>>) => {
    await ctx.commit(data, currentPos)
    syncMainBounds()
    // 广播到所有窗口：多窗口（子窗口编辑后主窗口）状态一致
    const latest = ctx.current()
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.stateUpdated, latest)
    }
  })

  ipcMain.handle(IPC.flush, () => ctx.flush())

  ipcMain.handle(IPC.setTopMost, (_e, enabled: boolean) => {
    // 8.2-2：置顶=整个组件（主窗+全部二级窗口）；渲染层已先 commit
    const w = safeWin()
    if (w) applyTopMost(w, enabled)
    for (const c of childWindows) {
      if (!c.isDestroyed()) applyTopMost(c, enabled)
    }
  })

  ipcMain.handle(IPC.setVisibility, (_e, v: boolean) => {
    if (v) showWindow()
    else hideToTray()
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
      const w0 = safeWin()
      if (!w0) return null
      const r = await dialog.showSaveDialog(w0, {
        defaultPath: p.fileName,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (r.canceled || !r.filePath) return null
      await writeFile(r.filePath, p.content, 'utf8')
      return r.filePath
    } finally {
      // 8.2-4：对话框归还焦点到主窗后，抬升子窗口并聚焦发起窗口
      refocusChildWindows(childWindows, BrowserWindow.fromWebContents(e.sender) ?? undefined)
    }
  })

  ipcMain.handle(IPC.openCsv, async (e) => {
    try {
      // E2E：跳过系统对话框，读取指定文件（T47）
      if (process.env.DTODO_TEST_IMPORT_FILE) {
        return readFile(process.env.DTODO_TEST_IMPORT_FILE, 'utf8')
      }
      const w1 = safeWin()
      if (!w1) return null
      const r = await dialog.showOpenDialog(w1, {
        properties: ['openFile'],
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (r.canceled || r.filePaths.length === 0) return null
      return readFile(r.filePaths[0], 'utf8')
    } finally {
      // 8.2-4：对话框归还焦点到主窗后，抬升子窗口并聚焦发起窗口
      refocusChildWindows(childWindows, BrowserWindow.fromWebContents(e.sender) ?? undefined)
    }
  })

  // 渲染层标记是否存在未保存的编辑输入（退出确认提示用，速查 #3）
  ipcMain.on('app:set-unsaved', (_e, flag: boolean) => {
    hasUnsavedEdits = flag
  })

  // E2E 测试钩子：强制以偏移时钟结算（仅 DTODO_TEST=1 时注册）
  if (process.env.DTODO_TEST === '1') {
    ipcMain.handle('test:force-settle', async (_e, days: number) => {
      const r = await ctx.settleWith(new OffsetClock(Number(days) * 24))
      if (r.changed) safeWin()?.webContents.send(IPC.stateUpdated, r.data)
      return r.changed
    })
  }
}

/** 运行中跨 0 点：静默结算并推送新状态（PRD §7.4） */
function startSettleTimer(): void {
  setInterval(() => {
    const nowKey = localDateKey(appClock.now())
    if (nowKey === lastSettleCheck) return
    lastSettleCheck = nowKey
    void ctx
      .settleIfCrossed()
      .then((r) => {
        if (r.changed) safeWin()?.webContents.send(IPC.stateUpdated, r.data)
      })
      .catch(() => {})
  }, 30_000)
}

/** 分辨率变化/拔显示器 → 组件回到主屏可见范围（PRD §10-40） */
function watchDisplayChanges(): void {
  const reposition = (): void => {
    const w = safeWin()
    if (!w || !ctx) return
    const d = ctx.current()
    const wa = screen.getPrimaryDisplay().workArea
    const q = d.uiState.quickVisible
    const done = d.uiState.doneVisible
    // 四轮定稿 B：锚点语义——按窗口 bounds 跨屏钳制，再换算回锚点
    const scale = effectiveClusterScale(d.uiState.clusterScale, wa, q, done)
    const wb = windowBoundsForAnchor(currentPos ?? { x: 0, y: 0 }, scale, q, done)
    const displays = screen.getAllDisplays().map((disp) => disp.workArea)
    const next = ensureOnSomeDisplay({ x: wb.x, y: wb.y }, { width: wb.width, height: wb.height }, displays)
    w.setPosition(next.x, next.y)
    currentPos = { x: anchorForWindowX(next.x, scale, q), y: next.y }
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
    if (ctx && currentPos) {
      const d = ctx.current()
      await ctx.commit({ ...d, uiState: { ...d.uiState, pos: currentPos } }, currentPos)
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
  if (BrowserWindow.getAllWindows().length === 0 && ctx) createWindow(ctx.current())
})

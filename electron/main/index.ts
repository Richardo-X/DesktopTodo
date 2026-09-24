import { app, BrowserWindow, Tray, Menu, ipcMain, screen, dialog, nativeImage } from 'electron'
import { join } from 'node:path'
import { writeFile, readFile } from 'node:fs/promises'
import { FileRepository } from '../../src/core/repositories/file'
import { SystemClock } from '../../src/core/interfaces/clock'
import { OffsetClock } from './clock'
import type { IClock } from '../../src/core/interfaces/clock'
import { AppContext } from './context'
import { clusterBounds, defaultWindowOptions, effectiveClusterScale, initialPos, type PanelVisibility } from './layout'
import { acquireSingleInstanceLock } from './single-instance'
import { buildTrayContextMenu, exitConfirmMessage } from './tray-menu'
import { trayIconPng } from './icon'
import { applyTopMost } from './window-state'
import { setAutoStart } from './auto-start'
import { ensureOnSomeDisplay, clampPosToWorkArea } from '../../src/core/utils/screen-clamp'
import { localDateKey } from '../../src/core/utils/date'
import { IPC, type ChildKind } from '../../src/ipc/contract'
import { SNAP_THRESHOLD, TUCK_BAR_HEIGHT } from '../../src/core/constants'
import { childWindowOptions } from './child-windows'

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

  createWindow(data)
  createTray()
  registerIpc()
  startSettleTimer()
  watchDisplayChanges()
}

function panelVisibility(): PanelVisibility {
  const d = ctx.current()
  return { quickVisible: d.uiState.quickVisible, doneVisible: d.uiState.doneVisible }
}

function createWindow(data: ReturnType<AppContext['current']>): void {
  const wa = screen.getPrimaryDisplay().workArea
  // 决策#23：初始缩放按所在屏钳制（高度≤半屏、宽度≤屏宽），窗口与渲染层 zoom 1:1
  const scale = effectiveClusterScale(data.uiState.clusterScale, panelVisibility(), wa)
  const bounds = clusterBounds(scale, panelVisibility())
  const pos =
    data.uiState.pos !== null
      ? clampPosToWorkArea(data.uiState.pos, bounds, wa)
      : initialPos(wa, bounds)

  const win_ = new BrowserWindow({
    ...defaultWindowOptions(bounds),
    x: pos.x,
    y: pos.y,
    webPreferences: {
      ...defaultWindowOptions(bounds).webPreferences,
      preload: join(__dirname, '../preload/index.js')
    }
  })
  win = win_
  visible = true
  currentPos = pos

  win_.on('ready-to-show', () => win_!.show())
  win_.on('moved', () => {
    const b = win_!.getBounds()
    currentPos = { x: b.x, y: b.y }
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

  applyTopMost(win_, data.uiState.topMost)

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
  refreshTrayMenu()
}

function hideToTray(): void {
  visible = false
  safeWin()?.hide()
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

/** 按 uiState（缩放/面板开关/缩进）同步主窗口尺寸；位置不变（T38/T39/T43；缩放经决策#23 钳制） */
function syncMainBounds(): void {
  const w = safeWin()
  if (!w || !ctx) return
  const d = ctx.current()
  const scale = effectiveClusterScale(d.uiState.clusterScale, panelVisibility(), screen.getPrimaryDisplay().workArea)
  const b = clusterBounds(scale, panelVisibility())
  const height = tucked ? TUCK_BAR_HEIGHT : b.height
  const pos = currentPos ?? w.getBounds()
  w.setBounds({ x: pos.x, y: pos.y, width: b.width, height })
}

/** 吸附检测：窗口顶边接近工作区顶（阈值见附录 A8）→ 通知渲染层状态机 */
function detectSnap(): void {
  const w = safeWin()
  if (!w) return
  const wa = screen.getPrimaryDisplay().workArea
  const b = w.getBounds()
  const now = b.y - wa.y <= SNAP_THRESHOLD
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

/** 打开子窗口：屏内居中级联、位置不记忆、高度≤半屏（速查 #7） */
function openChildWindow(kind: ChildKind, id?: string): void {
  const wa = screen.getPrimaryDisplay().workArea
  const placement = childWindowOptions(kind, wa, childWindows.size)
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
    webPreferences: childWebPreferences()
  })
  childWindows.add(child)
  lockNonChildWindows(true)

  child.on('ready-to-show', () => child.show())
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
    const w = safeWin()
    if (w) applyTopMost(w, enabled)
  })

  ipcMain.handle(IPC.setVisibility, (_e, v: boolean) => {
    if (v) showWindow()
    else hideToTray()
  })

  ipcMain.handle(IPC.setAutoStart, (_e, enabled: boolean) => {
    setAutoStart(enabled)
    return true
  })

  ipcMain.handle(IPC.minimizeToTray, () => hideToTray())

  ipcMain.handle(IPC.saveCsv, async (_e, p: { fileName: string; content: string }) => {
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
  })

  ipcMain.handle(IPC.openCsv, async () => {
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
    const bounds = clusterBounds(ctx.current().uiState.clusterScale, panelVisibility())
    const displays = screen.getAllDisplays().map((d) => d.workArea)
    const next = ensureOnSomeDisplay(currentPos ?? { x: 0, y: 0 }, bounds, displays)
    w.setPosition(next.x, next.y)
    currentPos = next
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

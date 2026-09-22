import { app, BrowserWindow, Tray, Menu, ipcMain, screen, dialog, nativeImage } from 'electron'
import { join } from 'node:path'
import { writeFile, readFile } from 'node:fs/promises'
import { FileRepository } from '../../src/core/repositories/file'
import { SystemClock } from '../../src/core/interfaces/clock'
import { AppContext } from './context'
import { clusterBounds, defaultWindowOptions, initialPos, type PanelVisibility } from './layout'
import { acquireSingleInstanceLock } from './single-instance'
import { buildTrayContextMenu, exitConfirmMessage } from './tray-menu'
import { trayIconPng } from './icon'
import { applyTopMost } from './window-state'
import { setAutoStart } from './auto-start'
import { ensureOnSomeDisplay, clampPosToWorkArea } from '../../src/core/utils/screen-clamp'
import { localDateKey } from '../../src/core/utils/date'
import { IPC, type ChildKind } from '../../src/ipc/contract'
import { childWindowOptions } from './child-windows'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let visible = true
let hasUnsavedEdits = false
let lastSettleCheck = localDateKey(new Date())
let currentPos: { x: number; y: number } | null = null
let ctx: AppContext

const gotLock = acquireSingleInstanceLock(() => {
  showWindow()
})

if (!gotLock) {
  app.quit()
} else {
  app.whenReady().then(bootstrap)
}

async function bootstrap(): Promise<void> {
  const repo = new FileRepository(join(app.getPath('userData'), 'data.json'))
  ctx = new AppContext(repo, new SystemClock())
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
  const bounds = clusterBounds(data.uiState.clusterScale, panelVisibility())
  const pos =
    data.uiState.pos !== null
      ? clampPosToWorkArea(data.uiState.pos, bounds, wa)
      : initialPos(wa, bounds)

  const win_ = new BrowserWindow({
    ...defaultWindowOptions(bounds),
    x: pos.x,
    y: pos.y
  })
  win = win_
  visible = true
  currentPos = pos

  win_.on('ready-to-show', () => win_!.show())
  win_.on('moved', () => {
    const b = win_!.getBounds()
    currentPos = { x: b.x, y: b.y }
  })
  win_.on('close', (e) => {
    // 唯一退出途径是托盘菜单；点 × 等同缩小到通知栏（PRD §2.1）
    if (!(app as unknown as { isQuitting?: boolean }).isQuitting) {
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
  win?.show()
  refreshTrayMenu()
}

function hideToTray(): void {
  visible = false
  win?.hide()
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
  if (!win) return quitNow()
  const r = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['退出', '取消'],
    defaultId: 0,
    cancelId: 1,
    message: exitConfirmMessage(hasUnsavedEdits)
  })
  if (r.response === 0) quitNow()
}

function quitNow(): void {
  ;(app as unknown as { isQuitting?: boolean }).isQuitting = true
  app.quit()
}

const childWindows = new Set<BrowserWindow>()

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
  child.on('closed', () => {
    childWindows.delete(child)
    if (childWindows.size === 0) lockNonChildWindows(false)
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
  ipcMain.handle(IPC.getState, () => ctx.current())

  ipcMain.handle(IPC.commit, (_e, data: Awaited<ReturnType<AppContext['boot']>>) =>
    ctx.commit(data, currentPos)
  )

  ipcMain.handle(IPC.flush, () => ctx.flush())

  ipcMain.handle(IPC.setTopMost, (_e, enabled: boolean) => {
    if (win) applyTopMost(win, enabled)
  })

  ipcMain.handle(IPC.setVisibility, (_e, v: boolean) => {
    if (v) showWindow()
    else hideToTray()
  })

  ipcMain.handle(IPC.setIgnoreMouseEvents, (_e, opts: { ignore: boolean; forward: boolean }) => {
    win?.setIgnoreMouseEvents(opts.ignore, { forward: opts.forward })
  })

  ipcMain.handle(IPC.setAutoStart, (_e, enabled: boolean) => {
    setAutoStart(enabled)
    return true
  })

  ipcMain.handle(IPC.minimizeToTray, () => hideToTray())

  ipcMain.handle(IPC.saveCsv, async (_e, p: { fileName: string; content: string }) => {
    if (!win) return null
    const r = await dialog.showSaveDialog(win, {
      defaultPath: p.fileName,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (r.canceled || !r.filePath) return null
    await writeFile(r.filePath, p.content, 'utf8')
    return r.filePath
  })

  ipcMain.handle(IPC.openCsv, async () => {
    const r = await dialog.showOpenDialog(win!, {
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
}

/** 运行中跨 0 点：静默结算并推送新状态（PRD §7.4） */
function startSettleTimer(): void {
  setInterval(() => {
    const nowKey = localDateKey(new Date())
    if (nowKey === lastSettleCheck) return
    lastSettleCheck = nowKey
    void ctx
      .settleIfCrossed()
      .then((r) => {
        if (r.changed) win?.webContents.send(IPC.stateUpdated, r.data)
      })
      .catch(() => {})
  }, 30_000)
}

/** 分辨率变化/拔显示器 → 组件回到主屏可见范围（PRD §10-40） */
function watchDisplayChanges(): void {
  const reposition = (): void => {
    if (!win) return
    const bounds = clusterBounds(ctx.current().uiState.clusterScale, panelVisibility())
    const displays = screen.getAllDisplays().map((d) => d.workArea)
    const next = ensureOnSomeDisplay(currentPos ?? { x: 0, y: 0 }, bounds, displays)
    win.setPosition(next.x, next.y)
    currentPos = next
  }
  screen.on('display-removed', reposition)
  screen.on('display-metrics-changed', reposition)
}

app.on('before-quit', () => {
  // 退出前强制落盘（含最新窗口位置）
  if (ctx && currentPos) {
    const d = ctx.current()
    void ctx.commit({ ...d, uiState: { ...d.uiState, pos: currentPos } }, currentPos)
  }
  if (ctx) void ctx.flush()
})

app.on('window-all-closed', () => {
  // 托盘常驻：窗口关闭不退出（唯一退出途径为托盘菜单）
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && ctx) createWindow(ctx.current())
})

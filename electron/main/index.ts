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
import { showBubble, hideBubble, resizeBubble } from './bubble'
import { localDateKey } from '../../src/core/utils/date'
import { IPC, type ChildKind } from '../../src/ipc/contract'
import { GROUP_OF, childWindowOptions } from './child-windows'
import {
  createClusterWindows,
  getMainWindow,
  getAllClusterWindows,
  getClusterAnchor,
  syncClusterBounds,
  setClusterTucked,
  hideCluster,
  showCluster,
  applyTopMostToCluster,
  repositionClusterToDisplays,
  registerClusterIpc,
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

const childWindows = new Set<BrowserWindow>()

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
    BrowserWindow.fromWebContents(e.sender)?.close()
  })

  // 决策#7/#24：子窗口缩放=真窗口尺寸变化；Windows 限制：resizable=false 时 setSize 缩小不生效 → 临时解除
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
    setClusterTucked(v)
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
    await ctx.commit(data, anchor)
    syncClusterBounds(data.uiState)
    // 广播到所有窗口：三窗+子窗口状态一致（跨窗同步主干，批次 B-2 复用）
    const latest = ctx.current()
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.stateUpdated, latest)
    }
  })

  ipcMain.handle(IPC.flush, () => ctx.flush())

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

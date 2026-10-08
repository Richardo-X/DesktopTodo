import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { placeBubbleScreen, type ScreenRow } from '../../src/components/content-bubble'

/** 四轮定稿：气泡独立小窗口——无边框透明、置顶、鼠标穿透、不进任务栏、不抢焦点。
 * 可越出主窗口边界显示；位置=鼠标所在行的左侧（会碰屏幕左缘时翻转到行右侧）。
 * 显示门控（闪现修复）：showBubble 只发 payload 不显示——渲染层量得内容尺寸回包（resizeBubble）
 * 贴合落位后才显示；payload 发出 100ms 无回包按全尺寸几何兜底强制显示（防渲染层失联）。 */

const BUBBLE_W = 320
const BUBBLE_H = 160
// 兜底窗口：真机实测回包 p99=82ms（bubble.log 2026-10-08）——100ms 余量不足，
// 系统繁忙时兜底抢先以全尺寸显示、回包到达再收缩=用户所见"缩放一下/出现两次"。
// 悬停显示延迟本身 500ms 垫底，300ms 兜底（总感知 ≤800ms）无观感代价
const SHOW_FALLBACK_MS = 300

/** TEMP 气泡诊断日志（闪现调查用，随 geoLog 一并清理） */
function bubbleLog(msg: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('node:fs') as typeof import('node:fs')
    fs.appendFileSync('C:/tmp/bubble.log', new Date().toISOString().slice(11, 23) + ' ' + msg + '\n')
  } catch (err) {
    console.error('[bubble-log-err]', err)
  }
}

let bubbleWin: BrowserWindow | null = null
let bubbleLoaded = false
/** 逻辑显示状态：opacity 0 期间窗口物理可见（透明）——Chromium 持续产帧、表面常驻 */
let bubbleShown = false
let lastGeom: { x: number; y: number } | null = null
let lastPlacement: { row: ScreenRow; side: 'left' | 'right' } | null = null
let lastPayload: { text: string; theme: 'day' | 'night'; side: 'left' | 'right' } | null = null
let showFallbackTimer: ReturnType<typeof setTimeout> | null = null
let payloadSentAt = 0

/** 落位+显示：setBounds（resizable 临时解除）→ 冷启动首显 showInactive → 透明度恢复 1。
 * C3 定稿：窗口从不 hide——Chromium 隐藏窗挂起 GPU 表面、再显示时表面重建，
 * 用户视频慢放实锤「出现→快速消失→再出现」（主进程日志零异常=纯合成层行为）；
 * 透明常驻=表面永不销毁，显示即透明度 0→1，无空帧窗口期 */
function presentBubble(win: BrowserWindow, x: number, y: number, w: number, h: number): void {
  const wasResizable = win.isResizable()
  if (!wasResizable) win.setResizable(true)
  win.setBounds({ x, y, width: w, height: h })
  if (!wasResizable) win.setResizable(false)
  if (!win.isVisible()) win.showInactive() // 冷启动首显（此后窗口常驻可见，仅透明度变化）
  win.setOpacity(1)
  bubbleShown = true
}

function armShowFallback(): void {
  if (showFallbackTimer !== null) clearTimeout(showFallbackTimer)
  payloadSentAt = Date.now()
  showFallbackTimer = setTimeout(() => {
    showFallbackTimer = null
    if (bubbleWin === null || bubbleWin.isDestroyed() || lastGeom === null) return
    // 渲染层失联兜底：按全尺寸几何落位后强制显示（退化路径，位置仍正确）
    bubbleLog(`FALLBACK-SHOW elapsed=${Date.now() - payloadSentAt}ms`)
    presentBubble(bubbleWin, lastGeom.x, lastGeom.y, BUBBLE_W, BUBBLE_H)
  }, SHOW_FALLBACK_MS)
}

function cancelShowFallback(): void {
  if (showFallbackTimer !== null) {
    clearTimeout(showFallbackTimer)
    showFallbackTimer = null
  }
}

function webPreferences(): {
  preload: string
  contextIsolation: boolean
  nodeIntegration: boolean
  sandbox: boolean
  backgroundThrottling: boolean
} {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    // 纯展示窗：禁后台节流——隐藏期渲染器全速处理 IPC，量尺寸回包稳定毫秒级
    // （隐藏渲染器被 Chromium 节流是慢回包根源，慢回包逼近兜底窗口=全尺寸闪现风险）
    backgroundThrottling: false
  }
}

function ensureBubbleWindow(): BrowserWindow {
  if (bubbleWin !== null && !bubbleWin.isDestroyed()) return bubbleWin
  bubbleWin = new BrowserWindow({
    width: BUBBLE_W,
    height: BUBBLE_H,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: webPreferences()
  })
  bubbleWin.setIgnoreMouseEvents(true) // 纯展示：绝不拦截桌面/组件点击
  bubbleWin.setAlwaysOnTop(true, 'screen-saver', 1) // 高于置顶主窗（relativeLevel 数值）
  // 首次加载完成前 send 会丢——加载完成后重发缓存 payload（页面脚本在 load 事件前已挂好监听）；
  // 重发点同时武装显示兜底（冷启动首显不经全尺寸、也不提前显示）
  bubbleWin.webContents.on('did-finish-load', () => {
    bubbleLoaded = true
    bubbleLog('DID-FINISH-LOAD resend=' + (lastPayload !== null))
    if (lastPayload !== null && bubbleWin !== null && !bubbleWin.isDestroyed()) {
      bubbleWin.webContents.send('bubble:payload', lastPayload)
      armShowFallback()
    }
  })
  void bubbleWin.loadFile(join(__dirname, '../renderer/index.html'), { query: { win: 'bubble' } })
  return bubbleWin
}

/** 渲染层传来「行视口矩形」，换算屏幕矩形并落位（左侧优先，碰左缘翻右侧） */
export function showBubble(
  senderBounds: { x: number; y: number; width: number; height: number },
  payload: { text: string; theme: 'day' | 'night'; row: ScreenRow }
): void {
  const win = ensureBubbleWindow()
  const screenRow: ScreenRow = {
    left: senderBounds.x + payload.row.left,
    top: senderBounds.y + payload.row.top,
    right: senderBounds.x + payload.row.right,
    bottom: senderBounds.y + payload.row.bottom
  }
  const geom = placeBubbleScreen(screenRow, BUBBLE_W)
  lastGeom = { x: geom.x, y: geom.y }
  lastPlacement = { row: screenRow, side: geom.side }
  lastPayload = { text: payload.text, theme: payload.theme, side: geom.side }
  bubbleLog(`SHOW-BUBBLE side=${geom.side} geom=${geom.x},${geom.y} textLen=${payload.text.length} loaded=${bubbleLoaded} vis=${win.isVisible()}`)
  win.webContents.send('bubble:payload', lastPayload) // 页面未加载完时无监听者会丢——did-finish-load 重发
  if (bubbleLoaded) armShowFallback() // 兜底只在 payload 有机会送达后武装（冷启动由 did-finish-load 武装）
  // 不立即显示：等渲染层量尺寸回包贴合（resizeBubble）或兜底——防全尺寸闪现
}

export function hideBubble(): void {
  if (showFallbackTimer !== null) bubbleLog('HIDE cancel-fallback')
  cancelShowFallback()
  if (bubbleWin !== null && !bubbleWin.isDestroyed()) {
    bubbleWin.setOpacity(0) // 透明替代 hide：表面常驻（C3 闪现修复本体）
    bubbleShown = false
  }
}

/** 气泡页量得实际内容尺寸后回调：按已定 side 重排（垂直仍对齐行中心），窗口收缩贴合内容；
 * 量完才显示的门在此打开（pending 时） */
export function resizeBubble(p: { w: number; h: number }): void {
  if (bubbleWin === null || bubbleWin.isDestroyed() || lastPlacement === null) return
  const pending = showFallbackTimer !== null
  if (!pending && !bubbleShown) return // 透明期迟到回包：整个跳过（setBounds 会改变隐藏中的气泡几何）
  const w = Math.min(BUBBLE_W, Math.max(80, Math.round(p.w)))
  const h = Math.min(BUBBLE_H, Math.max(30, Math.round(p.h)))
  const cy = (lastPlacement.row.top + lastPlacement.row.bottom) / 2
  const x = Math.round(
    lastPlacement.side === 'left' ? lastPlacement.row.left - 14 - w : lastPlacement.row.right + 14
  ) // 行坐标来自 zoom 视觉空间常为分数——取整防分数 DIP 在非整数缩放屏上放大取整斜差
  bubbleLog(`RESIZE w=${w} h=${h} pending=${pending} elapsed=${payloadSentAt ? Date.now() - payloadSentAt : -1}ms`)
  presentBubble(bubbleWin, x, Math.round(cy - h / 2), w, h)
  if (pending) {
    cancelShowFallback()
    bubbleLog('SHOW fitted')
  }
}

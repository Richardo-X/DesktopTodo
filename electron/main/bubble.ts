import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { placeBubbleScreen, type ScreenRow } from '../../src/components/content-bubble'

/** 四轮定稿：气泡独立小窗口——无边框透明、置顶、鼠标穿透、不进任务栏、不抢焦点。
 * 可越出主窗口边界显示；位置=鼠标所在行的左侧（会碰屏幕左缘时翻转到行右侧）。 */

const BUBBLE_W = 320
const BUBBLE_H = 160

let bubbleWin: BrowserWindow | null = null
let lastPlacement: { row: ScreenRow; side: 'left' | 'right' } | null = null
let lastPayload: { text: string; theme: 'day' | 'night'; side: 'left' | 'right' } | null = null

function webPreferences(): { preload: string; contextIsolation: boolean; nodeIntegration: boolean; sandbox: boolean } {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false
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
  // 首次加载完成前 send 会丢——加载完成后重发缓存 payload（页面脚本在 load 事件前已挂好监听）
  bubbleWin.webContents.on('did-finish-load', () => {
    if (lastPayload !== null && bubbleWin !== null && !bubbleWin.isDestroyed()) {
      bubbleWin.webContents.send('bubble:payload', lastPayload)
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
  lastPlacement = { row: screenRow, side: geom.side }
  lastPayload = { text: payload.text, theme: payload.theme, side: geom.side }
  win.setBounds({ x: geom.x, y: geom.y, width: BUBBLE_W, height: BUBBLE_H })
  win.webContents.send('bubble:payload', lastPayload)
  win.showInactive()
}

export function hideBubble(): void {
  if (bubbleWin !== null && !bubbleWin.isDestroyed()) bubbleWin.hide()
}

/** 气泡页量得实际内容尺寸后回调：按已定 side 重排（垂直仍对齐行中心），窗口收缩贴合内容 */
export function resizeBubble(p: { w: number; h: number }): void {
  if (bubbleWin === null || bubbleWin.isDestroyed() || lastPlacement === null) return
  const w = Math.min(BUBBLE_W, Math.max(80, Math.round(p.w)))
  const h = Math.min(BUBBLE_H, Math.max(30, Math.round(p.h)))
  const cy = (lastPlacement.row.top + lastPlacement.row.bottom) / 2
  const x =
    lastPlacement.side === 'left'
      ? lastPlacement.row.left - 14 - w
      : lastPlacement.row.right + 14
  bubbleWin.setBounds({ x, y: Math.round(cy - h / 2), width: w, height: h })
}

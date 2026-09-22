/**
 * 组件簇布局与主窗口配置（纯函数，零 Electron 依赖；PRD §2/§8.1，附录 A8）。
 * Electron 侧只在薄壳层调用这些函数创建 BrowserWindow。
 */

/** 基准（scale=1）面板尺寸（DIP） */
export const BASE_PANEL = {
  side: 260, // 快捷添加 / 已完成 面板宽
  main: 320, // 待办主窗宽
  mainHeight: 560 // 簇高由主窗决定
} as const

export const BASE_GAP = 16 // 面板间隙（透明可穿透）

/** 缩放下限：内容完整可见（附录 A8，视觉验收后可校准） */
export const MIN_SCALE = 0.7

/** 半屏高度上限比例：所有窗口高度 ≤ 屏幕高度一半（PRD 速查 #7） */
export const HALF_HEIGHT_MAX_RATIO = 0.5

/** 首次启动位置边距（右侧 24px；距上边缘 48px——不贴边，避免误触发缩进） */
export const FIRST_LAUNCH_RIGHT_MARGIN = 24
export const FIRST_LAUNCH_TOP_OFFSET = 48

export interface PanelVisibility {
  quickVisible: boolean
  doneVisible: boolean
}

export interface Bounds {
  width: number
  height: number
}

export interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

/** 簇总尺寸：随面板开关与等比缩放变化 */
export function clusterBounds(scale: number, visibility: PanelVisibility): Bounds {
  const baseWidth =
    BASE_PANEL.main +
    (visibility.quickVisible ? BASE_PANEL.side + BASE_GAP : 0) +
    (visibility.doneVisible ? BASE_PANEL.side + BASE_GAP : 0)
  return {
    width: Math.round(baseWidth * scale),
    height: Math.round(BASE_PANEL.mainHeight * scale)
  }
}

/** 首次启动默认位置：屏幕右侧偏上、不贴边（PRD §10-1） */
export function initialPos(workArea: WorkArea, bounds: Bounds): { x: number; y: number } {
  const x = Math.max(workArea.x, workArea.x + workArea.width - bounds.width - FIRST_LAUNCH_RIGHT_MARGIN)
  const y = Math.min(workArea.y + workArea.height, workArea.y + FIRST_LAUNCH_TOP_OFFSET)
  return { x, y }
}

/** 主窗口构造选项（纯结构描述；Electron 侧直接传给 BrowserWindow） */
export interface WindowOptions {
  width: number
  height: number
  frame: boolean
  transparent: boolean
  skipTaskbar: boolean
  resizable: boolean
  movable: boolean
  hasShadow: boolean
  show: boolean
  webPreferences: {
    contextIsolation: boolean
    nodeIntegration: boolean
    sandbox: boolean
  }
}

/** 主窗口 BrowserWindow 构造选项（T13：无边框/透明/skipTaskbar/不可系统调整大小） */
export function defaultWindowOptions(bounds: Bounds): WindowOptions {
  return {
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  }
}

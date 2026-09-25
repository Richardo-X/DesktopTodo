/**
 * 主窗口配置（Electron 侧薄壳）：布局基准 re-export 自 src/core/utils/cluster-layout
 * （B2 起主进程与渲染层单一来源），本文件只保留窗口位置与 BrowserWindow 构造选项。
 */

export {
  BASE_PANEL,
  BASE_GAP,
  clusterBaseWidth,
  clusterBounds,
  effectiveClusterScale,
  clampChildGroupScale,
  type WorkArea
} from '../../src/core/utils/cluster-layout'
export { MIN_SCALE, HALF_HEIGHT_MAX_RATIO } from '../../src/core/constants'
import type { Bounds, WorkArea } from '../../src/core/utils/cluster-layout'

/** 首次启动位置边距（右侧 24px；距上边缘 48px——不贴边，避免误触发缩进） */
export const FIRST_LAUNCH_RIGHT_MARGIN = 24
export const FIRST_LAUNCH_TOP_OFFSET = 48

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

/** 首次启动默认位置：屏幕右侧偏上、不贴边（PRD §10-1） */
export function initialPos(workArea: WorkArea, bounds: Bounds): { x: number; y: number } {
  const x = Math.max(workArea.x, workArea.x + workArea.width - bounds.width - FIRST_LAUNCH_RIGHT_MARGIN)
  const y = Math.min(workArea.y + workArea.height, workArea.y + FIRST_LAUNCH_TOP_OFFSET)
  return { x, y }
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

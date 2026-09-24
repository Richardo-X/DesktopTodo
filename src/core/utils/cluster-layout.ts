import { clampClusterScale } from './scale'

/**
 * 组件簇布局基准（B2 单一来源：主进程窗口 bounds 与渲染层 cluster zoom 共用，决策#7 1:1 同步）。
 * 尺寸基准 = 原型 v3.1（决策#4/#18/#20）。
 */

/** 基准（scale=1）面板尺寸（DIP）：主窗 470、快捷添加/已完成 310（决策#18）、簇高 640 */
export const BASE_PANEL = {
  quick: 310,
  done: 310,
  main: 470,
  height: 640
} as const

/** 面板间隙（透明区，不响应桌面操作——决策#1；6px，决策#20） */
export const BASE_GAP = 6

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

/** 簇基准宽（scale=1）：主窗 + 可见面板 + 间隙 */
export function clusterBaseWidth(visibility: PanelVisibility): number {
  return (
    BASE_PANEL.main +
    (visibility.quickVisible ? BASE_PANEL.quick + BASE_GAP : 0) +
    (visibility.doneVisible ? BASE_PANEL.done + BASE_GAP : 0)
  )
}

/** 簇总尺寸：随面板开关与等比缩放变化（渲染层按基准尺寸 + zoom 呈现，窗口按此改 bounds） */
export function clusterBounds(scale: number, visibility: PanelVisibility): Bounds {
  return {
    width: Math.round(clusterBaseWidth(visibility) * scale),
    height: Math.round(BASE_PANEL.height * scale)
  }
}

/**
 * 有效簇缩放（决策#23）：启动/恢复/同步窗口尺寸时，存值按所在屏钳制——
 * 高度 ≤ 屏幕工作区一半、宽度 ≤ 屏宽、下限 MIN_SCALE（内容完整可见）。
 */
export function effectiveClusterScale(stored: number, visibility: PanelVisibility, wa: WorkArea): number {
  return clampClusterScale(stored, { width: clusterBaseWidth(visibility), height: BASE_PANEL.height }, wa)
}

/**
 * 展开锚定（第二轮验收反馈：以待办窗口为中心向两边展开）：
 * 快捷添加面板在主窗左侧——其开关会改变主窗在簇内的偏移量，
 * 窗口 x 需反向平移该偏移差，使「待办主窗」在屏幕上原地不动。
 */
export function anchoredMainX(
  prevX: number,
  prevVis: PanelVisibility,
  nextVis: PanelVisibility,
  scale: number
): number {
  const offset = (v: PanelVisibility): number => (v.quickVisible ? BASE_PANEL.quick + BASE_GAP : 0) * scale
  return prevX + offset(prevVis) - offset(nextVis)
}

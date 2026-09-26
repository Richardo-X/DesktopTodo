import { MIN_SCALE, TUCK_BAR_WIDTH, TUCK_BAR_HEIGHT } from '../constants'
import { clampClusterScale } from './scale'
import type { Area as WorkArea } from './scale'

export interface Bounds {
  width: number
  height: number
}

/**
 * 组件簇布局基准（B2 单一来源：主进程窗口 bounds 与渲染层 cluster zoom 共用，决策#7 1:1 同步）。
 * 尺寸基准 = 原型 v3.1.2（决策#4/#18/#20）。
 * 二轮反馈裁定：恒定三段槽位——快捷添加(-316)/待办主窗(0,0)/已完成(+476)，
 * 面板开关只在槽位内显隐，**不改变窗口几何**（主窗屏幕位置恒定，零残影）。
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

/** 簇基准宽（scale=1，恒定三段槽位全开宽） */
export function clusterBaseWidth(): number {
  return BASE_PANEL.quick + BASE_GAP + BASE_PANEL.main + BASE_GAP + BASE_PANEL.done
}

/** 簇总尺寸：随等比缩放变化（渲染层按基准尺寸 + zoom 呈现，窗口按此改 bounds） */
export function clusterBounds(scale: number): Bounds {
  return {
    width: Math.round(clusterBaseWidth() * scale),
    height: Math.round(BASE_PANEL.height * scale)
  }
}

/**
 * 有效簇缩放（决策#23）：启动/恢复/同步窗口尺寸时，存值按所在屏钳制——
 * 高度 ≤ 屏幕工作区一半、宽度 ≤ 屏宽、下限 MIN_SCALE（内容完整可见）。
 */
export function effectiveClusterScale(stored: number, wa: WorkArea): number {
  return clampClusterScale(stored, { width: clusterBaseWidth(), height: BASE_PANEL.height }, wa)
}

/**
 * 二级窗口组缩放钳制（照原型 setGroupScale 一模一样的规则，第二轮反馈裁定）：
 * - 上限 = min(1.6, (屏宽-24)/基准宽, (屏高-24)/基准高)——屏幕放不下即停
 * - 下限 0.7；步进 0.05（round(v×20)/20）
 * - 内容流式 reflow，无 zoom（文字尺寸不随窗口缩放）
 */
export function clampChildGroupScale(v: number, baseWidth: number, baseHeight: number, wa: WorkArea): number {
  const cap = Math.min(1.6, (wa.width - 24) / baseWidth, (wa.height - 24) / baseHeight)
  if (v > cap) v = cap
  return Math.round(Math.max(MIN_SCALE, v) * 20) / 20
}

/** 缩进胶囊窗口 bounds（三轮8.2-1）：宽=胶囊、水平居中于原簇、y 不变（贴顶）。
 * 主进程 syncMainBounds 与恢复逻辑单一来源；弹出时调用方用原 pos 重算全宽 bounds */
export function tuckBarBounds(pos: { x: number; y: number }, clusterWidth: number): Bounds & { x: number; y: number } {
  return {
    x: pos.x + Math.round((clusterWidth - TUCK_BAR_WIDTH) / 2),
    y: pos.y,
    width: TUCK_BAR_WIDTH,
    height: TUCK_BAR_HEIGHT
  }
}

export type { WorkArea }

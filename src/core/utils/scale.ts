import { MIN_SCALE, HALF_HEIGHT_MAX_RATIO } from '../constants'

export interface Area {
  x: number
  y: number
  width: number
  height: number
}

export interface BaseBounds {
  width: number
  height: number
}

/**
 * 簇等比缩放钳制（§5-H，PRD 速查 #7）：
 * - 上限：高度 ≤ 屏幕工作区一半、宽度 ≤ 屏宽
 * - 下限：MIN_SCALE（内容完整可见）
 */
export function clampClusterScale(target: number, base: BaseBounds, wa: Area, minScale = MIN_SCALE): number {
  const maxByHeight = (wa.height * HALF_HEIGHT_MAX_RATIO) / base.height
  const maxByWidth = wa.width / base.width
  const upper = Math.max(minScale, Math.min(maxByHeight, maxByWidth))
  return Math.min(upper, Math.max(minScale, target))
}

/** 子窗口分组等比缩放：同一钳制规则（T40） */
export function clampChildScale(target: number, baseWidth: number, baseHeight: number, wa: Area, minScale = MIN_SCALE): number {
  return clampClusterScale(target, { width: baseWidth, height: baseHeight }, wa, minScale)
}

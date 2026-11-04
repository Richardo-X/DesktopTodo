import { MIN_SCALE, HALF_HEIGHT_MAX_RATIO, TUCK_BAR_WIDTH, TUCK_BAR_HEIGHT } from '../constants'
import { clampClusterScale } from './scale'
import type { Area as WorkArea } from './scale'

export interface Bounds {
  width: number
  height: number
}

/**
 * 组件簇布局基准（B2 单一来源：主进程窗口 bounds 与渲染层 cluster zoom 共用，决策#7 1:1 同步）。
 * 尺寸基准 = 原型 v3.1.2（决策#4/#18/#20）。
 * 四轮定稿 B（动态窗口）：隐藏面板不再占位——窗口 bounds=可见面板并集；
 * pos 语义=待办窗口左上角锚点（缩放/开关面板的唯一不动点，替代二轮恒定槽位方案）。
 */

/** 基准（scale=1）面板尺寸（DIP）：主窗 470、快捷添加/已完成 310（决策#18）、簇高 640 */
export const BASE_PANEL = {
  quick: 310,
  done: 310,
  main: 470,
  height: 640
} as const

/** 面板间隙（透明区，不响应桌面操作——决策#1；6px，决策#20） */
export const BASE_GAP = 4

/** 簇基准宽（scale=1，恒定三段槽位全开宽） */
export function clusterBaseWidth(): number {
  return BASE_PANEL.quick + BASE_GAP + BASE_PANEL.main + BASE_GAP + BASE_PANEL.done
}

/** 簇总尺寸（全开，兼容保留）：随等比缩放变化 */
export function clusterBounds(scale: number): Bounds {
  return {
    width: Math.round(clusterBaseWidth() * scale),
    height: Math.round(BASE_PANEL.height * scale)
  }
}

/** 可见簇基准宽（scale=1）：主窗 + 可见侧面板（各含 6px 缝隙）——隐藏面板不占位（四轮 B） */
export function visibleClusterWidth(quickVisible: boolean, doneVisible: boolean): number {
  return (
    BASE_PANEL.main +
    (quickVisible ? BASE_PANEL.quick + BASE_GAP : 0) +
    (doneVisible ? BASE_PANEL.done + BASE_GAP : 0)
  )
}

/** 可见簇总尺寸（随等比缩放变化，窗口 bounds 与渲染层 cluster 宽度共用） */
export function visibleClusterBounds(scale: number, quickVisible: boolean, doneVisible: boolean): Bounds {
  return {
    width: Math.round(visibleClusterWidth(quickVisible, doneVisible) * scale),
    height: Math.round(BASE_PANEL.height * scale)
  }
}

/** 快捷可见时：窗口左缘 → 待办左缘的真实像素偏移（含缩放）；隐藏时待办即最左，偏移 0 */
export function quickOffsetPx(scale: number, quickVisible: boolean): number {
  return quickVisible ? Math.round((BASE_PANEL.quick + BASE_GAP) * scale) : 0
}

/** 锚点（待办窗口左上角）→ OS 窗口 bounds（主进程 syncMainBounds/createWindow 单一来源） */
export function windowBoundsForAnchor(
  anchor: { x: number; y: number },
  scale: number,
  quickVisible: boolean,
  doneVisible: boolean
): Bounds & { x: number; y: number } {
  const b = visibleClusterBounds(scale, quickVisible, doneVisible)
  return { x: anchor.x - quickOffsetPx(scale, quickVisible), y: anchor.y, width: b.width, height: b.height }
}

/** OS 窗口左缘 → 锚点 x（moved/drag 回写 pos 用；与 windowBoundsForAnchor 往返一致） */
export function anchorForWindowX(windowX: number, scale: number, quickVisible: boolean): number {
  return windowX + quickOffsetPx(scale, quickVisible)
}

/**
 * 有效簇缩放（决策#23）：启动/恢复/同步窗口尺寸时，存值按所在屏钳制——
 * 高度 ≤ 屏幕工作区一半、宽度 ≤ 屏宽、下限 MIN_SCALE（内容完整可见）。
 */
export function effectiveClusterScale(
  stored: number,
  wa: WorkArea,
  quickVisible = true,
  doneVisible = true
): number {
  return clampClusterScale(stored, { width: visibleClusterWidth(quickVisible, doneVisible), height: BASE_PANEL.height }, wa)
}

/**
 * 簇缩放上限（快捷窗画布用，方案《技术手册-快捷窗缩放修复-移植Electron版》§2-步骤1）：
 * 与 clampClusterScale 同公式，只取上限——画布尺寸=当前工作区可达的最大档。
 */
export function clusterScaleUpperBound(base: Bounds, wa: WorkArea): number {
  const maxByHeight = (wa.height * HALF_HEIGHT_MAX_RATIO) / base.height
  const maxByWidth = wa.width / base.width
  return Math.max(MIN_SCALE, Math.min(maxByHeight, maxByWidth))
}

/** 快捷窗画布 maxScale：与手势钳制同基准（可见簇宽+簇高）；可见性/工作区变化时重算 */
export function quickCanvasMaxScale(wa: WorkArea, quickVisible: boolean, doneVisible: boolean): number {
  return clusterScaleUpperBound({ width: visibleClusterWidth(quickVisible, doneVisible), height: BASE_PANEL.height }, wa)
}

/**
 * 快捷窗画布矩形（缩放抖动根治核心）：窗口尺寸恒定=最大档画布，右缘钉待办左缘 − GAP、
 * 上缘钉锚点。只依赖 (anchor, maxScale)——缩放值不是输入：缩放档位变化时画布矩形完全不动。
 */
export function quickCanvasBoundsForAnchor(anchor: { x: number; y: number }, maxScale: number): WinBounds {
  const width = Math.round(BASE_PANEL.quick * maxScale)
  const height = Math.round(BASE_PANEL.height * maxScale)
  return { x: anchor.x - width - BASE_GAP, y: anchor.y, width, height }
}

/**
 * 快捷窗可见卡面矩形：卡面钉画布右上角（渲染层 transformOrigin: top right）。
 * 卡面档=min(簇档, 画布 max)；画布左侧/下方的透明余量不属于组件——
 * 缩进光标判定必须用它，不能再用画布窗口 bounds（用户 2026-10-20 报告）。
 */
export function quickCardBoundsForAnchor(
  anchor: { x: number; y: number },
  maxScale: number,
  cardScale: number
): WinBounds {
  const canvas = quickCanvasBoundsForAnchor(anchor, maxScale)
  const scale = Math.min(cardScale, maxScale)
  const width = Math.round(BASE_PANEL.quick * scale)
  const height = Math.round(BASE_PANEL.height * scale)
  return { x: canvas.x + canvas.width - width, y: canvas.y, width, height }
}

/**
 * 二级窗口组缩放钳制（下限 0.7；上限 = min(1.6, (屏宽-24)/基准宽, (屏高-24)/基准高)）。
 * 【2026-10-15 迭代：移除原型 0.05 步进量化】——量化=拖拽中每 0.05 一跳（"突然变大/变小"手感），
 * 与主窗缩放量化回退（v1.0.1 实测一卡一卡更差）同理；缩放值连续平滑。
 */
export function clampChildGroupScale(v: number, baseWidth: number, baseHeight: number, wa: WorkArea): number {
  const cap = Math.min(1.6, (wa.width - 24) / baseWidth, (wa.height - 24) / baseHeight)
  return Math.max(MIN_SCALE, Math.min(cap, v))
}

/** 缩进胶囊窗口 bounds（三轮8.2-1）：宽=胶囊、水平居中于原簇、y 不变（贴顶）。
 * 2026-10-16：height=热区（6px，减半）；主进程摆放后按系统最小窗高实测校正——
 * 超出热区的部分挂到屏幕上方（屏外不可命中），屏内可见区=热区本身 */
export function tuckBarBounds(pos: { x: number; y: number }, clusterWidth: number): Bounds & { x: number; y: number } {
  return {
    x: pos.x + Math.round((clusterWidth - TUCK_BAR_WIDTH) / 2),
    y: pos.y,
    width: TUCK_BAR_WIDTH,
    height: TUCK_BAR_HEIGHT
  }
}

/** OS 窗口完整 bounds（x/y/宽/高） */
export interface WinBounds {
  x: number
  y: number
  width: number
  height: number
}

/** 三窗逐窗 bounds：隐藏侧窗=null（独立 OS 窗口不占位；批次 A spike 与批次 B 几何迁移共用） */
export interface ClusterWindowsBounds {
  quick: WinBounds | null
  main: WinBounds
  done: WinBounds | null
}

/**
 * 三窗分离定稿（§9.2/#31）逐窗 bounds：锚点=待办左上角（唯一不动点），
 * 快捷窗右缘钉待办左缘 -6、已完成窗左缘钉待办右缘 +6；各窗偏移/尺寸独立取整（缝隙 ±1px 容差）。
 * 纯函数：同帧拖动=锚点平移 → 全部可见窗坐标同步平移（单测不变量），主进程逐窗 setBounds 即可同帧定位。
 */
export function threeWindowBoundsForAnchor(
  anchor: { x: number; y: number },
  scale: number,
  quickVisible: boolean,
  doneVisible: boolean
): ClusterWindowsBounds {
  // 侧窗位置从主窗整数值推导（而非独立 round(316s)/round(476s)）：缩放拖动时
  // 两个独立取整的进位相位不同，缝隙每帧 ±1px 摆动（用户实测左窗抖动远大于右窗）——
  // 推导式保证缝隙在任意 scale 下精确恒定（三窗相对对齐，#31 诉求）
  const mainW = Math.round(BASE_PANEL.main * scale)
  const sideW = Math.round(BASE_PANEL.quick * scale)
  const height = Math.round(BASE_PANEL.height * scale)
  // 缝隙=固定常量（不参与缩放）：左窗右上角严格钉在主窗左缘-6、不随缩放漂移
  // （缝隙是窗口间的桌面间隔，不是窗口内容——单窗时代 zoom 遗留的 ×scale 已移除）
  const gap = BASE_GAP
  return {
    quick: quickVisible ? { x: anchor.x - sideW - gap, y: anchor.y, width: sideW, height } : null,
    main: { x: anchor.x, y: anchor.y, width: mainW, height },
    done: doneVisible ? { x: anchor.x + mainW + gap, y: anchor.y, width: sideW, height } : null
  }
}

/**
 * 决策 #31/#32/#33 拖动边界钳制：左右边缘不阻挡（侧窗可悬挂屏外）、拖动/点击都不自动移回；
 * 仅主窗保留 ≥90px 可见（防整簇丢失）；y 在工作区内（底部留 50px）。
 * 幂等：已合规的位置原样返回（=重启按记忆原样恢复 #32）；分辨率变化恢复亦用本函数（#33 主窗可见口径）。
 */
export function clampAnchorForEdges(
  anchor: { x: number; y: number },
  mainWidth: number,
  wa: WorkArea
): { x: number; y: number } {
  const minX = wa.x + 90 - mainWidth
  const maxX = wa.x + wa.width - 90
  return {
    x: Math.min(Math.max(anchor.x, minX), maxX),
    y: Math.min(Math.max(anchor.y, wa.y), wa.y + wa.height - 50)
  }
}

/**
 * 多显示器并集钳制（跨屏拖动）：只要锚点落在**任意一块屏**的合法区域
 * （主窗在该屏 ≥90px 可见、y 在该屏工作区内且底部留 50px），就原样返回；
 * 否则取所有屏合法区域中距离锚点最近的钳制点。
 *
 * 与单屏 clampAnchorForEdges 的差异：两屏相邻时合法区间会重叠，跨屏拖动不再被
 * “主窗当前所在屏”锁死；只有屏间空隙才会吸附到最近合法点。
 * 单屏输入与 clampAnchorForEdges 完全等价；空显示器列表原样返回。
 */
export function clampAnchorForDisplays(
  anchor: { x: number; y: number },
  mainWidth: number,
  displays: WorkArea[]
): { x: number; y: number } {
  if (displays.length === 0) return anchor
  for (const wa of displays) {
    const minX = wa.x + 90 - mainWidth
    const maxX = wa.x + wa.width - 90
    if (
      anchor.x >= minX &&
      anchor.x <= maxX &&
      anchor.y >= wa.y &&
      anchor.y <= wa.y + wa.height - 50
    ) {
      return anchor
    }
  }
  let best = clampAnchorForEdges(anchor, mainWidth, displays[0])
  let bestDist = Math.hypot(best.x - anchor.x, best.y - anchor.y)
  for (let i = 1; i < displays.length; i++) {
    const candidate = clampAnchorForEdges(anchor, mainWidth, displays[i])
    const dist = Math.hypot(candidate.x - anchor.x, candidate.y - anchor.y)
    if (dist < bestDist) {
      best = candidate
      bestDist = dist
    }
  }
  return best
}

export type { WorkArea }

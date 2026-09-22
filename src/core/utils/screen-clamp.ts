/** 显示器工作区（DIP 逻辑坐标，§7 风险 6） */
export interface DisplayArea {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowBounds {
  width: number
  height: number
}

/**
 * 把窗口位置钳制到工作区可见范围内（PRD §10-40：分辨率变化/拔显示器 → 回到主屏可见范围）。
 * 窗口比工作区还大时钉在工作区原点。
 */
export function clampPosToWorkArea(
  pos: { x: number; y: number },
  bounds: WindowBounds,
  workArea: DisplayArea
): { x: number; y: number } {
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - bounds.width)
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - bounds.height)
  return {
    x: Math.min(maxX, Math.max(workArea.x, pos.x)),
    y: Math.min(maxY, Math.max(workArea.y, pos.y))
  }
}

/**
 * 确保位置位于某个显示器上：
 * - 在某屏工作区内 → 原样返回
 * - 不在任何屏（如拔掉副屏）→ 钳制回第一屏（主屏）
 * - 在某屏但部分越界 → 在该屏范围内钳制
 */
export function ensureOnSomeDisplay(
  pos: { x: number; y: number },
  bounds: WindowBounds,
  displays: DisplayArea[]
): { x: number; y: number } {
  for (const area of displays) {
    const insideX = pos.x + bounds.width > area.x && pos.x < area.x + area.width
    const insideY = pos.y + bounds.height > area.y && pos.y < area.y + area.height
    if (insideX && insideY) return clampPosToWorkArea(pos, bounds, area)
  }
  const primary = displays[0] ?? { x: 0, y: 0, width: 1920, height: 1080 }
  return clampPosToWorkArea(pos, bounds, primary)
}

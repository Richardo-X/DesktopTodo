/** 面板外接矩形（窗口内 DIP 坐标） */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export type HitTarget = 'panel' | 'gap'

/**
 * 缝隙点击穿透命中检测（附录 A7）：基于面板外接矩形（非像素级）。
 * 返回 'panel' → 命中面板，关闭穿透；'gap' → 缝隙/圆角外/簇外，开启穿透
 * （setIgnoreMouseEvents(true, {forward:true})），鼠标操作直达桌面（PRD §2.3）。
 */
export function hitTestPanels(rects: Rect[], point: Point): HitTarget {
  for (const r of rects) {
    if (
      point.x >= r.x &&
      point.x < r.x + r.width &&
      point.y >= r.y &&
      point.y < r.y + r.height
    ) {
      return 'panel'
    }
  }
  return 'gap'
}

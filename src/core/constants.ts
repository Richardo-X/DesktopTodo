/** 行为常量（附录 A8，集中管理；视觉验收后可校准） */

/** 缩放下限：内容完整可见 */
export const MIN_SCALE = 0.7

/** 半屏高度上限比例（所有窗口，速查 #7） */
export const HALF_HEIGHT_MAX_RATIO = 0.5

/** 贴边吸附阈值（px，三轮8.2-1 定稿）：0=窗口顶边真正触碰屏幕上边缘才吸附 */
export const SNAP_THRESHOLD = 0

/** 缩进胶囊热区高度（px）=缩进态屏内可见区（可见条 + 上下余量）。
 * 2026-10-16 用户裁定减半（原 12）：厚度减半 + 缩进期间白条以外的屏内区域不再有任何窗口。
 * 缩进态 OS 窗高受系统最小窗高钳制（实测 ~37-40，随 DPI），多出的部分整体挂到屏幕上方（屏外不可命中） */
export const TUCK_BAR_HEIGHT = 6

/** 缩进胶囊可见条宽（px，三轮8.2-1 定稿）：缩进时 OS 窗口收窄为该宽度，感应区=胶囊本身 */
export const TUCK_BAR_WIDTH = 160

/** 鼠标离开后自动缩回延时（ms，约半秒） */
export const TUCK_DELAY_MS = 400

/** 窗口移动停止判定（ms）：停止移动超过该时长后恢复常规缩进判定（修拖动中伪 leave 误缩回） */
export const TUCK_MOVE_IDLE_MS = 500

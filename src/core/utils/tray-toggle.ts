/** 托盘切换去抖（用户 2026-10-07 裁定）：
 * 一次双击实际产生两次托盘激活（两次按压各触发一次，实测间隔 461~889ms，
 * 超出系统双击判定窗口不被识别为双击）——切换翻倍执行导致
 * "显示→隐藏→显示"的闪退观感。去抖=1s 内的重复激活只认第一次。 */

export const TRAY_TOGGLE_DEBOUNCE_MS = 1000

/** 是否放行本次托盘切换（lastAt=上次放行时间戳；0=从未激活） */
export function shouldAcceptTrayToggle(lastAt: number, now: number, debounceMs = TRAY_TOGGLE_DEBOUNCE_MS): boolean {
  return now - lastAt >= debounceMs
}

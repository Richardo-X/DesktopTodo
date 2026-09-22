import { TUCK_DELAY_MS } from '../constants'

/**
 * 贴边缩进状态机（§5-I，纯函数）：
 * floating/snapped 之间由宿主（窗口位置检测）驱动 snap/unsnap；
 * tucked 仅在吸附、未锁定、无子窗口、非缩放中且鼠标离开超过 TUCK_DELAY_MS 后进入。
 */

export interface TuckState {
  /** 窗口吸附在上边缘 */
  snapped: boolean
  /** 已缩进为小条 */
  tucked: boolean
  /** 缩进锁定：贴边保持弹出 */
  locked: boolean
  /** 有子窗口打开：始终弹出 */
  childOpen: boolean
  /** 缩放进行中：保持弹出 */
  resizing: boolean
  /** 鼠标离开时刻（ms 时间戳）；null=鼠标在组件上 */
  leaveAt: number | null
}

export type TuckEvent =
  | { type: 'snap' }
  | { type: 'unsnap' }
  | { type: 'mouse-leave'; now: number }
  | { type: 'mouse-enter'; now: number }
  | { type: 'lock'; on: boolean }
  | { type: 'child-open' }
  | { type: 'child-closed' }
  | { type: 'resize-start' }
  | { type: 'resize-end' }
  | { type: 'tick'; now: number }

export function initialTuckState(): TuckState {
  return { snapped: false, tucked: false, locked: false, childOpen: false, resizing: false, leaveAt: null }
}

function canTuck(s: TuckState): boolean {
  return s.snapped && !s.locked && !s.childOpen && !s.resizing
}

/** 纯归约：返回新状态，不产生副作用（定时由宿主 tick 驱动） */
export function reduceTuck(state: TuckState, event: TuckEvent, delayMs: number = TUCK_DELAY_MS): TuckState {
  const s: TuckState = { ...state }

  switch (event.type) {
    case 'snap':
      s.snapped = true
      if (!canTuck(s)) s.leaveAt = null
      return s

    case 'unsnap':
      s.snapped = false
      s.tucked = false
      s.leaveAt = null
      return s

    case 'mouse-leave':
      // I6：未吸附/锁定/子窗口/缩放中 → 永不 tucked
      s.leaveAt = canTuck(s) && !s.tucked ? event.now : null
      return s

    case 'mouse-enter':
      // I2：划过小条弹出
      s.tucked = false
      s.leaveAt = null
      return s

    case 'lock':
      s.locked = event.on
      if (event.on) {
        // I3：贴边保持弹出；已 tucked 的立即弹出
        s.tucked = false
        s.leaveAt = null
      }
      return s

    case 'child-open':
      // I4：立即弹出且 tucked 清除
      s.childOpen = true
      s.tucked = false
      s.leaveAt = null
      return s

    case 'child-closed':
      s.childOpen = false
      return s

    case 'resize-start':
      s.resizing = true
      s.tucked = false
      s.leaveAt = null
      return s

    case 'resize-end':
      s.resizing = false
      return s

    case 'tick':
      // I1：离开超过延时 → tucked
      if (s.leaveAt !== null && canTuck(s) && event.now - s.leaveAt >= delayMs) {
        s.tucked = true
        s.leaveAt = null
      }
      return s
  }
}

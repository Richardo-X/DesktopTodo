import { TUCK_DELAY_MS, TUCK_MOVE_IDLE_MS } from '../constants'

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
  /** 窗口移动中（三轮8.2-1）：拖动会触发伪 mouse-leave，移动期间禁止自动缩进 */
  moving: boolean
  /** 最近一次窗口移动时刻（ms）；null=已停止移动超过空闲阈值 */
  moveAt: number | null
  /** 鼠标离开时刻（ms 时间戳）；null=鼠标在组件上 */
  leaveAt: number | null
}

export type TuckEvent =
  | { type: 'snap' }
  | { type: 'unsnap' }
  | { type: 'mouse-leave'; now: number }
  | { type: 'mouse-enter'; now: number }
  | { type: 'lock'; on: boolean }
  | { type: 'force-tuck' }
  | { type: 'child-open' }
  | { type: 'child-closed' }
  | { type: 'resize-start' }
  | { type: 'resize-end' }
  | { type: 'window-move'; now: number }
  | { type: 'tick'; now: number }

export function initialTuckState(): TuckState {
  return {
    snapped: false,
    tucked: false,
    locked: false,
    childOpen: false,
    resizing: false,
    moving: false,
    moveAt: null,
    leaveAt: null
  }
}

function canTuck(s: TuckState): boolean {
  return s.snapped && !s.locked && !s.childOpen && !s.resizing && !s.moving
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
      // I6：未吸附/锁定/子窗口/缩放中 → 永不 tucked；
      // 三轮8.2-1：移动中（moving）也记录 leaveAt（拖动的伪 leave 与真实 leave 都可能发生在移动期间），
      // 但 tick 的 canTuck 门保证移动中不缩进
      s.leaveAt = (canTuck(s) || s.moving) && !s.tucked ? event.now : null
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

    case 'force-tuck':
      // 主动收尾（3 秒会话到期/兜底）的即时缩进：跳过 400ms 防抖（几何已同步收胶囊，
      // 白条迟到即"标题条"分裂窗）；二级窗门由主进程收尾守卫保证，此处信任之
      s.tucked = true
      s.leaveAt = null
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

    case 'window-move':
      // 三轮8.2-1：窗口移动中禁止自动缩进；取消伪 mouse-leave（拖动开始时系统接管鼠标引发）
      s.moving = true
      s.moveAt = event.now
      s.leaveAt = null
      return s

    case 'tick': {
      // 三轮8.2-1：移动停止超过空闲阈值 → moving 解除
      if (s.moving && s.moveAt !== null && event.now - s.moveAt >= TUCK_MOVE_IDLE_MS) {
        s.moving = false
        s.moveAt = null
      }
      // I1：离开超过延时 → tucked
      if (s.leaveAt !== null && canTuck(s) && event.now - s.leaveAt >= delayMs) {
        s.tucked = true
        s.leaveAt = null
      }
      return s
    }
  }
}

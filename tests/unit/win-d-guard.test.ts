import { describe, it, expect } from 'vitest'
import {
  WIN_D_DEBOUNCE_MS,
  initialWinDGuardState,
  classifyWinDPress,
  resetWinDGuardForced,
  type WinDGuardState
} from '../../src/core/utils/win-d-guard'

/**
 * C-1 路线 C（LL 键盘钩子抢跑）纯判定逻辑：
 * Win+D 按键 → 动作判定。规则（用户定稿 2026-10-04 + 实验：
 * Show Desktop 只豁免 toggle 时刻已在 TOPMOST 带的窗口）：
 * - 挂件态（未置顶）第一按 = force（抢设临时置顶，快照前入带）
 * - 第二按 = unforce（只撤销自己抢设的那次——用户手动置顶绝不能被误关）
 * - 本就置顶 = none（已豁免，不碰）
 * - 托盘隐藏 = none（合法隐藏不抢，但保持按键计数节流）
 * - 300ms 防抖 = D 键自动重复不算新按
 */
describe('classifyWinDPress 按键判定', () => {
  const ctxWidget = { topMost: false, visible: true }
  const ctxTopMost = { topMost: true, visible: true }

  it('挂件态第一按 → force', () => {
    const r = classifyWinDPress(initialWinDGuardState(), 1000, ctxWidget)
    expect(r.action).toBe('force')
    expect(r.next.forced).toBe(true)
  })

  it('第二按 → unforce（撤销抢设）', () => {
    const forced: WinDGuardState = { forced: true, lastPressAt: 1000 }
    const r = classifyWinDPress(forced, 2000, ctxWidget)
    expect(r.action).toBe('unforce')
    expect(r.next.forced).toBe(false)
  })

  it('本就置顶 → none（不碰用户的置顶）', () => {
    const r1 = classifyWinDPress(initialWinDGuardState(), 1000, ctxTopMost)
    expect(r1.action).toBe('none')
    expect(r1.next.forced).toBe(false)
    // 置顶态连续多按都保持 none
    const r2 = classifyWinDPress(r1.next, 2000, ctxTopMost)
    expect(r2.action).toBe('none')
    expect(r2.next.forced).toBe(false)
  })

  it('托盘隐藏期间 → none（合法隐藏不抢；forced 标志保持原值由接线层复位）', () => {
    const r = classifyWinDPress(initialWinDGuardState(), 1000, { topMost: false, visible: false })
    expect(r.action).toBe('none')
    expect(r.next.forced).toBe(false)
  })

  it(`${WIN_D_DEBOUNCE_MS}ms 内的重复键（D 自动重复）→ none 不翻转`, () => {
    const first = classifyWinDPress(initialWinDGuardState(), 1000, ctxWidget)
    expect(first.action).toBe('force')
    const repeat = classifyWinDPress(first.next, 1000 + WIN_D_DEBOUNCE_MS - 1, ctxWidget)
    expect(repeat.action).toBe('none')
    expect(repeat.next.forced).toBe(true)
  })

  it('防抖窗口后按键算新按：force → unforce 完整往返', () => {
    const first = classifyWinDPress(initialWinDGuardState(), 1000, ctxWidget)
    const second = classifyWinDPress(first.next, 1000 + WIN_D_DEBOUNCE_MS + 1, ctxWidget)
    expect(second.action).toBe('unforce')
    expect(second.next.forced).toBe(false)
  })

  it('已 forced 时的重复键保持 forced 不抖动', () => {
    const forced: WinDGuardState = { forced: true, lastPressAt: 1000 }
    const repeat = classifyWinDPress(forced, 1100, ctxWidget)
    expect(repeat.action).toBe('none')
    expect(repeat.next.forced).toBe(true)
  })
})

describe('resetWinDGuardForced 外部复位（托盘显隐/置顶切换接线点调用）', () => {
  it('强制置顶标志被外部动作复位（接线层重申真实置顶语义后标志作废）', () => {
    const forced: WinDGuardState = { forced: true, lastPressAt: 1000 }
    const r = resetWinDGuardForced(forced)
    expect(r.forced).toBe(false)
  })

  it('未强制时复位=幂等', () => {
    const idle = initialWinDGuardState()
    expect(resetWinDGuardForced(idle).forced).toBe(false)
  })

  it('复位后下一按在挂件态仍正确 force', () => {
    const forced: WinDGuardState = { forced: true, lastPressAt: 1000 }
    const cleared = resetWinDGuardForced(forced)
    const r = classifyWinDPress(cleared, 5000, { topMost: false, visible: true })
    expect(r.action).toBe('force')
  })
})

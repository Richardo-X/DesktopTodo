import { describe, it, expect } from 'vitest'
import { clampClusterScale, clampChildScale } from '../../src/core/utils/scale'
import { MIN_SCALE, SNAP_THRESHOLD, TUCK_BAR_HEIGHT, TUCK_DELAY_MS } from '../../src/core/constants'
import {
  initialTuckState,
  reduceTuck,
  type TuckEvent,
  type TuckState
} from '../../src/core/utils/tuck'

/** 1920x1080 屏工作区（可用高 1040，半屏 520） */
const WA = { x: 0, y: 40, width: 1920, height: 1040 }
const BASE = { width: 872, height: 520 }

/** T39/§5-H 缩放钳制（H1-H4） */
describe('clampClusterScale', () => {
  it('H1 高度超半屏 → 钳制到恰好半屏比例', () => {
    // 半屏 520 / 基准高 520 = 1.0；目标 1.4 → 1.0
    expect(clampClusterScale(1.4, BASE, WA)).toBe(1.0)
  })

  it('H2 宽度先于高度达到上限 → 钳制到屏宽比例', () => {
    const wa = { x: 0, y: 0, width: 1000, height: 1000 }
    const base = { width: 872, height: 400 }
    // 高度比例 500/400=1.25；宽度比例 1000/872≈1.1469 → 宽度是有效上限
    const r = clampClusterScale(1.2, base, wa)
    expect(r).toBeCloseTo(1000 / 872, 6)
  })

  it('极小屏幕：上限低于 MIN_SCALE 时 MIN_SCALE 兜底（风险 4 对策）', () => {
    const narrow = { x: 0, y: 0, width: 400, height: 1000 }
    const base = { width: 872, height: 400 }
    expect(clampClusterScale(1.2, base, narrow)).toBe(MIN_SCALE)
  })

  it('H3 低于内容完整下限 → 钳到 MIN_SCALE', () => {
    expect(clampClusterScale(0.2, BASE, WA)).toBe(MIN_SCALE)
    expect(MIN_SCALE).toBe(0.7)
  })

  it('H4 正常范围原值返回', () => {
    expect(clampClusterScale(0.9, BASE, WA)).toBe(0.9)
  })

  it('常数：吸附阈值 26px、小条 12px、回缩延时 400ms（附录 A8）', () => {
    expect(SNAP_THRESHOLD).toBe(26)
    expect(TUCK_BAR_HEIGHT).toBe(12)
    expect(TUCK_DELAY_MS).toBe(400)
  })
})

/** T40 子窗口分组等比缩放同规则 */
describe('clampChildScale', () => {
  it('与簇同规则：半屏高/屏宽/MIN_SCALE 钳制', () => {
    expect(clampChildScale(2, 600, 560, WA)).toBeCloseTo(520 / 560, 6)
    expect(clampChildScale(0.3, 600, 560, WA)).toBe(MIN_SCALE)
    expect(clampChildScale(1, 600, 516, WA)).toBe(1)
  })
})

/** T41/§5-I 缩进状态机（I1-I6） */
describe('tuck 状态机', () => {
  function fire(seq: TuckEvent[], start: Partial<TuckState> = {}, delay = TUCK_DELAY_MS): TuckState {
    let s = { ...initialTuckState(), ...start }
    for (const e of seq) s = reduceTuck(s, e, delay)
    return s
  }

  it('I1 吸附后鼠标离开 → 约 400ms 后 tucked', () => {
    let s = fire([{ type: 'snap' }, { type: 'mouse-leave', now: 1000 }])
    expect(s.tucked).toBe(false) // 未到时
    s = reduceTuck(s, { type: 'tick', now: 1000 + TUCK_DELAY_MS - 1 }, TUCK_DELAY_MS)
    expect(s.tucked).toBe(false)
    s = reduceTuck(s, { type: 'tick', now: 1000 + TUCK_DELAY_MS }, TUCK_DELAY_MS)
    expect(s.tucked).toBe(true)
  })

  it('I2 tucked 后鼠标进入小条 → 弹出', () => {
    const s = fire([
      { type: 'snap' },
      { type: 'mouse-leave', now: 0 },
      { type: 'tick', now: 500 },
      { type: 'mouse-enter', now: 600 }
    ])
    expect(s.tucked).toBe(false)
  })

  it('I3 锁定开启 → 贴边保持弹出（且取消待决的回缩）', () => {
    const s = fire([
      { type: 'snap' },
      { type: 'lock', on: true },
      { type: 'mouse-leave', now: 0 },
      { type: 'tick', now: 1000 }
    ])
    expect(s.tucked).toBe(false)

    // 已 tucked 时开锁 → 立即弹出
    const s2 = fire([
      { type: 'snap' },
      { type: 'mouse-leave', now: 0 },
      { type: 'tick', now: 500 },
      { type: 'lock', on: true }
    ])
    expect(s2.tucked).toBe(false)
    expect(s2.locked).toBe(true)
  })

  it('I4 tucked 时打开子窗口 → 立即弹出且 tucked 清除', () => {
    const s = fire([
      { type: 'snap' },
      { type: 'mouse-leave', now: 0 },
      { type: 'tick', now: 500 },
      { type: 'child-open' }
    ])
    expect(s.tucked).toBe(false)
    expect(s.leaveAt).toBeNull()
  })

  it('I5 弹出状态缩放开始→松开：全程保持弹出', () => {
    const s = fire([
      { type: 'snap' },
      { type: 'resize-start' },
      { type: 'mouse-leave', now: 0 },
      { type: 'tick', now: 1000 },
      { type: 'resize-end' }
    ])
    expect(s.tucked).toBe(false) // 缩放期间离开不回缩
    // 松开后按常规：再次离开 → 回缩
    const s2 = reduceTuck(s, { type: 'mouse-leave', now: 2000 }, TUCK_DELAY_MS)
    const s3 = reduceTuck(s2, { type: 'tick', now: 2000 + TUCK_DELAY_MS }, TUCK_DELAY_MS)
    expect(s3.tucked).toBe(true)
  })

  it('I6 未吸附（不在上边缘）→ 任何鼠标事件永不 tucked', () => {
    const s = fire([
      { type: 'mouse-leave', now: 0 },
      { type: 'tick', now: 1000 },
      { type: 'mouse-enter', now: 1100 },
      { type: 'mouse-leave', now: 2000 },
      { type: 'tick', now: 3000 }
    ])
    expect(s.tucked).toBe(false)
  })

  it('取消吸附 → 弹出且 tucked 清除', () => {
    const s = fire([
      { type: 'snap' },
      { type: 'mouse-leave', now: 0 },
      { type: 'tick', now: 500 },
      { type: 'unsnap' }
    ])
    expect(s.tucked).toBe(false)
    expect(s.snapped).toBe(false)
  })
})

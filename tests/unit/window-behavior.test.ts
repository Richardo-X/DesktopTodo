import { describe, it, expect } from 'vitest'
import { clampClusterScale } from '../../src/core/utils/scale'
import { MIN_SCALE, SNAP_THRESHOLD, TUCK_BAR_HEIGHT, TUCK_BAR_WIDTH, TUCK_DELAY_MS } from '../../src/core/constants'
import {
  initialTuckState,
  reduceTuck,
  type TuckEvent,
  type TuckState
} from '../../src/core/utils/tuck'

/** 1920x1080 屏工作区（可用高 1040，半屏 520）；B2 起簇基准 1102×640 */
const WA = { x: 0, y: 40, width: 1920, height: 1040 }
const BASE = { width: 1102, height: 640 }

/** T39/§5-H 缩放钳制（H1-H4） */
describe('clampClusterScale', () => {
  it('H1 高度超半屏 → 钳制到恰好半屏比例（决策#23：初始缩放同样按此钳制）', () => {
    // 半屏 520 / 基准高 640 ≈ 0.8125；目标 1.4 → 0.8125
    expect(clampClusterScale(1.4, BASE, WA)).toBeCloseTo(520 / 640, 6)
    expect(clampClusterScale(1, BASE, WA)).toBeCloseTo(520 / 640, 6)
  })

  it('H2 宽度先于高度达到上限 → 钳制到屏宽比例', () => {
    const wa = { x: 0, y: 0, width: 1000, height: 1000 }
    const base = { width: 1102, height: 400 }
    // 高度比例 500/400=1.25；宽度比例 1000/1102≈0.9074 → 宽度是有效上限
    const r = clampClusterScale(1.2, base, wa)
    expect(r).toBeCloseTo(1000 / 1102, 6)
  })

  it('极小屏幕：上限低于 MIN_SCALE 时 MIN_SCALE 兜底（风险 4 对策）', () => {
    const narrow = { x: 0, y: 0, width: 400, height: 1000 }
    const base = { width: 1102, height: 400 }
    expect(clampClusterScale(1.2, base, narrow)).toBe(MIN_SCALE)
  })

  it('H3 低于内容完整下限 → 钳到 MIN_SCALE', () => {
    expect(clampClusterScale(0.2, BASE, WA)).toBe(MIN_SCALE)
    expect(MIN_SCALE).toBe(0.7)
  })

  it('H4 正常范围原值返回', () => {
    expect(clampClusterScale(0.8, BASE, WA)).toBe(0.8)
  })

  it('常数（三轮8.2-1 定稿）：吸附阈值 0px（顶边真正触碰屏幕边缘才吸附）、胶囊热区 12px、回缩延时 400ms、胶囊宽 160px', () => {
    expect(SNAP_THRESHOLD).toBe(0)
    expect(TUCK_BAR_HEIGHT).toBe(12)
    expect(TUCK_DELAY_MS).toBe(400)
    expect(TUCK_BAR_WIDTH).toBe(160)
    expect(TUCK_MOVE_IDLE_MS).toBe(500)
  })
  it('三轮8.2-1：窗口移动中（window-move）禁止自动缩进——修「弹出后拖动又变白条」', () => {
    // 拖动开始时渲染层误收到 mouse-leave（系统接管鼠标），此刻窗口仍吸附 → 旧逻辑 400ms 后自动缩回
    let s = fire(
      [
        { type: 'snap' },
        { type: 'mouse-leave', now: 1000 }, // 拖动引发的伪 leave
        { type: 'window-move', now: 1100 }  // 主进程移动事件
      ],
      {},
      400
    )
    expect(s.moving).toBe(true)
    expect(s.leaveAt).toBeNull() // 伪 leave 被取消
    s = reduceTuck(s, { type: 'tick', now: 1400 }, 400)
    expect(s.tucked).toBe(false) // 移动中不缩进

    // 停止移动 500ms 后 moving 解除，恢复正常判定
    s = reduceTuck(s, { type: 'tick', now: 1601 }, 400)
    expect(s.moving).toBe(false)
  })

  it('三轮8.2-1：移动结束且鼠标在外 → moving 解除后按 leaveAt 延时缩进（移动中的 leave 被记录但不生效）', () => {
    let s = fire(
      [
        { type: 'snap' },
        { type: 'window-move', now: 1000 },
        { type: 'mouse-leave', now: 1100 }, // moving 中：记录 leaveAt 但不缩进
        { type: 'tick', now: 1300 }
      ],
      {},
      400
    )
    expect(s.moving).toBe(true) // 空闲未满 500ms
    expect(s.tucked).toBe(false)

    s = reduceTuck(s, { type: 'tick', now: 1601 }, 400) // 空闲 601ms → moving 解除；leaveAt=1100 已超 400ms
    expect(s.moving).toBe(false)
    expect(s.tucked).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { isTruncatedWider, placeBubbleScreen } from '../../src/components/content-bubble'

/** 四轮（8.2-4 定稿）：气泡改由独立小窗口承载（可越出主窗口），屏幕坐标定位——
 * 默认在行左侧；会碰到屏幕左缘时改在行右侧（允许遮列表）；不做下边缘特殊处理 */

describe('isTruncatedWider 截断判定（原型 measureTrunc 口径）', () => {
  it('文本真实宽度 > 可见宽度 - 一个字宽 → 判定截断', () => {
    expect(isTruncatedWider(500, 300, 13)).toBe(true)
  })

  it('文本宽度恰好填满但未溢出（差值不足一个字宽）→ 判定截断（原型：保留至少一个字符）', () => {
    expect(isTruncatedWider(295, 300, 13)).toBe(true)
  })

  it('文本宽度明显小于可见宽度 → 不截断', () => {
    expect(isTruncatedWider(120, 300, 13)).toBe(false)
    expect(isTruncatedWider(286, 300, 13)).toBe(false)
  })
})

describe('placeBubbleScreen 屏幕坐标定位（左缘碰撞→右侧翻转；逐窗独立判定）', () => {
  const BUBBLE_W = 320
  const ROW = { left: 400, top: 100, right: 720, bottom: 136 } // 行屏幕矩形（高 36）

  it('左侧放得下 → 气泡右缘距行左缘 14px，垂直居中对齐行', () => {
    const g = placeBubbleScreen(ROW, BUBBLE_W)
    expect(g.side).toBe('left')
    expect(g.x).toBe(400 - 14 - BUBBLE_W) // 66
    expect(g.y).toBe(100 + 18 - 80) // 行中心 - 气泡半高（暂按 160 高窗）
  })

  it('会碰到屏幕左缘 → 翻转到行右侧（允许遮挡列表），箭头指向行左侧', () => {
    const nearEdge = { left: 100, top: 100, right: 420, bottom: 136 }
    const g = placeBubbleScreen(nearEdge, BUBBLE_W)
    expect(g.side).toBe('right')
    expect(g.x).toBe(420 + 14) // 行右缘 + 14
  })

  it('翻转判定逐窗独立：同一屏上快捷窗口行翻转、待办窗口行保持左侧', () => {
    const quickRow = { left: 60, top: 100, right: 380, bottom: 136 } // 快捷窗靠左缘
    const todoRow = { left: 700, top: 100, right: 1020, bottom: 136 } // 待办窗居中
    expect(placeBubbleScreen(quickRow, BUBBLE_W).side).toBe('right')
    expect(placeBubbleScreen(todoRow, BUBBLE_W).side).toBe('left')
  })

  it('边界逐像素一致：≥8 左弹、<8 右翻', () => {
    // 行左缘 330：1920 宽屏左侧放得下（330-14-320=-4 <8 → 其实也翻转！边界必须一致）
    const row = { left: 342, top: 100, right: 660, bottom: 136 }
    expect(placeBubbleScreen(row, BUBBLE_W).side).toBe('left') // 342-14-320=8 ≥8
    expect(placeBubbleScreen({ ...row, left: 341, right: 659 }, BUBBLE_W).side).toBe('right') // 7 <8
  })
})

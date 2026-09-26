import { describe, it, expect } from 'vitest'
import { isTruncatedWider, placeBubbleLeft } from '../../src/components/content-bubble'

/** 三轮反馈（8.2-4）：气泡照原型 #gbubble 重做——只有确实截断才弹、位置固定在行左侧不遮列表 */

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

describe('placeBubbleLeft 行左侧定位（用户定稿：只弹行左侧，不遮待办列表，屏内钳制）', () => {
  const ROW = { left: 400, top: 100, height: 36 }

  it('常规：气泡右缘距行左缘 14px，垂直居中对齐行，箭头指向行中心', () => {
    const g = placeBubbleLeft(ROW, 200, 60, 1080)
    expect(g.x).toBe(400 - 200 - 14) // 186
    expect(g.y).toBe(100 + 18 - 30) // 垂直居中
    expect(g.arrowTop).toBe(24) // 行中心在气泡内偏移-6（箭头半高）
    // 不遮列表：气泡右缘 < 行左缘
    expect(g.x + 200).toBeLessThanOrEqual(ROW.left)
  })

  it('行贴近屏幕左缘：气泡钳制在 8px 边距内，不越屏', () => {
    const g = placeBubbleLeft({ left: 100, top: 100, height: 36 }, 200, 60, 1080)
    expect(g.x).toBe(8)
    expect(g.y).toBe(100 + 18 - 30)
  })

  it('行贴近屏幕顶部：垂直位置钳制 8px', () => {
    const g = placeBubbleLeft({ left: 400, top: 4, height: 36 }, 200, 60, 1080)
    expect(g.y).toBe(8)
  })

  it('行贴近屏幕底部：气泡底缘不越屏', () => {
    const g = placeBubbleLeft({ left: 400, top: 1040, height: 36 }, 200, 60, 1080)
    expect(g.y).toBe(1080 - 60 - 8)
  })
})

import { describe, it, expect } from 'vitest'
import { hitTestPanels, type Rect } from '../../src/core/utils/hit-test'

/** 三面板示意布局：快(0,0,260,520) 主(276,0,320,560) 已完成(612,0,260,520)，缝 16 */
const RECTS: Rect[] = [
  { x: 0, y: 0, width: 260, height: 520 },
  { x: 276, y: 0, width: 320, height: 560 },
  { x: 612, y: 0, width: 260, height: 520 }
]

/** T14 缝隙点击穿透命中检测（开发计划 §4-T14，附录 A7：基于面板外接矩形） */
describe('hitTestPanels 矩形命中检测', () => {
  it('面板内部 → panel', () => {
    expect(hitTestPanels(RECTS, { x: 10, y: 10 })).toBe('panel')
    expect(hitTestPanels(RECTS, { x: 276, y: 0 })).toBe('panel') // 左上角像素
    expect(hitTestPanels(RECTS, { x: 871, y: 519 })).toBe('panel') // 右面板右下
  })

  it('面板间缝隙 → gap', () => {
    expect(hitTestPanels(RECTS, { x: 265, y: 300 })).toBe('gap') // 快↔主 缝
    expect(hitTestPanels(RECTS, { x: 600, y: 300 })).toBe('gap') // 主↔已完成 缝
  })

  it('主窗更高造成的下方空隙 → gap', () => {
    expect(hitTestPanels(RECTS, { x: 100, y: 530 })).toBe('gap')
  })

  it('簇外区域 → gap（整窗透明区，鼠标事件穿透到桌面）', () => {
    expect(hitTestPanels(RECTS, { x: 900, y: 600 })).toBe('gap')
    expect(hitTestPanels(RECTS, { x: -5, y: -5 })).toBe('gap')
  })

  it('空矩形集合 → 恒 gap', () => {
    expect(hitTestPanels([], { x: 100, y: 100 })).toBe('gap')
  })

  it('边界值：右/下边界像素属于面板（width/height 为尺寸而非右下角坐标）', () => {
    expect(hitTestPanels(RECTS, { x: 260, y: 0 })).toBe('panel') // x+width-1=259 内，260 已出 → 属于缝
  })
})

describe('单面板/双面板组合（面板开关变化）', () => {
  it('仅主窗', () => {
    const only = [RECTS[1]]
    expect(hitTestPanels(only, { x: 300, y: 100 })).toBe('panel')
    expect(hitTestPanels(only, { x: 100, y: 100 })).toBe('gap')
  })
})

import { describe, it, expect } from 'vitest'
import {
  BASE_PANEL,
  BASE_GAP,
  clusterBaseWidth,
  clusterBounds,
  effectiveClusterScale,
  anchoredMainX
} from '../../src/core/utils/cluster-layout'
import { MIN_SCALE } from '../../src/core/constants'

/** 1920x1080 主屏工作区（可用高 1040，半屏 520） */
const WA = { x: 0, y: 40, width: 1920, height: 1040 }
const ALL = { quickVisible: true, doneVisible: true }

/**
 * B2 布局基准（决策#4/#18/#20，原型 v3.1）：
 * 主窗 470×640、快捷添加/已完成 310×640、间隙 6px、顶边对齐；
 * 主进程窗口 bounds 与渲染层 cluster zoom 以本模块为单一来源（1:1 同步，决策#7）。
 */
describe('BASE_PANEL / BASE_GAP 基准常量', () => {
  it('主窗 470、两侧面板 310（决策#18：done=310）、簇高 640、间隙 6px（决策#20）', () => {
    expect(BASE_PANEL).toEqual({ quick: 310, done: 310, main: 470, height: 640 })
    expect(BASE_GAP).toBe(6)
  })
})

describe('clusterBaseWidth 簇基准宽', () => {
  it('全开：470+310+310+6×2 = 1102', () => {
    expect(clusterBaseWidth(ALL)).toBe(1102)
  })

  it('单侧开：470+310+6 = 786；全关：470', () => {
    expect(clusterBaseWidth({ quickVisible: true, doneVisible: false })).toBe(786)
    expect(clusterBaseWidth({ quickVisible: false, doneVisible: true })).toBe(786)
    expect(clusterBaseWidth({ quickVisible: false, doneVisible: false })).toBe(470)
  })
})

describe('clusterBounds 簇尺寸', () => {
  it('全开 scale=1 → 1102×640', () => {
    expect(clusterBounds(1, ALL)).toEqual({ width: 1102, height: 640 })
  })

  it('随面板开关变化', () => {
    expect(clusterBounds(1, { quickVisible: true, doneVisible: false }).width).toBe(786)
    expect(clusterBounds(1, { quickVisible: false, doneVisible: false })).toEqual({ width: 470, height: 640 })
  })

  it('等比缩放（四舍五入）', () => {
    expect(clusterBounds(0.8, ALL)).toEqual({
      width: Math.round(1102 * 0.8),
      height: Math.round(640 * 0.8)
    })
  })
})

describe('anchoredMainX 展开锚定（第二轮反馈：以待办窗口为中心向两边展开）', () => {
  const ALL = { quickVisible: true, doneVisible: true }

  it('打开快捷面板：窗口 x 左移 316×scale，主窗面板原地不动', () => {
    // 之前无快捷面板（offset 0），现在 offset=316 → x = 100 - 316×0.8
    expect(anchoredMainX(100, { quickVisible: false, doneVisible: false }, { quickVisible: true, doneVisible: false }, 0.8)).toBe(
      100 - (BASE_PANEL.quick + BASE_GAP) * 0.8
    )
  })

  it('关闭快捷面板：窗口 x 右移，主窗面板回到原位', () => {
    expect(anchoredMainX(100, ALL, { quickVisible: false, doneVisible: true }, 1)).toBe(100 + 316)
  })

  it('仅切换已完成面板：主窗不动，x 不变', () => {
    expect(anchoredMainX(100, { quickVisible: true, doneVisible: false }, { quickVisible: true, doneVisible: true }, 1)).toBe(100)
    expect(anchoredMainX(100, { quickVisible: false, doneVisible: true }, { quickVisible: false, doneVisible: false }, 1)).toBe(100)
  })

  it('缩放变化但面板开关不变：x 不变（缩放由左缘锚定）', () => {
    // anchoredMainX 不感知缩放变化本身（scale 作为参数只影响偏移量计算）
    expect(anchoredMainX(100, ALL, ALL, 0.7)).toBe(100)
  })
})

describe('effectiveClusterScale 初始/有效缩放（决策#23）', () => {
  it('矮屏按半屏钳制：1080p 可用高 1040 → 半屏 520/640 ≈ 0.8125，存值 1 也被钳制', () => {
    expect(effectiveClusterScale(1, ALL, WA)).toBeCloseTo(520 / 640, 6)
  })

  it('高分辨率大屏：不放大也不缩小，原值返回', () => {
    const big = { x: 0, y: 0, width: 3840, height: 2100 }
    expect(effectiveClusterScale(1, ALL, big)).toBe(1)
  })

  it('低于 MIN_SCALE 的存值 → MIN_SCALE 兜底', () => {
    expect(effectiveClusterScale(0.2, ALL, WA)).toBe(MIN_SCALE)
    expect(MIN_SCALE).toBe(0.7)
  })

  it('宽度先触顶：窄屏按屏宽钳制', () => {
    const narrow = { x: 0, y: 0, width: 800, height: 2100 }
    expect(effectiveClusterScale(1, ALL, narrow)).toBeCloseTo(800 / 1102, 6)
  })
})

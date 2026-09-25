import { describe, it, expect } from 'vitest'
import {
  BASE_PANEL,
  BASE_GAP,
  clusterBaseWidth,
  clusterBounds,
  effectiveClusterScale,
  clampChildGroupScale
} from '../../src/core/utils/cluster-layout'
import { MIN_SCALE } from '../../src/core/constants'

/** 1920x1080 主屏工作区（可用高 1040，半屏 520） */
const WA = { x: 0, y: 40, width: 1920, height: 1040 }

/**
 * B2 布局基准（决策#4/#18/#20 + 第二轮反馈裁定）：
 * 组件恒定三段槽位——快捷添加(-316)/待办主窗(0,0 居中锚)/已完成(+476)，
 * 面板开关只做槽位内显隐，**不再改变窗口几何**（主窗屏幕位置恒定，零残影）。
 */
describe('BASE_PANEL / BASE_GAP 基准常量', () => {
  it('主窗 470、两侧面板 310（决策#18）、簇高 640、间隙 6px（决策#20）', () => {
    expect(BASE_PANEL).toEqual({ quick: 310, done: 310, main: 470, height: 640 })
    expect(BASE_GAP).toBe(6)
  })
})

describe('clusterBaseWidth 恒定簇基准宽（不再随面板开关变化）', () => {
  it('恒为全开宽：470+310+310+6×2 = 1102（两侧槽位恒定留位）', () => {
    expect(clusterBaseWidth()).toBe(1102)
  })
})

describe('clusterBounds 恒定簇尺寸（不含面板开关维度）', () => {
  it('scale=1 → 1102×640', () => {
    expect(clusterBounds(1)).toEqual({ width: 1102, height: 640 })
  })

  it('等比缩放（四舍五入）', () => {
    expect(clusterBounds(0.8)).toEqual({
      width: Math.round(1102 * 0.8),
      height: Math.round(640 * 0.8)
    })
  })
})

describe('effectiveClusterScale 初始/有效缩放（决策#23）', () => {
  it('矮屏按半屏钳制：1080p 可用高 1040 → 半屏 520/640 ≈ 0.8125，存值 1 也被钳制', () => {
    expect(effectiveClusterScale(1, WA)).toBeCloseTo(520 / 640, 6)
  })

  it('高分辨率大屏：不放大也不缩小，原值返回', () => {
    const big = { x: 0, y: 0, width: 3840, height: 2100 }
    expect(effectiveClusterScale(1, big)).toBe(1)
  })

  it('低于 MIN_SCALE 的存值 → MIN_SCALE 兜底', () => {
    expect(effectiveClusterScale(0.2, WA)).toBe(MIN_SCALE)
    expect(MIN_SCALE).toBe(0.7)
  })

  it('宽度先触顶：窄屏按屏宽钳制', () => {
    const narrow = { x: 0, y: 0, width: 800, height: 2100 }
    expect(effectiveClusterScale(1, narrow)).toBeCloseTo(800 / 1102, 6)
  })
})

/**
 * 二级窗口组缩放（照原型 setGroupScale 一模一样的规则，第二轮反馈裁定）：
 * 上限 = min(1.6, (屏宽-24)/基准宽, (屏高-24)/基准高)；下限 0.7；步进 0.05。
 * 内容流式 reflow，无 zoom。
 */
describe('clampChildGroupScale 原型组缩放规则', () => {
  it('范围内原值返回', () => {
    const wa = { x: 0, y: 0, width: 1920, height: 1040 }
    expect(clampChildGroupScale(1.1, 400, 430, wa)).toBe(1.1)
  })

  it('上限 1.6 倍', () => {
    const big = { x: 0, y: 0, width: 4000, height: 3000 }
    expect(clampChildGroupScale(1.8, 400, 430, big)).toBe(1.6)
  })

  it('屏幕放不下时按 (屏-24)/基准 钳制', () => {
    const wa = { x: 0, y: 0, width: 1000, height: 1040 }
    // (1000-24)/400 = 2.44；(1040-24)/430 = 2.362 → 高度是有效上限
    expect(clampChildGroupScale(2.5, 400, 430, wa)).toBeCloseTo((1040 - 24) / 430, 6)
  })

  it('下限 0.7 兜底', () => {
    const wa = { x: 0, y: 0, width: 1920, height: 1040 }
    expect(clampChildGroupScale(0.2, 400, 430, wa)).toBe(0.7)
  })

  it('步进 0.05（原型 round(v*20)/20）', () => {
    const wa = { x: 0, y: 0, width: 1920, height: 1040 }
    expect(clampChildGroupScale(1.132, 400, 430, wa)).toBe(1.15)
  })
})

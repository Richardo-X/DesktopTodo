import { describe, it, expect } from 'vitest'
import { clampPosToWorkArea, ensureOnSomeDisplay, type DisplayArea } from '../../src/core/utils/screen-clamp'

const WA: DisplayArea = { x: 0, y: 40, width: 1920, height: 1040 }
const B = { width: 400, height: 300 }

/** T19 分辨率/显示器变化 → 组件回到可见范围（PRD §10-40） */
describe('clampPosToWorkArea', () => {
  it('正常范围内原值返回', () => {
    expect(clampPosToWorkArea({ x: 100, y: 100 }, B, WA)).toEqual({ x: 100, y: 100 })
  })

  it('越界右侧/下方 → 拉回可见范围', () => {
    expect(clampPosToWorkArea({ x: 2000, y: 100 }, B, WA)).toEqual({ x: WA.width - B.width, y: 100 })
    expect(clampPosToWorkArea({ x: 100, y: 1200 }, B, WA)).toEqual({ x: 100, y: WA.y + WA.height - B.height })
  })

  it('越界左侧/上方 → 拉回', () => {
    expect(clampPosToWorkArea({ x: -50, y: 100 }, B, WA)).toEqual({ x: 0, y: 100 })
    expect(clampPosToWorkArea({ x: 100, y: 0 }, B, WA)).toEqual({ x: 100, y: WA.y })
  })

  it('窗口比工作区大 → 钉在工作区原点', () => {
    const big = { width: 3000, height: 2000 }
    expect(clampPosToWorkArea({ x: 500, y: 500 }, big, WA)).toEqual({ x: WA.x, y: WA.y })
  })
})

describe('ensureOnSomeDisplay', () => {
  const primary: DisplayArea = { x: 0, y: 40, width: 1920, height: 1040 }
  const secondary: DisplayArea = { x: 1920, y: 0, width: 1080, height: 800 }

  it('位置在某显示器内 → 原样返回', () => {
    expect(ensureOnSomeDisplay({ x: 100, y: 100 }, B, [primary, secondary])).toEqual({ x: 100, y: 100 })
  })

  it('位置不在任何显示器（拔掉显示器）→ clamp 到主屏', () => {
    const r = ensureOnSomeDisplay({ x: 5000, y: 100 }, B, [primary, secondary])
    expect(r.x).toBeLessThanOrEqual(primary.width - B.width)
    expect(r.y).toBeGreaterThanOrEqual(primary.y)
  })

  it('位置在副屏（部分可见）→ 在副屏范围内 clamp', () => {
    const r = ensureOnSomeDisplay({ x: 2950, y: 50 }, B, [primary, secondary])
    expect(r.x).toBe(1920 + 1080 - B.width)
  })
})

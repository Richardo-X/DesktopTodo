import { describe, it, expect } from 'vitest'
import { CHILD_SIZES, GROUP_OF, childWindowOptions, type ChildKind } from '../../electron/main/child-windows'

const WA = { x: 0, y: 40, width: 1920, height: 1040 }

/** B3（决策#5/#14/#21）+ 二轮反馈（照原型组缩放规则） */
describe('CHILD_SIZES 基准尺寸与分组', () => {
  it('7 类基准尺寸（新建/编辑 4 窗统一 3:4=420×560，用户 2026-10-14 裁定；回收站已移除）', () => {
    expect(CHILD_SIZES['todo-new']).toEqual({ w: 420, h: 400 })
    expect(CHILD_SIZES['todo-edit']).toEqual({ w: 420, h: 388 })
    expect(CHILD_SIZES['template-new']).toEqual({ w: 420, h: 428 })
    expect(CHILD_SIZES['template-edit']).toEqual({ w: 420, h: 392 })
    expect(CHILD_SIZES.detail).toEqual({ w: 415, h: 490 })
    expect(CHILD_SIZES.history).toEqual({ w: 645, h: 620 })
    expect(CHILD_SIZES.settings).toEqual({ w: 460, h: 540 })
    expect(Object.keys(CHILD_SIZES)).toHaveLength(8) // 7 类用户子窗口 + bubble（四轮独立气泡窗，非 openChild 通道）
    expect('recycle' in CHILD_SIZES).toBe(false)
  })

  it('GROUP_OF 组映射：事项/模板/历史/设置（detail 归事项组）', () => {
    expect(GROUP_OF['todo-new']).toBe('todo')
    expect(GROUP_OF['todo-edit']).toBe('todo')
    expect(GROUP_OF.detail).toBe('todo')
    expect(GROUP_OF['template-new']).toBe('template')
    expect(GROUP_OF['template-edit']).toBe('template')
    expect(GROUP_OF.history).toBe('history')
    expect(GROUP_OF.settings).toBe('settings')
  })
})

/** T36 子窗口管理：默认尺寸/半屏高度上限/居中级联位置/位置不记忆 */
describe('childWindowOptions', () => {
  it('各子窗口有默认尺寸，创建于工作区居中', () => {
    const o = childWindowOptions('todo-new', WA, 0)
    expect(o.width).toBe(CHILD_SIZES['todo-new'].w)
    expect(o.height).toBe(CHILD_SIZES['todo-new'].h)
    expect(o.x).toBe(Math.round((WA.width - o.width) / 2))
    expect(o.y).toBe(WA.y + Math.round((WA.height - o.height) / 2))
  })

  it('高度不超过屏幕可用高-24（照原型：屏幕放不下即钳制，不再用半屏规则）', () => {
    const small = { x: 0, y: 0, width: 1200, height: 600 }
    for (const kind of Object.keys(CHILD_SIZES) as ChildKind[]) {
      const o = childWindowOptions(kind, small, 0)
      expect(o.height).toBeLessThanOrEqual(small.height - 24)
      expect(o.width).toBeLessThanOrEqual(small.width - 24)
    }
  })

  it('级联偏移：第 N 个打开的窗口向右下错开（位置不记忆，每次打开重算）', () => {
    const a = childWindowOptions('settings', WA, 0)
    const b = childWindowOptions('settings', WA, 1)
    expect(b.x).toBeGreaterThan(a.x)
    expect(b.y).toBeGreaterThan(a.y)
  })

  it('正常屏幕下高度不放大（工作区半屏 ≥ 窗口基准高）', () => {
    // 历史窗基准高 620，需半屏 ≥ 620 的屏幕（可用高 ≥1240）
    const tall = { x: 0, y: 40, width: 1920, height: 1280 }
    const o = childWindowOptions('history', tall, 0)
    expect(o.height).toBe(CHILD_SIZES['history'].h)
  })

  it('B3 组缩放：尺寸 = round(基准 × 组缩放)，屏幕放不下按 -24 钳制（照原型）', () => {
    const o = childWindowOptions('todo-new', WA, 0, 1.2)
    expect(o.width).toBe(Math.round(420 * 1.2))
    expect(o.height).toBe(Math.round(400 * 1.2))

    const small = { x: 0, y: 0, width: 700, height: 600 }
    const o2 = childWindowOptions('todo-new', small, 0, 2)
    expect(o2.width).toBe(676) // min(840, 700-24)
    expect(o2.height).toBe(576) // min(1120, 600-24)
  })

  it('B3 组缩放缺省为 1（既有调用兼容；矮屏按 -24 钳制）', () => {
    const tall = { x: 0, y: 40, width: 1920, height: 1280 }
    const o = childWindowOptions('history', tall, 0)
    expect(o.width).toBe(645)
    expect(o.height).toBe(620)

    const oShort = childWindowOptions('history', WA, 0)
    expect(oShort.height).toBe(620) // min(620, 1040-24) → 不钳
  })
})

import { describe, it, expect } from 'vitest'
import { CHILD_SIZES, GROUP_MAX, GROUP_OF, childWindowOptions, type ChildKind } from '../../electron/main/child-windows'

const WA = { x: 0, y: 40, width: 1920, height: 1040 }

/** B3（决策#5/#14/#21）：二级窗口原型基准尺寸、组映射、组缩放 */
describe('CHILD_SIZES 基准尺寸与分组', () => {
  it('7 类原型基准尺寸（回收站已移除；编辑待办/详情经 #14 校准）', () => {
    expect(CHILD_SIZES['todo-new']).toEqual({ w: 360, h: 360 })
    expect(CHILD_SIZES['todo-edit']).toEqual({ w: 400, h: 430 })
    expect(CHILD_SIZES['template-new']).toEqual({ w: 360, h: 360 })
    expect(CHILD_SIZES['template-edit']).toEqual({ w: 360, h: 380 })
    expect(CHILD_SIZES.detail).toEqual({ w: 360, h: 430 })
    expect(CHILD_SIZES.history).toEqual({ w: 560, h: 540 })
    expect(CHILD_SIZES.settings).toEqual({ w: 400, h: 470 })
    expect(Object.keys(CHILD_SIZES)).toHaveLength(7)
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

  it('GROUP_MAX：组内最大基准（组缩放钳制基准）', () => {
    expect(GROUP_MAX.todo).toEqual({ w: 400, h: 430 })
    expect(GROUP_MAX.template).toEqual({ w: 360, h: 380 })
    expect(GROUP_MAX.history).toEqual({ w: 560, h: 540 })
    expect(GROUP_MAX.settings).toEqual({ w: 400, h: 470 })
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

  it('高度不超过屏幕高度一半（速查 #7 适用于所有窗口）', () => {
    const small = { x: 0, y: 0, width: 1200, height: 600 }
    for (const kind of Object.keys(CHILD_SIZES) as ChildKind[]) {
      const o = childWindowOptions(kind, small, 0)
      expect(o.height).toBeLessThanOrEqual(Math.floor(small.height / 2))
      expect(o.width).toBeLessThanOrEqual(small.width)
    }
  })

  it('级联偏移：第 N 个打开的窗口向右下错开（位置不记忆，每次打开重算）', () => {
    const a = childWindowOptions('settings', WA, 0)
    const b = childWindowOptions('settings', WA, 1)
    expect(b.x).toBeGreaterThan(a.x)
    expect(b.y).toBeGreaterThan(a.y)
  })

  it('正常屏幕下高度不放大', () => {
    const o = childWindowOptions('history', WA, 0)
    expect(o.height).toBe(CHILD_SIZES['history'].h)
  })

  it('B3 组缩放：尺寸 = round(基准 × 组缩放)，仍钳制屏宽/半屏高', () => {
    const o = childWindowOptions('todo-new', WA, 0, 1.2)
    expect(o.width).toBe(Math.round(360 * 1.2))
    expect(o.height).toBe(Math.round(360 * 1.2))

    const small = { x: 0, y: 0, width: 700, height: 600 }
    const o2 = childWindowOptions('todo-new', small, 0, 2)
    expect(o2.width).toBe(680) // min(720, 700-20)
    expect(o2.height).toBe(300) // min(720, 600/2)
  })

  it('B3 组缩放缺省为 1（既有调用兼容）', () => {
    const o = childWindowOptions('history', WA, 0)
    expect(o.width).toBe(560)
    expect(o.height).toBe(540)
  })
})

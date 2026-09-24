import { describe, it, expect } from 'vitest'
import { CHILD_SIZES, childWindowOptions, type ChildKind } from '../../electron/main/child-windows'

const WA = { x: 0, y: 40, width: 1920, height: 1040 }

/** B1.5（决策#21）：回收站子窗口移除——CHILD_SIZES 恰为 7 类 */
describe('CHILD_SIZES 类别集合', () => {
  it('不含 recycle，恰为 7 类', () => {
    expect(Object.keys(CHILD_SIZES)).not.toContain('recycle')
    expect(Object.keys(CHILD_SIZES)).toHaveLength(7)
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
})

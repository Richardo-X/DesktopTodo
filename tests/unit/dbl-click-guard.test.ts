import { describe, it, expect } from 'vitest'
import { createDblClickGuard } from '../../src/components/useDblClickGuard'

/** 三轮反馈（8.2-9）：连点勾选框时第二击常偏出按钮落到行上被合成为行双击——
 * 点击勾选框后的保护窗内必须忽略行双击 */
describe('createDblClickGuard 连点保护窗', () => {
  it('mark 后保护窗内 blocked()=true，窗外= false', () => {
    let t = 1000
    const guard = createDblClickGuard(450, () => t)

    expect(guard.blocked()).toBe(false) // 从未 mark
    guard.mark()
    expect(guard.blocked()).toBe(true) // 窗口内

    t += 449
    expect(guard.blocked()).toBe(true)
    t += 2
    expect(guard.blocked()).toBe(false) // 450ms 后解除
  })

  it('再次 mark 刷新保护窗起点', () => {
    let t = 0
    const guard = createDblClickGuard(450, () => t)
    guard.mark()
    t += 300
    guard.mark() // 第二次点击
    t += 300 // 距第二次 mark 仅 300ms
    expect(guard.blocked()).toBe(true)
    t += 200
    expect(guard.blocked()).toBe(false)
  })

  it('默认实现基于真实时钟（Date.now）', () => {
    const guard = createDblClickGuard()
    guard.mark()
    expect(guard.blocked()).toBe(true)
  })
})

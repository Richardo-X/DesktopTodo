import { describe, it, expect } from 'vitest'

// M0-T02 基础设施冒烟测试：验证 Vitest 测试链路可用
describe('smoke/unit', () => {
  it('测试运行器与断言可用', () => {
    expect(1 + 1).toBe(2)
  })

  it('TypeScript strict 模式下模块导入可用', async () => {
    const mod = await import('../../src/core/interfaces/clock')
    expect(new mod.SystemClock().now()).toBeInstanceOf(Date)
  })
})

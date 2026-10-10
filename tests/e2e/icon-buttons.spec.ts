import { test, expect } from '@playwright/test'
import { launchApp, dateKeyOffset } from './helpers'
import { createTodoItem } from '../../src/core/models'

/** 批次 B-4（#35 定稿）：⚡/☑/＋ 全部方形按钮 32×32（取代 30/36 之争；zoom 亚像素容差 ±0.5） */
test('操作区三枚图标按钮统一 32×32', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  const sizes = await h.main.evaluate(() =>
    (['op-quick-toggle', 'op-done-toggle', 'op-new'] as const).map((tid) => {
      const cs = getComputedStyle(document.querySelector(`[data-testid="${tid}"]`) as Element)
      return { tid, w: cs.width, h: cs.height }
    })
  )
  for (const s of sizes) {
    expect(Math.abs(parseFloat(s.w) - 32), `${s.tid} width=${s.w}`).toBeLessThanOrEqual(0.5)
    expect(Math.abs(parseFloat(s.h) - 32), `${s.tid} height=${s.h}`).toBeLessThanOrEqual(0.5)
  }
  await h.close()
})

/** L1.5 规格统一（用户反馈：同款按钮不要一个窗口一个尺寸）：
 * 图标按钮 32×32（全窗单一规格）/ 小按钮 26px（主窗=快捷窗=二级窗 .b=批量条）/ 勾选框 20×20。 */
test('L1.5：同款按钮跨窗同规格（图标 32 / 小按钮 26 / 勾选框 20）', async () => {
  const h = await launchApp({
    seed: {
      todos: [createTodoItem({ content: '待办甲', now: new Date(), id: 't1' })],
      completed: [{ ...createTodoItem({ content: '已完成甲', now: new Date(), id: 'd1' }), completedAt: new Date().toISOString() }],
      // 历史窗列表取存档且默认定位「昨天」——供 .b/勾选框规格核对
      archive: {
        [dateKeyOffset(-1)]: [{ ...createTodoItem({ content: '存档甲', now: new Date(), id: 'a1' }), completedAt: new Date().toISOString() }]
      }
    }
  })
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.done.waitForSelector('[data-testid="done-panel"]')
  await h.quick.waitForSelector('[data-testid="quick-panel"]')
  await h.main.waitForTimeout(200)

  const sizeOf = (page: typeof h.main, sel: string) =>
    page.evaluate((s) => {
      const el = document.querySelector(s) as HTMLElement | null
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { w: r.width, h: r.height }
    }, sel)

  // 图标按钮：主窗三枚 32（既有用例）+ 快捷窗 ＋ + 已完成窗 排序 = 同一规格
  const quickNew = (await sizeOf(h.quick, '[data-testid="quick-new"]'))!
  const doneSort = (await sizeOf(h.done, '[data-testid="done-sort"]'))!
  const mainIcon = (await sizeOf(h.main, '[data-testid="op-new"]'))!
  expect(Math.abs(quickNew.w - mainIcon.w)).toBeLessThanOrEqual(0.6)
  expect(Math.abs(quickNew.h - mainIcon.h)).toBeLessThanOrEqual(0.6)
  expect(Math.abs(doneSort.w - mainIcon.w)).toBeLessThanOrEqual(0.6)
  expect(Math.abs(doneSort.h - mainIcon.h)).toBeLessThanOrEqual(0.6)

  // 簇窗有 zoom（按住 32px 图标按钮反推），子窗无 zoom——统一折算成设计像素再跨窗比较
  const z = mainIcon.w / 32
  const dp = (v: number): number => v / z

  // 小按钮（批量删除）：主窗 = 快捷窗 = 历史窗 .b（原主窗 30 高、其余 26 —— 用户反馈的孤例）
  const mainBatch = (await sizeOf(h.main, '[data-testid="op-batch"]'))!
  const quickBatch = (await sizeOf(h.quick, '[data-testid="quick-batch"]'))!
  expect(Math.abs(dp(mainBatch.h) - dp(quickBatch.h))).toBeLessThanOrEqual(0.7)

  // 勾选框：主窗 = 已完成窗
  const mainCb = (await sizeOf(h.main, '[data-testid="row-checkbox"]'))!
  const doneCb = (await sizeOf(h.done, '[data-testid="done-check"]'))!
  expect(Math.abs(dp(mainCb.w) - dp(doneCb.w))).toBeLessThanOrEqual(0.7)
  expect(Math.abs(dp(mainCb.h) - dp(doneCb.h))).toBeLessThanOrEqual(0.7)

  // 历史窗（.b 小按钮 + 20px 勾选框，原 19px 孤例）——开窗 → 进批量 → 量勾选框
  const hp = h.app.waitForEvent('window')
  await h.done.click('[data-testid="done-history"]')
  const hist = await hp
  await hist.waitForSelector('[data-testid="hist-batch"]')
  const histBatchBtn = (await sizeOf(hist as never, '[data-testid="hist-batch"]'))!
  expect(Math.abs(histBatchBtn.h - dp(mainBatch.h))).toBeLessThanOrEqual(0.7)
  await hist.click('[data-testid="hist-batch"]')
  await hist.waitForTimeout(200)
  const histCb = await hist.evaluate(() => {
    const el = document.querySelector('.hist-row .checkbox') as HTMLElement | null
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { w: r.width, h: r.height }
  })
  expect(histCb).not.toBeNull()
  expect(Math.abs(histCb!.w - dp(mainCb.w))).toBeLessThanOrEqual(0.7)
  expect(Math.abs(histCb!.h - dp(mainCb.h))).toBeLessThanOrEqual(0.7)

  await h.close()
})

import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

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

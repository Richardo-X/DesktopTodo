import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 四轮第0条（定稿修订）：⚡/☑/＋ 统一正方形；36px 在小屏挤压满载列表→按用户取舍回退 30×30 */
test('操作区三枚图标按钮统一 36×36', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  const sizes = await h.main.evaluate(() =>
    (['op-quick-toggle', 'op-done-toggle', 'op-new'] as const).map((tid) => {
      const cs = getComputedStyle(document.querySelector(`[data-testid="${tid}"]`) as Element)
      return { tid, w: cs.width, h: cs.height }
    })
  )
  for (const s of sizes) {
    expect(Math.abs(parseFloat(s.w) - 30), `${s.tid} width=${s.w}`).toBeLessThanOrEqual(0.5) // zoom 亚像素容差
    expect(Math.abs(parseFloat(s.h) - 30), `${s.tid} height=${s.h}`).toBeLessThanOrEqual(0.5)
  }
  await h.close()
})

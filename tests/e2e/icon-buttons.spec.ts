import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 四轮第0条：⚡/☑/＋ 三枚图标按钮统一 36×36 正方形 */
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
    expect(s.w, `${s.tid} width`).toBe('36px')
    expect(s.h, `${s.tid} height`).toBe('36px')
  }
  await h.close()
})

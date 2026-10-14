import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 快捷窗画布恒定（缩放抖动根治，方案《技术手册-快捷窗缩放修复-移植Electron版》§4-1/2/3）：
 * ① 缩放档位变化：快捷窗 getBounds 完全不动（宽/高/x/y 恒定），主窗照常缩放（证明档位真变了）；
 * ② 锚点平移：画布只平移（x/y 随锚点、宽高不变）；
 * ③ 渲染层：卡面走 transform（有 matrix、无 zoom），视觉宽=310×k。
 * 缩放经 test:cluster-scale 钩子走真实提交入口（syncClusterBounds）。
 * 探针档位按工作区上限自适应（与 clampClusterScale 同公式）：有效值=min(探针, 上限)。 */

interface CanvasState {
  quickBounds: { x: number; y: number; width: number; height: number }
  mainBounds: { x: number; y: number; width: number; height: number }
}

test('快捷窗画布恒定：档位变化 getBounds 不动、锚点平移只平移、卡面 transform', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(300)

  // 工作区上限（与 src/core/utils/scale.ts clampClusterScale 同公式；全开宽 1098、高 640）
  const cap = await h.app.evaluate(({ screen }) => {
    const wa = screen.getPrimaryDisplay().workArea
    return Math.max(0.7, Math.min((wa.height * 0.5) / 640, wa.width / 1098))
  })

  const st = (): Promise<CanvasState> =>
    h.main.evaluate(() =>
      (window as unknown as { desktopTodoTest: { clusterState(): Promise<CanvasState> } }).desktopTodoTest.clusterState()
    )
  const setScale = (s: number): Promise<boolean> =>
    h.main.evaluate(
      (v) =>
        (window as unknown as { desktopTodoTest: { clusterScale(s: number): Promise<boolean> } }).desktopTodoTest.clusterScale(v),
      s
    )

  // 主窗宽=round(470×k)±1（Windows 取整）；快捷窗矩形断言保持严格恒等
  const mainWNear = (s: number) =>
    expect.poll(async () => (await st()).mainBounds.width, { timeout: 5_000 }).toBeLessThanOrEqual(Math.round(470 * s) + 1)

  // 基准档 A=上限、B=0.7（下限）——两档必然可区分（cap>0.7 时主窗宽必变）
  const sA = cap
  const sB = 0.7
  await setScale(sA)
  await mainWNear(sA)
  const base = await st()

  // ① 档位变化：快捷窗矩形完全不动；主窗宽随档位变（证明档位确实切换）
  await setScale(sB)
  await expect
    .poll(async () => (await st()).mainBounds.width, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(Math.round(470 * sB) - 1)
  const atB = await st()
  expect(Math.abs(atB.mainBounds.width - Math.round(470 * sB))).toBeLessThanOrEqual(1)
  expect(atB.mainBounds.width).toBeLessThan(base.mainBounds.width - 10) // 档位确实切小了
  expect(atB.quickBounds).toEqual(base.quickBounds)

  await setScale(sA)
  await mainWNear(sA)
  expect((await st()).quickBounds).toEqual(base.quickBounds)

  // ② 锚点平移：画布只平移（x/y 随锚点、宽高不变）
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodoTest: { clusterDragDelta(dx: number, dy: number): Promise<void> } })
      .desktopTodoTest.clusterDragDelta(40, 12)
  )
  await expect
    .poll(async () => (await st()).quickBounds.x, { timeout: 5_000 })
    .toBe(base.quickBounds.x + 40)
  const moved = await st()
  expect(moved.quickBounds.width).toBe(base.quickBounds.width)
  expect(moved.quickBounds.height).toBe(base.quickBounds.height)
  expect(moved.quickBounds.y).toBe(base.quickBounds.y + 12)

  // ③ 渲染层：卡面 transform 缩放、不再走 zoom；视觉宽=310×k（rect 含 transform）
  const holder = await h.quick.evaluate(() => {
    const el = document.querySelector('[data-testid="cluster-holder"]') as HTMLElement
    const cs = getComputedStyle(el)
    return { transform: cs.transform, zoom: cs.zoom, visualW: el.getBoundingClientRect().width }
  })
  expect(holder.zoom).toBe('1') // 画布方案不再写 zoom（旧机制此处=档位值）
  expect(holder.transform).toContain('matrix')
  expect(holder.visualW).toBeCloseTo(310 * sA, 0)

  await h.close()
})

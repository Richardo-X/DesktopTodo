import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 快速缩放取证（用户 2026-10-14 指定手法：最大↔最小档间快速往返）：
 * 逐次采样快捷窗 getBounds 与"主窗左缘↔画布右缘"缝隙，输出完整序列——
 * 判定标准：缝隙序列恒定（max−min ≤ 1px，Windows 取整）、画布矩形全程零变化。
 * 驱动走真实提交路径（IPC.commit 同款：广播+syncClusterBounds），与手势捏柄同链路。 */

interface Snap {
  quick: { x: number; y: number; width: number; height: number }
  mainX: number
  mainW: number
  gap: number
  cardK: number // 渲染层卡面 transform 实际值（matrix a 分量）
}

test('快速缩放取证：最大↔最小快速往返，画布恒定、缝隙序列恒定', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.quick.waitForSelector('[data-testid="quick-panel"]')
  await h.main.waitForTimeout(300)

  // 工作区上限（与 clampClusterScale 同公式；全开宽 1098、高 640）
  const cap = await h.app.evaluate(({ screen }) => {
    const wa = screen.getPrimaryDisplay().workArea
    return Math.max(0.7, Math.min((wa.height * 0.5) / 640, wa.width / 1098))
  })

  const snap = (): Promise<Snap> =>
    h.main.evaluate(() =>
      (
        window as unknown as {
          desktopTodoTest: {
            clusterState(): Promise<{
              quickBounds: { x: number; y: number; width: number; height: number }
              mainBounds: { x: number; width: number }
            }>
          }
        }
      ).desktopTodoTest.clusterState()
    ).then(async (s) => ({
      quick: s.quickBounds,
      mainX: s.mainBounds.x,
      mainW: s.mainBounds.width,
      gap: s.mainBounds.x - (s.quickBounds.x + s.quickBounds.width),
      cardK: await h.quick.evaluate(() => {
        const m = /matrix\(([-\d.]+)/.exec(
          getComputedStyle(document.querySelector('[data-testid="cluster-holder"]') as Element).transform
        )
        return m ? Number(m[1]) : 0
      })
    }))

  const setScale = (s: number): Promise<boolean> =>
    h.main.evaluate(
      (v) =>
        (window as unknown as { desktopTodoTest: { clusterScale(s: number): Promise<boolean> } }).desktopTodoTest.clusterScale(v),
      s
    )

  // 快速往返：max↔min ×12 个来回（24 次真实提交，每次提交后立即采样）
  const samples: Snap[] = []
  for (let i = 0; i < 12; i++) {
    await setScale(cap)
    samples.push(await snap())
    await setScale(0.7)
    samples.push(await snap())
  }
  // 收尾：回到 max 档静置后再采一次（静止态）
  await setScale(cap)
  await h.main.waitForTimeout(400)
  samples.push(await snap())

  const quickRects = samples.map((s) => JSON.stringify(s.quick))
  const distinctRects = [...new Set(quickRects)]
  const gaps = samples.map((s) => s.gap)
  const gapMin = Math.min(...gaps)
  const gapMax = Math.max(...gaps)
  const mainXs = [...new Set(samples.map((s) => s.mainX))]
  const ks = samples.map((s) => s.cardK)

  console.log('=== 快速缩放取证（cap=%s）===', cap.toFixed(4))
  console.log('快捷窗画布矩形（全部采样去重）:', distinctRects.join(' | '))
  console.log('缝隙序列（主窗左缘−画布右缘，px）:', gaps.join(', '))
  console.log('缝隙极差:', gapMax - gapMin, 'px；主窗左缘去重:', mainXs.join(','))
  console.log('卡面 transform k 序列（渲染层跟随）:', ks.map((k) => k.toFixed(3)).join(', '))

  // 判定
  expect(distinctRects.length, `画布矩形出现 ${distinctRects.length} 种不同值（应恒定 1 种）`).toBe(1)
  expect(gapMax - gapMin, `缝隙极差 ${gapMax - gapMin}px（应 ≤1px 取整噪声）`).toBeLessThanOrEqual(1)
  expect(Math.abs(gaps[0] - 4), `缝隙基准值 ${gaps[0]}（应=4）`).toBeLessThanOrEqual(1)
  expect(mainXs.length, '主窗左缘应恒定').toBe(1)
  // 卡面 k 应在两端档位间振荡（内容确实在缩放）——CI 小屏 cap≈0.70 与下限重合时区间过窄，跳过
  if (cap - 0.7 > 0.06) {
    expect(Math.max(...ks) - Math.min(...ks)).toBeGreaterThan(0.05)
  }

  await h.close()
})

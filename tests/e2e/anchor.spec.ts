import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'
import { defaultAppData } from '../../src/core/models'

/** 四轮定稿 B：动态窗口——锚点=待办窗口左上角（缩放/开关面板不动）；
 * 隐藏面板不再占位（窗口宽度=可见面板并集） */

/** 等待主窗真正 show（ready-to-show 晚于 DOM ready；isVisible 才可信） */
async function waitMainVisible(h: { app: import('@playwright/test').ElectronApplication }): Promise<void> {
  await expect
    .poll(
      async () =>
        h.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible())
        ),
      { timeout: 10_000 }
    )
    .toBe(true)
}

test('开关面板：待办窗口屏幕锚点不动，窗口宽随可见面板收缩', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await waitMainVisible(h)

  const snapshot = async (): Promise<{ anchorProbe: number; quickInDom: boolean }> =>
    h.main.evaluate(() => {
      const home = document.querySelector('[data-testid="home-panel"]') as HTMLElement
      const homeRect = home.getBoundingClientRect()
      return {
        anchorProbe: Math.round(homeRect.left),
        quickInDom: document.querySelector('[data-testid="quick-panel"]') !== null
      }
    })

  // 屏幕锚点 = 窗口x + 待办面板视口偏移（含 zoom）
  const anchorOf = async (): Promise<number> => {
    const [b, probe] = await Promise.all([
      h.app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed() && win.isVisible())
        return w ? w.getBounds().x : -99999
      }),
      h.main.evaluate(() => Math.round((document.querySelector('[data-testid="home-panel"]') as HTMLElement).getBoundingClientRect().left))
    ])
    return b + probe
  }

  const anchorBefore = await anchorOf()
  expect((await snapshot()).quickInDom).toBe(true)

  await h.main.click('[data-testid="quick-close"]')
  await h.main.waitForTimeout(300)
  expect((await snapshot()).quickInDom).toBe(false)
  const anchorAfter = await anchorOf()
  expect(Math.abs(anchorAfter - anchorBefore)).toBeLessThanOrEqual(2) // 锚点不动（±2px 取整容差）

  // 窗口宽收缩为可见并集（待办+已完成：786×scale）
  const scale = await h.main.evaluate(() => {
    const home = (document.querySelector('[data-testid="home-panel"]') as HTMLElement).getBoundingClientRect()
    return home.width / 470
  })
  const winW = await h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed() && win.isVisible())
    return w!.getBounds().width
  })
  expect(Math.abs(winW - Math.round(786 * scale))).toBeLessThanOrEqual(4)
  await h.close()
})

test('重启恢复：pos 语义=待办左上角锚点（待办窗口屏幕位置=存档值）', async () => {
  const seed = defaultAppData()
  seed.uiState.pos = { x: 500, y: 200 } // 锚点=待办左上角；取屏内值避免钳制改写
  const h = await launchApp({ seed })
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await waitMainVisible(h)
  await h.main.waitForTimeout(300)

  const [b, probeX, probeY, diag] = await Promise.all([
    h.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed() && win.isVisible())
      const r = w!.getBounds()
      return { x: r.x, y: r.y, width: r.width }
    }),
    h.main.evaluate(() => Math.round((document.querySelector('[data-testid="home-panel"]') as HTMLElement).getBoundingClientRect().left)),
    h.main.evaluate(() => Math.round((document.querySelector('[data-testid="home-panel"]') as HTMLElement).getBoundingClientRect().top)),
    h.main.evaluate(() => {
      const cluster = document.querySelector('.cluster') as HTMLElement
      const quick = document.querySelector('[data-testid="quick-panel"]')
      const wa = window.screen as unknown as { availWidth: number; availHeight: number }
      return {
        clusterStyle: cluster?.getAttribute('style') ?? 'none',
        quickLeft: quick ? Math.round(quick.getBoundingClientRect().left) : -1,
        quickW: quick ? Math.round(quick.getBoundingClientRect().width) : -1,
        availW: wa.availWidth,
        availH: wa.availHeight
      }
    })
  ])
  const dx = Math.abs(b.x + probeX - 500)
  console.log(`ANCHOR-DIAG b=${JSON.stringify(b)} probeX=${probeX} probeY=${probeY} diag=${JSON.stringify(diag)}`)
  expect(dx, `ANCHOR-DIAG b=${JSON.stringify(b)} probeX=${probeX} diag=${JSON.stringify(diag)}`).toBeLessThanOrEqual(2)
  expect(Math.abs(b.y + probeY - 200)).toBeLessThanOrEqual(2)
  await h.close()
})

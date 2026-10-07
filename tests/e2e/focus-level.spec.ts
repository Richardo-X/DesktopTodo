import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 应用级聚焦层级（用户 2026-10-07 裁定）：
 * 聚焦面向整个应用——点击待办主窗（浮前激活）后打开侧窗，
 * 侧窗应与主窗同层出现（其它应用窗口不得盖住侧窗）。
 * 判定：洋红覆盖窗盖住快捷添加默认位 → 点 ⚡ → 采样侧窗中心像素 ≠ 洋红（在覆盖窗之上）。 */

test('主窗激活后打开侧窗 → 侧窗在其它应用窗口之上（应用级聚焦）', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(400)

  // 记录快捷添加窗目标位置（开侧窗前的锚点推算：以开窗后实际位置为准，先记主窗）
  const mainBefore = await h.app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(
      (x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main')
    )!
    return main.getBounds()
  })

  // 洋红覆盖窗盖住「快捷添加默认位」（主窗左侧，同 y、宽 280×scale≈主窗宽比例——直接用主窗宽 0.6 比例覆盖左侧区域）
  await h.app.evaluate(({ BrowserWindow }, mb) => {
    const cover = new BrowserWindow({
      x: mb.x - 320,
      y: mb.y,
      width: 300,
      height: mb.height,
      show: false,
      backgroundColor: '#ff00ff',
      title: 'e2e-cover-left'
    })
    void cover.loadURL('about:blank')
    cover.show() // 激活到顶=模拟用户点击了其它应用窗口（侧窗 z 序在此期间下沉）
  }, mainBefore)
  await h.main.waitForTimeout(300)

  // 快捷添加默认已开：先收起（让"打开侧窗"成为被测动作）
  await h.main.click('[data-testid="op-quick-toggle"]')
  await h.main.waitForTimeout(600)

  // 主窗激活（用户场景：点击待办主窗，浮前获得焦点）
  await h.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main'))
      ?.focus()
  })
  await h.main.waitForTimeout(300)

  // 打开侧窗（⚡，真实 UI 路径）
  await h.main.click('[data-testid="op-quick-toggle"]')
  await h.main.waitForTimeout(700)

  // 采样快捷添加窗中心像素：≠洋红 = 侧窗在覆盖窗之上（应用级聚焦成立）
  const quickCenter = await h.app.evaluate(({ BrowserWindow }) => {
    const q = BrowserWindow.getAllWindows().find(
      (x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=quick')
    )!
    const b = q.getBounds()
    return { x: b.x + Math.round(b.width / 2), y: b.y + Math.round(b.height / 2), vis: q.isVisible() }
  })
  expect(quickCenter.vis).toBe(true)

  const px = await h.main.evaluate(
    (p) =>
      (window as unknown as { desktopTodoTest?: { pixelAt(x: number, y: number): Promise<number> } }).desktopTodoTest!
        .pixelAt(p.x, p.y),
    { x: quickCenter.x, y: quickCenter.y }
  )
  // 洋红 #ff00ff → COLORREF 0xFF00FF（BGR 同值）。非洋红 = 侧窗在覆盖窗之上
  console.log('PIXEL-PROBE quick-center:', px)
  expect(px).not.toBe(0xff00ff)
  await h.close()
})

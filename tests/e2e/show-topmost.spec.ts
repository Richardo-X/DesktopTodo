import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 显示时整体置顶（用户 2026-10-07 新需求）：
 * 应用从隐藏状态切换为显示时，整体（三窗+二级窗）弹到其他所有窗口上方——
 * 无论隐藏前位置是否有窗口占据，显示后可直接操作。
 * 判定：洋红覆盖窗盖住主窗位 → 隐藏 → 显示 → 采样主窗中心 ≠ 洋红（在最上）。 */

test('隐藏→显示：应用整体弹到其他窗口上方（主窗中心非覆盖窗颜色）', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(400)

  // 洋红覆盖窗盖住主窗中心（show 激活置顶于主窗之上）
  const mainBounds = await h.app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(
      (x) => !x.isDestroyed() && x.webContents.getURL().includes('panel=main')
    )!
    return main.getBounds()
  })
  await h.app.evaluate(({ BrowserWindow }, mb) => {
    const cover = new BrowserWindow({
      x: mb.x + Math.round(mb.width / 4),
      y: mb.y + Math.round(mb.height / 4),
      width: Math.round(mb.width / 2),
      height: Math.round(mb.height / 2),
      show: false,
      backgroundColor: '#ff00ff',
      title: 'e2e-cover-center'
    })
    void cover.loadURL('about:blank')
    cover.show()
  }, mainBounds)
  await h.main.waitForTimeout(300)

  // 隐藏 → 显示
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(false)
  )
  await h.main.waitForTimeout(500)
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setVisibility(v: boolean): Promise<void> } }).desktopTodo.setVisibility(true)
  )
  await h.main.waitForTimeout(800)

  // 主窗中心像素 ≠ 洋红 = 主窗在覆盖窗之上（应用显示即整体置顶）
  const px = await h.main.evaluate(
    (p) =>
      (window as unknown as { desktopTodoTest?: { pixelAt(x: number, y: number): Promise<number> } }).desktopTodoTest!
        .pixelAt(p.x, p.y),
    { x: mainBounds.x + Math.round(mainBounds.width / 2), y: mainBounds.y + Math.round(mainBounds.height / 2) }
  )
  console.log('SHOW-TOP-PROBE main-center:', px)
  expect(px).not.toBe(0xff00ff)
  await h.close()
})

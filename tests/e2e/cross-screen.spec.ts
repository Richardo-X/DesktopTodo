import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'
import { defaultAppData } from '../../src/core/models'

/**
 * 真实多显示器回归：单屏环境自动跳过。
 * 覆盖：拖动跨屏、子窗跟随所在屏、重启按副屏位置恢复（多屏并集钳制）。
 */
async function secondaryArea(h: AppHandle): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const displays = await h.app.evaluate(({ screen }) => {
    const primaryId = screen.getPrimaryDisplay().id
    return screen
      .getAllDisplays()
      .filter((d) => d.id !== primaryId)
      .map((d) => d.workArea)
  })
  return displays[0] ?? null
}

async function mainBounds(h: AppHandle): Promise<{ x: number; y: number; width: number; height: number }> {
  return h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('panel=main'))
    return w!.getBounds()
  })
}

test('跨屏：拖动到副屏 + 子窗跟随 + 重启恢复', async () => {
  const h = await launchApp()
  const secondary = await secondaryArea(h)
  test.skip(!secondary || secondary.width < 600 || secondary.height < 700, '需要一块足够大的副屏')
  const targetX = secondary!.x + 40
  const targetY = secondary!.y + 120
  const before = await mainBounds(h)
  await h.main.evaluate(
    ({ dx, dy }) =>
      (
        window as unknown as {
          desktopTodoTest: { clusterDragDelta: (x: number, y: number) => Promise<void> }
        }
      ).desktopTodoTest.clusterDragDelta(dx, dy),
    { dx: targetX - before.x, dy: targetY - before.y }
  )
  const after = await mainBounds(h)
  expect(after.x).toBeGreaterThanOrEqual(secondary!.x)
  expect(after.y).toBeGreaterThanOrEqual(secondary!.y)
  expect(after.x).toBeLessThan(secondary!.x + secondary!.width)

  // 子窗跟随组件所在屏，而不是固定弹回主屏
  const wp = h.app.waitForEvent('window')
  await h.main.click('[data-testid="tb-settings"]')
  const settings = await wp
  await settings.waitForSelector('[data-testid="set-back"]')
  const sw = await h.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('win=settings'))
    return w ? w.getBounds() : null
  })
  expect(sw).not.toBeNull()
  expect(sw!.x).toBeGreaterThanOrEqual(secondary!.x)
  await h.close()

  // 重启按副屏位置恢复（启动不再按主屏 workArea 钳回）
  const base = defaultAppData()
  const h2 = await launchApp({
    seed: { uiState: { ...base.uiState, pos: { x: targetX, y: targetY } } }
  })
  const restored = await mainBounds(h2)
  expect(restored.x).toBeGreaterThanOrEqual(secondary!.x)
  expect(restored.y).toBeGreaterThanOrEqual(secondary!.y)
  expect(restored.x).toBeLessThan(secondary!.x + secondary!.width)
  await h2.close()
})

import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

test('debug windows', async () => {
  const h = await launchApp()
  const info = () =>
    h.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((w) => !w.isDestroyed())
        .map((w) => ({ id: w.id, visible: w.isVisible(), minimized: w.isMinimized(), shown: w.isVisible() }))
    )
  console.log('initial:', JSON.stringify(await info()))
  const sp = h.app.waitForEvent('window')
  await h.main.click('[data-testid="tb-settings"]')
  const settings = await sp
  await settings.waitForSelector('[data-testid="set-max"]')
  console.log('after open child:', JSON.stringify(await info()))
  await h.main.click('[data-testid="tb-minimize"]')
  await h.main.waitForTimeout(800)
  console.log('after minimize:', JSON.stringify(await info()))
  await h.close()
})

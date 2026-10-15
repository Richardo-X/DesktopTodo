import { test } from '@playwright/test'
import { launchApp } from './helpers'

test('debug grip cb', async () => {
  const h = await launchApp()
  const sp = h.app.waitForEvent('window')
  await h.main.click('[data-testid="op-new"]')
  const page = await sp
  await page.waitForSelector('[data-testid="new-input"]')
  await page.waitForTimeout(300)
  const m = await page.evaluate(() => {
    const g = document.querySelector('.child-grip') as HTMLElement
    const root = document.querySelector('[data-testid="child-root"]') as HTMLElement
    return {
      parentClass: g.parentElement?.className,
      offsetParentClass: g.offsetParent ? (g.offsetParent as HTMLElement).className : 'null',
      rootPosition: getComputedStyle(root).position,
      rootRect: { w: root.getBoundingClientRect().width, h: root.getBoundingClientRect().height },
      gripRect: { r: g.getBoundingClientRect().right, b: g.getBoundingClientRect().bottom },
      rootStyleAttr: root.getAttribute('style')
    }
  })
  console.log('CB DEBUG:', JSON.stringify(m, null, 1))
  await h.close()
})

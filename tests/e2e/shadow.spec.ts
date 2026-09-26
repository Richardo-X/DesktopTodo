import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'

/** 三轮反馈（8.2-5/8.2-7）：去除窗口投影；移除透明窗口上的 backdrop-filter（夜晚黑块根因之一） */
test('8.2-5/7：面板无投影、无背景模糊层（日夜两主题）', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')

  const measure = async (): Promise<{ panelShadow: string; sideShadow: string; panelBackdrop: string }> =>
    h.main.evaluate(() => {
      const panel = document.querySelector('[data-testid="home-panel"]') as HTMLElement
      const side = document.querySelector('[data-testid="quick-panel"]') as HTMLElement
      return {
        panelShadow: getComputedStyle(panel).boxShadow,
        sideShadow: getComputedStyle(side).boxShadow,
        panelBackdrop: getComputedStyle(panel).backdropFilter
      }
    })

  // 白天主题
  const day = await measure()
  expect(day.panelShadow).toBe('none')
  expect(day.sideShadow).toBe('none')
  expect(day.panelBackdrop).toBe('none')

  // 夜晚主题（黑块反馈场景）
  await h.main.click('[data-testid="tb-theme"]')
  await h.main.waitForTimeout(200)
  const night = await measure()
  expect(night.panelShadow).toBe('none')
  expect(night.sideShadow).toBe('none')
  expect(night.panelBackdrop).toBe('none')

  await h.close()
})

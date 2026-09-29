import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'
import { createTodoItem } from '../../src/core/models'

/** 三轮反馈（8.2-5/8.2-7）：去除窗口投影；移除透明窗口上的 backdrop-filter（夜晚黑块根因之一） */
test('8.2-5/7：面板无投影、无背景模糊层（日夜两主题）', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')

  // 三窗架构：主窗/侧窗分属不同页面——投影/模糊在各自窗口测量
  const measure = async (): Promise<{ panelShadow: string; sideShadow: string; panelBackdrop: string }> => {
    const panel = await h.main.evaluate(() => {
      const panel = document.querySelector('[data-testid="home-panel"]') as HTMLElement
      return { boxShadow: getComputedStyle(panel).boxShadow, backdropFilter: getComputedStyle(panel).backdropFilter }
    })
    const side = await h.quick.evaluate(() => {
      const el = document.querySelector('[data-testid="quick-panel"]') as HTMLElement
      return { boxShadow: getComputedStyle(el).boxShadow }
    })
    return { panelShadow: panel.boxShadow, sideShadow: side.boxShadow, panelBackdrop: panel.backdropFilter }
  }

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

/** 四轮真因修复配套：确认框夜间底色走令牌（:global 裸选择器编译坑的回归验证） */
test('确认框夜间底色 #262a34 / 白天 #fff（令牌化）', async () => {
  const h = await launchApp({
    seed: { todos: [createTodoItem({ content: '甲', now: new Date(), id: 't1' })] }
  })
  await h.main.waitForSelector('[data-testid="home-panel"]')

  const openConfirm = async (): Promise<void> => {
    await h.main.click('[data-testid="op-batch"]')
    await h.main.click('[data-testid="todo-row"]') // 选中一项，「删除所选」才可用（v1.0.3 定稿）
    await h.main.click('[data-testid="batch-delete"]')
    await h.main.waitForSelector('[data-testid="confirm-dialog"]')
  }
  const dialogBg = async (): Promise<string> =>
    h.main.evaluate(() => getComputedStyle(document.querySelector('.dialog') as Element).backgroundColor)

  // 白天
  await openConfirm()
  expect(await dialogBg()).toBe('rgb(255, 255, 255)')
  await h.main.click('[data-testid="confirm-cancel"]')
  await h.main.click('[data-testid="batch-cancel"]') // 退出批量（否则全禁冻结主题按钮）

  // 夜间
  await h.main.click('[data-testid="tb-theme"]')
  await h.main.waitForTimeout(200)
  await openConfirm()
  expect(await dialogBg()).toBe('rgb(38, 42, 52)')
  await h.main.click('[data-testid="confirm-cancel"]')

  // 回归：夜间 .stage 自身不得被涂色（黑块根因）
  const stageBg = await h.main.evaluate(
    () => getComputedStyle(document.querySelector('.stage') as Element).backgroundColor
  )
  expect(stageBg === 'rgba(0, 0, 0, 0)' || stageBg === 'transparent').toBe(true)
  await h.close()
})

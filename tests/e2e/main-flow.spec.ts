import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'

/** T45 主流程（验收 6/7/8/10/12/14/19/28/29） */
let h: AppHandle

async function createTodo(main: import('@playwright/test').Page, text: string): Promise<void> {
  const winPromise = h.app.waitForEvent('window')
  await main.click('[data-testid="op-new"]')
  const child = await winPromise
  await child.waitForSelector('[data-testid="new-input"]')
  await child.fill('[data-testid="new-input"]', text)
  await child.click('[data-testid="new-submit"]')
  await child.waitForEvent('close', { timeout: 5000 }).catch(() => {})
}

test.beforeEach(async () => {
  h = await launchApp()
})

test.afterEach(async () => {
  await h.close()
})

test('验收7：首次启动空列表并显示引导文案', async () => {
  await expect(h.main.locator('[data-testid="empty-state"]')).toContainText('今日做点什么好呢')
})

test('主流程：新建→编辑→完成→反选→批量删除（B1.5：直接删除，无回收站）', async ({ }) => {
  const main = h.main

  // 新建（末尾插入）
  await createTodo(main, 'E2E 事项一')
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(1)

  // 双击编辑 → 保存
  const editPromise = h.app.waitForEvent('window')
  await main.locator('[data-testid="todo-row"]').first().dblclick()
  const edit = await editPromise
  await edit.waitForSelector('[data-testid="edit-input"]')
  await edit.fill('[data-testid="edit-input"]', 'E2E 事项一（改）')
  await edit.click('[data-testid="edit-save"]')
  await edit.waitForEvent('close', { timeout: 5000 }).catch(() => {})
  await expect(main.locator('[data-testid="row-content"]').first()).toContainText('（改）')

  // 再建两条
  await createTodo(main, 'E2E 事项二')
  await createTodo(main, 'E2E 事项三')
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(3)

  // 勾选完成 → 已完成页（动画后）
  await main.locator('[data-testid="row-checkbox"]').first().click()
  await expect(main.locator('[data-testid="done-row"]')).toHaveCount(1, { timeout: 5000 })
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(2)

  // 反选退回（回到末尾）
  await main.locator('[data-testid="done-check"]').first().click()
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(3)
  await expect(main.locator('[data-testid="done-row"]')).toHaveCount(0)

  // 批量删除两条 → 确认（提示不可恢复）→ 直接消失，无回收站恢复入口
  await main.click('[data-testid="op-batch"]')
  const rows = main.locator('[data-testid="todo-row"]')
  await rows.nth(0).click()
  await rows.nth(1).click()
  await expect(main.locator('[data-testid="batch-count"]')).toHaveText('已选 2 项')
  await main.click('[data-testid="batch-delete"]')
  await expect(main.locator('[data-testid="confirm-message"]')).toContainText('无法恢复')
  await main.click('[data-testid="confirm-ok"]')
  await expect(rows).toHaveCount(1)
})

test('验收6：退出重启后事项与界面状态恢复', async () => {
  const main = h.main
  await createTodo(main, '持久化事项')
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(1)

  // 改主题（记忆项）；等待子窗口完全关闭后再操作
  await main.waitForTimeout(400)
  await main.click('[data-testid="tb-theme"]')
  await expect(main.locator('.stage')).toHaveAttribute('data-theme', 'night', { timeout: 15_000 })

  const userData = h.userData
  await h.close()

  const h2 = await launchApp({ userData })
  await expect(h2.main.locator('[data-testid="todo-row"]')).toHaveCount(1)
  await expect(h2.main.locator('[data-testid="row-content"]')).toContainText('持久化事项')
  await expect(h2.main.locator('.stage')).toHaveAttribute('data-theme', 'night')
  await h2.close()
})

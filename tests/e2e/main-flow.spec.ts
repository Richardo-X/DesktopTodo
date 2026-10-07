import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'
import { createTodoItem } from '../../src/core/models'

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

test('布局：待办面板精确充满窗口视口，无裁切（批次 B-1 三窗口径）', async () => {
  const g = await h.main.evaluate(() => {
    const r = (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width) }
    }
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      home: r('[data-testid="home-panel"]')
    }
  })
  if (!g?.home) throw new Error('面板缺失')
  // 视口=470×有效缩放（CI 小屏会钳到 0.7 下限）→ 面板实测宽=基准×缩放（±1 取整）
  const s = g.vw / 470
  const near = (actual: number, base: number): void => {
    expect(Math.abs(actual - Math.round(base * s))).toBeLessThanOrEqual(1)
  }
  near(g.home.width, 470)
  near(g.vh, 640)
  // 无裁切：面板右缘 == 视口宽（±1 取整）
  expect(Math.abs(g.home.right - g.vw)).toBeLessThanOrEqual(1)
})

test('验收7：首次启动空列表并显示引导文案', async () => {
  await expect(h.main.locator('[data-testid="empty-state"]')).toContainText('今日做点什么好呢')
})

test('批次 B-4（#36）：10 项满载溢出→缝隙自绘滑块，行宽零挤压', async () => {
  const todos = Array.from({ length: 10 }, (_, i) =>
    createTodoItem({ content: `事项${i + 1}`, now: new Date(), id: `t${i}` })
  )
  const h2 = await launchApp({ seed: { todos } })
  const m = await h2.main.evaluate(() => {
    const list = document.querySelector('[data-testid="home-panel"] .scroll') as HTMLElement | null
    const row = document.querySelector('[data-testid="todo-row"]') as HTMLElement | null
    const thumb = document.querySelector('[data-testid="todo-thumb"]') as HTMLElement | null
    if (!list || !row || !thumb) return null
    const lr = list.getBoundingClientRect()
    const rr = row.getBoundingClientRect()
    return {
      scrollH: list.scrollHeight,
      clientH: list.clientHeight,
      clientW: list.clientWidth,
      offsetW: list.offsetWidth,
      rectW: Math.round(lr.width),
      rowW: Math.round(rr.width),
      rowOffsetW: row.offsetWidth,
      padRight: getComputedStyle(list).paddingRight,
      padLeft: getComputedStyle(list).paddingLeft,
      zoom: getComputedStyle(list).zoom,
      thumbShown: getComputedStyle(thumb).display !== 'none'
    }
  })
  if (!m) throw new Error('待办列表缺失')
  console.log('SLIDER-DIAG:', JSON.stringify(m))
  await h2.close()
  // 撤销「10 项满载无滚动」旧规则：满载即溢出，滑块显示于缝隙带
  // 行宽零挤压（设计锚定断言）：行宽 = 主窗 470 - win-body 内边距 14×2 - 滚动内边距 2×2 = 438（±2）
  // （旧断言 clientW-rowW≥10 依赖环境缩放假设，2026-10-07 双屏 125%/175% 下失效——见问题记录 C5）
  expect(m.scrollH).toBeGreaterThan(m.clientH)
  expect(m.thumbShown).toBe(true)
  expect(Math.abs(m.rowW - 438)).toBeLessThanOrEqual(2)
})

test('主流程：新建→编辑→完成→反选→批量删除（B1.5：直接删除，无回收站）', async ({ }) => {
  const main = h.main
  const done = h.done // 三窗架构：完成行/反选在已完成窗口页

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

  // 勾选完成 → 已完成窗口（三窗架构；跨窗广播经 stateUpdated）
  await main.locator('[data-testid="row-checkbox"]').first().click()
  await expect(done.locator('[data-testid="done-row"]')).toHaveCount(1, { timeout: 5000 })
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(2)

  // 反选退回（回到末尾）
  await done.locator('[data-testid="done-check"]').first().click()
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(3)
  await expect(done.locator('[data-testid="done-row"]')).toHaveCount(0)

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

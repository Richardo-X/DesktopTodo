import { describe, it, expect } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import HistoryWindow from '../../src/windows/HistoryWindow.vue'
import DetailWindow from '../../src/windows/DetailWindow.vue'
import { mountWithStore } from '../helpers/mount'
import { createTodoItem } from '../../src/core/models'

const T = new Date()
const Y = T.getFullYear()
const M = T.getMonth()
/** 日期键：用日期算术（Date 自动处理跨月/跨年），禁止手拼 day-1（月初产生 10-00 非法键） */
function key(mo: number, d: number): string {
  return `${Y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function keyOffset(days: number): string {
  const d = new Date(Y, M, T.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const TODAY_KEY = key(M, T.getDate())
// 全部用相对偏移：月初/月末自动安全（绝对 day 常量会翻滚成未来日期破坏导出/翻页断言）
const D10 = keyOffset(-14)
const D11 = keyOffset(-13)
const YESTERDAY_KEY = keyOffset(-1)

function done(id: string, content: string, dateKey: string, hour: number) {
  const [y, mo, d] = dateKey.split('-').map(Number)
  const item = createTodoItem({ content, now: new Date(y, mo - 1, d, 1), id })
  return { ...item, completedAt: new Date(y, mo - 1, d, hour).toISOString() }
}

function seed() {
  return {
    archive: {
      [D10]: [done('h1', '历史一', D10, 8), done('h2', '历史二', D10, 9)]
    },
    completed: [done('h9', '今天完成', TODAY_KEY, 8)]
  }
}

/** T33 历史记录窗口（PRD §七：按天翻阅/日期选择/回到今天/只读/批量删除/导出） */
describe('T33 历史记录窗口', () => {
  it('批量进行中：翻页/日期/导出区冻结，仅批量行与批量条可操作（8.2-7 全禁）', async () => {
    const { wrapper } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-batch"]').trigger('click')
    // 冻结改为逐控件（返回按钮需保持可点）——翻页控件冻结、返回不冻结
    expect(wrapper.find('[data-testid="hist-prev"]').classes()).toContain('frozen')
    expect(wrapper.find('[data-testid="batch-cancel"]').classes()).not.toContain('frozen')
    expect(wrapper.find('[data-testid="hist-export-zone"]').classes()).toContain('frozen')
    expect(wrapper.find('[data-testid="batch-bar"]').classes()).not.toContain('frozen')
  })

  it('默认定位当天的前一天（历史口径：不显示今天；前一天为空就显示空）', async () => {
    const { wrapper } = await mountWithStore(HistoryWindow, seed())
    const yesterdayKey = YESTERDAY_KEY
    expect(wrapper.find('[data-testid="hist-date-label"]').text()).toContain(yesterdayKey)
    expect(wrapper.find('[data-testid="hist-count"]').text()).toBe('0 条')
    expect(wrapper.find('[data-testid="hist-empty"]').text()).toBe('该日期暂无已完成事项')
  })

  it('导出口径不变：含今天已完成（PRD F1，决策#15）', async () => {
    const { wrapper, api } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-export-from"]').setValue(TODAY_KEY)
    await wrapper.find('[data-testid="hist-export-to"]').setValue(TODAY_KEY)
    await wrapper.find('[data-testid="hist-export"]').trigger('click')
    await flushPromises()
    expect(api.savedCsv).toHaveLength(1)
    // 视图只显示归档（决策#15），但导出仍包含今天已完成
    expect(api.savedCsv[0].content).toContain('今天完成')
  })

  it('空日期显示空提示', async () => {
    const { wrapper } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-prev"]').trigger('click')
    const label = wrapper.find('[data-testid="hist-date-label"]').text()
    expect(label).not.toContain(TODAY_KEY)
    // 前一天若无记录 → 空提示
    const { wrapper: w2 } = await mountWithStore(HistoryWindow, { archive: { [D10]: [] } })
    await w2.find('[data-testid="hist-prev"]').trigger('click')
    if (!w2.find('[data-testid="hist-empty"]').exists()) {
      // 继续翻到无记录日
      for (let i = 0; i < 40 && !w2.find('[data-testid="hist-empty"]').exists(); i++) {
        await w2.find('[data-testid="hist-prev"]').trigger('click')
      }
    }
    expect(w2.find('[data-testid="hist-empty"]').text()).toBe('该日期暂无已完成事项')
    void wrapper
  })

  it('翻到有记录的日期显示只读列表；双击行打开详情', async () => {
    const { wrapper, api } = await mountWithStore(HistoryWindow, seed())
    // 日期选择直接到 D10
    await wrapper.find('[data-testid="hist-date-input"]').setValue(D10)
    expect(wrapper.find('[data-testid="hist-count"]').text()).toBe('2 条')
    expect(wrapper.findAll('[data-testid="hist-row"]')).toHaveLength(2)
    // 只读：无勾选框（不在批量模式）、无退回入口
    expect(wrapper.find('[data-testid="row-checkbox"]').exists()).toBe(false)

    await wrapper.findAll('[data-testid="hist-row"]')[0].trigger('dblclick')
    expect(api.openChildCalls).toContainEqual({ kind: 'detail', id: 'h1' })
  })

  it('后一天/回到今天导航', async () => {
    const { wrapper } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-date-input"]').setValue(D10)
    await wrapper.find('[data-testid="hist-next"]').trigger('click')
    expect(wrapper.find('[data-testid="hist-date-label"]').text()).toContain(D11)

    await wrapper.find('[data-testid="hist-today"]').trigger('click')
    expect(wrapper.find('[data-testid="hist-date-label"]').text()).toContain(TODAY_KEY)
  })

  it('批量删除：勾一条即删，确认后直接删除（B1.5）', async () => {
    const { wrapper, store } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-date-input"]').setValue(D10)
    await wrapper.find('[data-testid="hist-batch"]').trigger('click')
    expect(wrapper.find('[data-testid="batch-bar"]').exists()).toBe(true)

    await wrapper.findAll('[data-testid="hist-row"]')[0].trigger('click')
    await wrapper.find('[data-testid="batch-delete"]').trigger('click')
    await wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(store.archive[D10]).toHaveLength(1)
    expect('recycleBin' in store.data).toBe(false) // 回收站整体退场
  })

  it('导出：选起止日期 → 系统另存为（文件名与内容表头正确）', async () => {
    const { wrapper, api } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-export-from"]').setValue(D10)
    await wrapper.find('[data-testid="hist-export-to"]').setValue(TODAY_KEY)
    await wrapper.find('[data-testid="hist-export"]').trigger('click')
    await flushPromises()

    expect(api.savedCsv).toHaveLength(1)
    expect(api.savedCsv[0].fileName).toBe(`待办完成记录_${D10}_${TODAY_KEY}.csv`)
    expect(api.savedCsv[0].content.charCodeAt(0)).toBe(0xfeff)
    expect(api.savedCsv[0].content).toContain('完成日期,完成时间,事项内容,创建时间,完成时间')
  })

  it('导出：区间无记录 → 错误提示', async () => {
    const { wrapper } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-export-from"]').setValue(keyOffset(-20))
    await wrapper.find('[data-testid="hist-export-to"]').setValue(keyOffset(-19))
    await wrapper.find('[data-testid="hist-export"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="hist-export-error"]').text()).toContain('该区间暂无记录')
  })

  it('导出：from>to → 错误提示', async () => {
    const { wrapper } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-export-from"]').setValue(TODAY_KEY)
    await wrapper.find('[data-testid="hist-export-to"]').setValue(D10)
    await wrapper.find('[data-testid="hist-export"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="hist-export-error"]').text()).toContain('起始日期不能晚于结束日期')
  })
})

/** 历史事项详情：删除按钮在关闭左侧；确认后删除对应归档日并关闭 */
describe('T33b 历史事项详情', () => {
  it('删除按钮在关闭左侧，确认后删除归档记录并关闭', async () => {
    const item = done('hd', '历史删除项', D10, 8)
    const detail = await mountWithStore(DetailWindow, { archive: { [D10]: [item] } }, { itemId: 'hd' })
    const footerButtons = detail.wrapper.findAll('footer button')
    expect(footerButtons.map((b) => b.attributes('data-testid'))).toEqual(['detail-delete', 'detail-close'])

    await detail.wrapper.find('[data-testid="detail-delete"]').trigger('click')
    expect(detail.wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(true)
    await detail.wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(detail.store.archive[D10]).toHaveLength(0)
    expect(detail.api.closeSelfCalls).toBe(1)
  })
})

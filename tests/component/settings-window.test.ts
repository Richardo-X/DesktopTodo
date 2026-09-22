import { describe, it, expect } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import SettingsWindow from '../../src/windows/SettingsWindow.vue'
import { mountWithStore } from '../helpers/mount'
import { createTodoItem, defaultAppData, type AppData } from '../../src/core/models'

const base = defaultAppData()

function seedTodos(n: number): Partial<AppData> {
  return {
    todos: Array.from({ length: n }, (_, i) => createTodoItem({ content: `t${i}`, now: new Date(), id: `x${i}` })),
    settings: { ...base.settings, maxItems: 6 }
  }
}

/** T34 设置窗口（PRD §5.7 六项；速查 #14 减号置灰） */
describe('T34 设置窗口', () => {
  it('渲染六个设置区块', async () => {
    const { wrapper } = await mountWithStore(SettingsWindow)
    for (const id of ['set-max', 'set-hour12', 'set-font', 'set-import', 'set-autostart', 'set-recycle']) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(true)
    }
  })

  it('上限步进：显示当前值；加号到 10 禁用；减号调节并持久化', async () => {
    const { wrapper, store, api } = await mountWithStore(SettingsWindow)
    expect(wrapper.find('[data-testid="set-max-value"]').text()).toBe('10')
    expect((wrapper.find('[data-testid="set-max-plus"]').element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.find('[data-testid="set-max-minus"]').trigger('click')
    await flushPromises()
    expect(store.settings.maxItems).toBe(9)
    expect(api.snapshot().settings.maxItems).toBe(9)
    expect((wrapper.find('[data-testid="set-max-plus"]').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('上限=当前待办数量时减号置灰并显示说明', async () => {
    const { wrapper } = await mountWithStore(SettingsWindow, seedTodos(6))
    await wrapper.find('[data-testid="set-max-minus"]').trigger('click')
    await wrapper.find('[data-testid="set-max-minus"]').trigger('click')
    await wrapper.find('[data-testid="set-max-minus"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="set-max-value"]').text()).toBe('6')
    expect((wrapper.find('[data-testid="set-max-minus"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-testid="set-max-note"]').text()).toBe('不可低于当前待办数量')
  })

  it('时间制式切换', async () => {
    const { wrapper, store } = await mountWithStore(SettingsWindow)
    await wrapper.find('[data-testid="set-hour12-btn"]').trigger('click')
    await flushPromises()
    expect(store.settings.hour12).toBe(true)
  })

  it('字体三档', async () => {
    const { wrapper, store } = await mountWithStore(SettingsWindow)
    await wrapper.find('[data-testid="set-font-small"]').trigger('click')
    await wrapper.find('[data-testid="set-font-large"]').trigger('click')
    await flushPromises()
    expect(store.settings.fontScale).toBe('large')
  })

  it('开机自启开关联动系统设置', async () => {
    const { wrapper, store, api } = await mountWithStore(SettingsWindow)
    await wrapper.find('[data-testid="set-autostart-btn"]').trigger('click')
    await flushPromises()
    expect(store.settings.autoStart).toBe(true)
    expect(api.autoStartCalls).toEqual([true])
  })

  it('回收站时限设置与入口', async () => {
    const { wrapper, store, api } = await mountWithStore(SettingsWindow)
    await wrapper.find('[data-testid="set-recycle-keep7"]').trigger('click')
    await flushPromises()
    expect(store.settings.recycleKeep).toBe(7)

    await wrapper.find('[data-testid="set-recycle-open"]').trigger('click')
    expect(api.openChildCalls).toContainEqual({ kind: 'recycle' })
  })

  it('覆盖导入：先弹确认框，确认后调用导入', async () => {
    const { wrapper, api } = await mountWithStore(SettingsWindow)
    await wrapper.find('[data-testid="set-import-cover"]').trigger('click')
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="confirm-message"]').text()).toContain('清空')

    await wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(api.openCsvCalls).toBe(1)
  })

  it('合并导入：直接调用导入', async () => {
    const { wrapper, api } = await mountWithStore(SettingsWindow)
    await wrapper.find('[data-testid="set-import-merge"]').trigger('click')
    await flushPromises()
    expect(api.openCsvCalls).toBe(1)
  })
})

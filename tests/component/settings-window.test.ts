import { describe, it, expect, vi } from 'vitest'
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

/** T34 设置窗口（PRD §5.6 设置项；速查 #14 减号置灰） */
describe('T34 设置窗口', () => {
  it('渲染设置区块（B3：字体项随决策#3 移除、回收站随 #21 移除，余 4 区块）', async () => {
    const { wrapper } = await mountWithStore(SettingsWindow)
    for (const id of ['set-max', 'set-hour12', 'set-import', 'set-autostart']) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(true)
    }
    expect(wrapper.find('[data-testid="set-recycle"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="set-font"]').exists()).toBe(false)
  })

  it('set-back：标题栏左「←」直接关闭窗口（决策#6）', async () => {
    const { wrapper, api } = await mountWithStore(SettingsWindow)
    await wrapper.find('[data-testid="set-back"]').trigger('click')
    expect(api.closeSelfCalls).toBe(1)
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

  it('上限=当前待办数量时减号呈置灰外观但可点击；点击浮现边界提示（行内说明移除）', async () => {
    const { wrapper } = await mountWithStore(SettingsWindow, seedTodos(6))
    const minus = wrapper.find('[data-testid="set-max-minus"]')
    expect(minus.classes()).toContain('is-disabled')
    expect((minus.element as HTMLButtonElement).disabled).toBe(false)

    await minus.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="set-max-value"]').text()).toBe('6')
    expect(wrapper.find('[data-testid="set-max-hint"]').text()).toBe('不可低于当前待办数量')
    expect(wrapper.find('[data-testid="set-max-hint"]').classes()).toContain('show')
    expect(wrapper.find('[data-testid="set-max-note"]').exists()).toBe(false)
  })

  it('边界提示 1.8s 自动消失；每次点击重置计时', async () => {
    const { wrapper } = await mountWithStore(SettingsWindow, seedTodos(6))
    vi.useFakeTimers()
    try {
      const minus = wrapper.find('[data-testid="set-max-minus"]')
      const hint = () => wrapper.find('[data-testid="set-max-hint"]')
      await minus.trigger('click')
      await wrapper.vm.$nextTick()
      expect(hint().classes()).toContain('show')

      await vi.advanceTimersByTimeAsync(1000)
      await minus.trigger('click')
      await wrapper.vm.$nextTick()
      await vi.advanceTimersByTimeAsync(1000)
      expect(hint().classes()).toContain('show') // 第二次点击后仍在 1.8s 窗口内

      await vi.advanceTimersByTimeAsync(900)
      expect(hint().classes()).not.toContain('show')
    } finally {
      vi.useRealTimers()
    }
  })

  it('底部显示当前版本（getVersion；弱化居中）', async () => {
    const { wrapper } = await mountWithStore(SettingsWindow)
    await flushPromises()
    expect(wrapper.find('[data-testid="set-version"]').text()).toBe('当前版本：test-version')
  })

  it('显示用户数据文件绝对路径（getDataPath；只读）', async () => {
    const { wrapper } = await mountWithStore(SettingsWindow)
    await flushPromises()
    const block = wrapper.find('[data-testid="set-data-path"]')
    expect(block.exists()).toBe(true)
    expect(block.text()).toContain('数据存储位置')
    expect(wrapper.find('[data-testid="set-data-path-value"]').text()).toBe(
      'C:\\Users\\test\\AppData\\Roaming\\桌面待办\\data.json'
    )
  })

  it('时间制式切换', async () => {
    const { wrapper, store } = await mountWithStore(SettingsWindow)
    await wrapper.find('[data-testid="set-hour12-btn"]').trigger('click')
    await flushPromises()
    expect(store.settings.hour12).toBe(true)
  })

  it('开机自启开关联动系统设置', async () => {
    const { wrapper, store, api } = await mountWithStore(SettingsWindow)
    await wrapper.find('[data-testid="set-autostart-btn"]').trigger('click')
    await flushPromises()
    expect(store.settings.autoStart).toBe(true)
    expect(api.autoStartCalls).toEqual([true])
  })

  it('三轮：自启设置未生效时给出提示，恢复生效后提示消失', async () => {
    const { wrapper, api } = await mountWithStore(SettingsWindow)
    api.autoStartResult = false
    await wrapper.find('[data-testid="set-autostart-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="set-autostart-error"]').text()).toContain('未生效')

    api.autoStartResult = true
    await wrapper.find('[data-testid="set-autostart-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="set-autostart-error"]').exists()).toBe(false)
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

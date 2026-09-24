import { describe, it, expect } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import TemplateNewWindow from '../../src/windows/TemplateNewWindow.vue'
import TemplateEditWindow from '../../src/windows/TemplateEditWindow.vue'
import { mountWithStore } from '../helpers/mount'
import { createTemplateItem } from '../../src/core/models'

/** T30 新建/编辑模板窗口（PRD §五：说明文字/计数/清空/查重/编辑同事项样式） */
describe('T30 新建模板窗口', () => {
  it('说明文字与初始禁用；输入后可用；创建成功追加并关闭', async () => {
    const { wrapper, store, api } = await mountWithStore(TemplateNewWindow)
    expect(wrapper.find('[data-testid="tpl-new-hint"]').exists()).toBe(true)
    expect((wrapper.find('[data-testid="tpl-new-submit"]').element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.find('[data-testid="tpl-new-input"]').setValue('整理邮箱')
    expect((wrapper.find('[data-testid="tpl-new-submit"]').element as HTMLButtonElement).disabled).toBe(false)

    await wrapper.find('[data-testid="tpl-new-submit"]').trigger('click')
    await flushPromises()
    expect(store.templates.map((t) => t.content)).toEqual(['整理邮箱'])
    expect(api.closeSelfCalls).toBe(1)
  })

  it('重复内容 → 提示"已存在相同内容"且不关闭', async () => {
    const existing = createTemplateItem({ content: '喝水', now: new Date(), id: 'a' })
    const { wrapper, api, store } = await mountWithStore(TemplateNewWindow, { templates: [existing] })
    await wrapper.find('[data-testid="tpl-new-input"]').setValue(' 喝水 ')
    await wrapper.find('[data-testid="tpl-new-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="tpl-new-error"]').text()).toBe('已存在相同内容')
    expect(api.closeSelfCalls).toBe(0)
    expect(store.templates).toHaveLength(1)
  })

  it('300 字计数与清空', async () => {
    const { wrapper } = await mountWithStore(TemplateNewWindow)
    const input = wrapper.find('[data-testid="tpl-new-input"]')
    await input.setValue('a'.repeat(300))
    expect(wrapper.find('[data-testid="tpl-new-count"]').text()).toBe('300/300')
    expect(wrapper.find('[data-testid="tpl-new-count"]').classes().join(' ')).toContain('danger')
    await wrapper.find('[data-testid="tpl-new-clear"]').trigger('click')
    expect((input.element as HTMLTextAreaElement).value).toBe('')
  })
})

describe('T30 编辑模板窗口', () => {
  function seed() {
    return { templates: [createTemplateItem({ content: '原模板', now: new Date(2026, 8, 20, 9), id: 'a' })] }
  }

  it('创建时间只读；还原改过才可用；保存更新并关闭', async () => {
    const { wrapper, store, api } = await mountWithStore(TemplateEditWindow, seed(), { itemId: 'a' })
    expect(wrapper.find('[data-testid="tpl-edit-created"]').text()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect((wrapper.find('[data-testid="tpl-edit-revert"]').element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.find('[data-testid="tpl-edit-input"]').setValue('新模板内容')
    expect((wrapper.find('[data-testid="tpl-edit-revert"]').element as HTMLButtonElement).disabled).toBe(false)
    await wrapper.find('[data-testid="tpl-edit-revert"]').trigger('click')
    expect((wrapper.find('[data-testid="tpl-edit-input"]').element as HTMLTextAreaElement).value).toBe('原模板')

    await wrapper.find('[data-testid="tpl-edit-input"]').setValue('新模板内容')
    await wrapper.find('[data-testid="tpl-edit-save"]').trigger('click')
    await flushPromises()
    expect(store.templates[0].content).toBe('新模板内容')
    expect(api.closeSelfCalls).toBe(1)
  })

  it('保存查重：与其他模板重复 → 提示且不关闭', async () => {
    const seedTwo = {
      templates: [
        createTemplateItem({ content: '原模板', now: new Date(2026, 8, 20, 9), id: 'a' }),
        createTemplateItem({ content: '别人', now: new Date(2026, 8, 20, 9), id: 'b' })
      ]
    }
    const { wrapper, api } = await mountWithStore(TemplateEditWindow, seedTwo, { itemId: 'a' })
    await wrapper.find('[data-testid="tpl-edit-input"]').setValue('别人')
    await wrapper.find('[data-testid="tpl-edit-save"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="tpl-edit-error"]').text()).toBe('已存在相同内容')
    expect(api.closeSelfCalls).toBe(0)
  })

  it('删除 → 确认（提示不可恢复）→ 直接删除并关闭（B1.5）', async () => {
    const { wrapper, store, api } = await mountWithStore(TemplateEditWindow, seed(), { itemId: 'a' })
    await wrapper.find('[data-testid="tpl-edit-delete"]').trigger('click')
    expect(wrapper.find('[data-testid="confirm-message"]').text()).toContain('无法恢复')
    await wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(store.templates).toHaveLength(0)
    expect(store.recycleBin).toBeUndefined() // 回收站整体退场
    expect(api.closeSelfCalls).toBe(1)
  })

  it('返回：已改询问"是否保存"，取消则不保存关闭', async () => {
    const { wrapper, store, api } = await mountWithStore(TemplateEditWindow, seed(), { itemId: 'a' })
    await wrapper.find('[data-testid="tpl-edit-input"]').setValue('改')
    await wrapper.find('[data-testid="tpl-edit-back"]').trigger('click')
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(true)
    await wrapper.find('[data-testid="confirm-cancel"]').trigger('click')
    await flushPromises()
    expect(api.closeSelfCalls).toBe(1)
    expect(store.templates[0].content).toBe('原模板')
  })
})

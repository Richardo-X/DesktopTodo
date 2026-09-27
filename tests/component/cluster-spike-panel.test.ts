import { describe, it, expect } from 'vitest'
import { mountWithStore } from '../helpers/mount'
import ClusterSpikePanel from '../../src/windows/ClusterSpikePanel.vue'

/** 批次 A spike 面板：标题栏按下 → clusterDragStart；window pointerup → clusterDragEnd */
describe('ClusterSpikePanel', () => {
  it('渲染对应面板标题', async () => {
    const { wrapper } = await mountWithStore(ClusterSpikePanel, undefined, { panel: 'main' })
    expect(wrapper.find('[data-testid="spike-title"]').text()).toBe('桌面待办')
    wrapper.unmount()
  })

  it('标题栏 pointerdown 触发 clusterDragStart，window pointerup 触发 clusterDragEnd', async () => {
    const { wrapper, api } = await mountWithStore(ClusterSpikePanel, undefined, { panel: 'quick' })
    expect(api.dragStartCalls.length).toBe(0)
    await wrapper.find('[data-testid="spike-titlebar"]').trigger('pointerdown')
    expect(api.dragStartCalls.length).toBe(1)
    window.dispatchEvent(new Event('pointerup'))
    await Promise.resolve()
    expect(api.dragEndCalls.length).toBe(1)
    wrapper.unmount()
    expect(api.dragEndCalls.length).toBe(1)
  })
})

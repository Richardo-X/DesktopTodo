import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../../src/App.vue'

// M0-T02 基础设施冒烟测试：验证 @vue/test-utils + happy-dom 组件测试链路可用
describe('smoke/component', () => {
  it('App 骨架可挂载并渲染占位内容', () => {
    const wrapper = mount(App)
    expect(wrapper.find('[data-testid="app-shell"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('桌面待办')
  })
})

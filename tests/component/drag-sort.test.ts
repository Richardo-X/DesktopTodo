import { describe, it, expect, vi } from 'vitest'
import {
  createDragSort,
  DRAG_LONG_PRESS_MS,
  SWAP_EDGE_PX
} from '../../src/components/useDragSort'
import { moveItem } from '../../src/stores/app'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '../../src/stores/app'
import { installTestApi } from '../helpers/api'
import { createTodoItem } from '../../src/core/models'

/** B2（决策#13，原型 v3.1）：相邻增量交换——长按 230ms 启动、移动不取消、触碰相邻 4px 即换位 */

function makeRects(count: number, height = 44): (i: number) => { top: number; bottom: number } | null {
  return (i: number) => (i < 0 || i >= count ? null : { top: i * height, bottom: i * height + height })
}

describe('moveItem 纯函数', () => {
  it('前后移动保持其余相对顺序', () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1])
    expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2])
    expect(moveItem([1, 2, 3], 1, 1)).toEqual([1, 2, 3])
  })
})

describe('createDragSort 相邻增量交换状态机', () => {
  function setup(count = 5, enabled = true) {
    const swaps: Array<[number, number]> = []
    const drag = createDragSort({
      enabled: () => enabled,
      rowCount: () => count,
      rowRect: makeRects(count),
      onSwap: (from, to) => swaps.push([from, to])
    })
    return { drag, swaps }
  }

  it('常量：长按 230ms（决策#13）、换位边距 4px（触碰即换）', () => {
    expect(DRAG_LONG_PRESS_MS).toBe(230)
    expect(SWAP_EDGE_PX).toBe(4)
  })

  it('长按超过 230ms → 进入拖动；不足则不进入', async () => {
    vi.useFakeTimers()
    try {
      const { drag, swaps } = setup()
      drag.handleDown(1, { clientY: 100 })
      expect(drag.state.draggingIndex).toBeNull() // 未长按
      await vi.advanceTimersByTimeAsync(DRAG_LONG_PRESS_MS - 10)
      expect(drag.state.draggingIndex).toBeNull()
      await vi.advanceTimersByTimeAsync(20)
      expect(drag.state.draggingIndex).toBe(1)
      expect(swaps).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('长按期间移动不取消（决策#13：修复原型"移动即取消"的坑）', async () => {
    vi.useFakeTimers()
    try {
      const { drag } = setup()
      drag.handleDown(1, { clientY: 100 })
      drag.handleMove({ clientY: 160 }) // 启动前移动
      await vi.advanceTimersByTimeAsync(DRAG_LONG_PRESS_MS + 10)
      expect(drag.state.draggingIndex).toBe(1) // 仍进入拖动
    } finally {
      vi.useRealTimers()
    }
  })

  it('指针进入下行顶边 4px 内 → 与下行换位（增量、可连续）', () => {
    const { drag, swaps } = setup()
    drag.handleDown(1, { clientY: 60 }) // 行 1 = [44, 88]
    drag.state.draggingIndex = 1 // 模拟长按已启动

    // 下行 [2] 的矩形是 top:88；指针到 88（未过 +4）→ 不换
    drag.handleMove({ clientY: 88 })
    expect(swaps).toEqual([])

    // 指针到 93（越过 88+4）→ 触碰即换
    drag.handleMove({ clientY: 93 })
    expect(swaps).toEqual([[1, 2]])
    expect(drag.state.draggingIndex).toBe(2)

    // 继续向下：下行 [3] top:132；指针 137 → 再换
    drag.handleMove({ clientY: 137 })
    expect(swaps).toEqual([
      [1, 2],
      [2, 3]
    ])
    expect(drag.state.draggingIndex).toBe(3)
  })

  it('指针进入上行底边 4px 内 → 与上行换位', () => {
    const { drag, swaps } = setup()
    drag.handleDown(2, { clientY: 100 }) // 行 2 = [88, 132]
    drag.state.draggingIndex = 2

    // 上行 [1] 的矩形是 bottom:88；指针到 84（未过 -4）→ 不换
    drag.handleMove({ clientY: 84 })
    expect(swaps).toEqual([])

    // 指针继续上行越过 88-4 → 换
    drag.handleMove({ clientY: 79 })
    expect(swaps).toEqual([[2, 1]])
    expect(drag.state.draggingIndex).toBe(1)
  })

  it('位移 <2px 忽略；未越过邻行边缘不换位', () => {
    const { drag, swaps } = setup()
    drag.handleDown(1, { clientY: 60 })
    drag.state.draggingIndex = 1

    drag.handleMove({ clientY: 61 }) // 位移 1px → 忽略
    expect(swaps).toEqual([])

    drag.handleMove({ clientY: 88 }) // 未过下行顶边 +4 → 不换
    expect(swaps).toEqual([])

    drag.handleMove({ clientY: 93 }) // 越过 88+4 → 换
    expect(swaps).toEqual([[1, 2]])
  })

  it('首行向上/末行向下：无相邻行 → 不换位', () => {
    const { drag, swaps } = setup(3)
    drag.handleDown(0, { clientY: 0 })
    drag.state.draggingIndex = 0
    drag.handleMove({ clientY: -9999 })
    expect(swaps).toEqual([])

    drag.state.draggingIndex = 2
    drag.handleMove({ clientY: 9999 })
    expect(swaps).toEqual([])
  })

  it('未满长按阈值松开 → 不进入拖动；拖动中松开 → 状态清空', async () => {
    vi.useFakeTimers()
    try {
      const { drag, swaps } = setup()
      drag.handleDown(2, { clientY: 50 })
      await vi.advanceTimersByTimeAsync(DRAG_LONG_PRESS_MS - 50)
      drag.handleUp()
      await vi.advanceTimersByTimeAsync(500)
      expect(drag.state.draggingIndex).toBeNull()
      expect(swaps).toEqual([])

      // 拖动中松开：清空状态（排序已由增量换位提交，无剩余动作）
      drag.handleDown(1, { clientY: 0 })
      await vi.advanceTimersByTimeAsync(DRAG_LONG_PRESS_MS + 10)
      drag.handleUp()
      expect(drag.state.draggingIndex).toBeNull()
      expect(drag.state.pressingIndex).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('批量模式下禁用拖拽（互斥）', async () => {
    vi.useFakeTimers()
    try {
      const { drag, swaps } = setup(5, false)
      drag.handleDown(0, { clientY: 0 })
      await vi.advanceTimersByTimeAsync(DRAG_LONG_PRESS_MS + 10)
      expect(drag.state.draggingIndex).toBeNull()
      drag.handleUp()
      expect(swaps).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('store.reorderTodos 接线', () => {
  it('排序更新并持久化', async () => {
    setActivePinia(createPinia())
    const todos = [
      createTodoItem({ content: '一', now: new Date(), id: 'a' }),
      createTodoItem({ content: '二', now: new Date(), id: 'b' }),
      createTodoItem({ content: '三', now: new Date(), id: 'c' })
    ]
    const api = installTestApi({ todos })
    const store = useAppStore()
    await store.init()

    await store.reorderTodos(0, 2)
    expect(store.todos.map((t) => t.id)).toEqual(['b', 'c', 'a'])
    expect(api.snapshot().todos.map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('相邻换位（决策#13）：onSwap → reorderTodos(n, n+1)', async () => {
    setActivePinia(createPinia())
    const todos = [
      createTodoItem({ content: '一', now: new Date(), id: 'a' }),
      createTodoItem({ content: '二', now: new Date(), id: 'b' })
    ]
    installTestApi({ todos })
    const store = useAppStore()
    await store.init()

    await store.reorderTodos(0, 1)
    expect(store.todos.map((t) => t.id)).toEqual(['b', 'a'])
  })
})

import { describe, it, expect, vi } from 'vitest'
import { createDragSort, DRAG_LONG_PRESS_MS, DRAG_ROW_HEIGHT } from '../../src/components/useDragSort'
import { moveItem } from '../../src/stores/app'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '../../src/stores/app'
import { installTestApi } from '../helpers/api'
import { createTodoItem } from '../../src/core/models'

/** T28 拖拽排序：长按手柄 → 拖动 → 松开提交（PRD §5.2；与批量模式互斥） */
describe('moveItem 纯函数', () => {
  it('前后移动保持其余相对顺序', () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1])
    expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2])
    expect(moveItem([1, 2, 3], 1, 1)).toEqual([1, 2, 3])
  })
})

describe('createDragSort 长按拖拽状态机', () => {
  function setup(rowCount = 5, enabled = true) {
    const dropped: Array<[number, number]> = []
    const drag = createDragSort({
      enabled: () => enabled,
      rowCount: () => rowCount,
      onDrop: (from, to) => dropped.push([from, to])
    })
    return { drag, dropped }
  }

  it('长按超过阈值 → 进入拖动；移动更新目标行；松开提交', async () => {
    vi.useFakeTimers()
    try {
      const { drag, dropped } = setup()
      drag.handleDown(1, { clientY: 100 })
      expect(drag.state.draggingIndex).toBeNull() // 未长按

      await vi.advanceTimersByTimeAsync(DRAG_LONG_PRESS_MS + 10)
      expect(drag.state.draggingIndex).toBe(1)

      drag.handleMove({ clientY: 100 + DRAG_ROW_HEIGHT * 2 })
      expect(drag.state.overIndex).toBe(3)

      drag.handleUp()
      expect(dropped).toEqual([[1, 3]])
      expect(drag.state.draggingIndex).toBeNull()
      expect(drag.state.overIndex).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('未满长按阈值松开 → 不触发拖动', async () => {
    vi.useFakeTimers()
    try {
      const { drag, dropped } = setup()
      drag.handleDown(2, { clientY: 50 })
      await vi.advanceTimersByTimeAsync(DRAG_LONG_PRESS_MS - 50)
      drag.handleUp()
      await vi.advanceTimersByTimeAsync(500)
      expect(drag.state.draggingIndex).toBeNull()
      expect(dropped).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('拖动目标行钳制在 [0, rowCount-1]；原地松开不提交', async () => {
    vi.useFakeTimers()
    try {
      const { drag, dropped } = setup(3)
      drag.handleDown(0, { clientY: 0 })
      await vi.advanceTimersByTimeAsync(DRAG_LONG_PRESS_MS + 10)
      drag.handleMove({ clientY: -9999 })
      expect(drag.state.overIndex).toBe(0)
      drag.handleMove({ clientY: 9999 })
      expect(drag.state.overIndex).toBe(2)
      drag.handleUp()
      expect(dropped).toEqual([[0, 2]])

      // 原地松开
      drag.handleDown(1, { clientY: 0 })
      await vi.advanceTimersByTimeAsync(DRAG_LONG_PRESS_MS + 10)
      drag.handleMove({ clientY: 0 })
      drag.handleUp()
      expect(dropped).toEqual([[0, 2]]) // 无新增
    } finally {
      vi.useRealTimers()
    }
  })

  it('批量模式下禁用拖拽（互斥）', async () => {
    vi.useFakeTimers()
    try {
      const { drag, dropped } = setup(5, false)
      drag.handleDown(0, { clientY: 0 })
      await vi.advanceTimersByTimeAsync(DRAG_LONG_PRESS_MS + 10)
      expect(drag.state.draggingIndex).toBeNull()
      drag.handleUp()
      expect(dropped).toEqual([])
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
})

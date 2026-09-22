import { reactive } from 'vue'

/** 长按阈值：长按手柄 300ms 后进入拖动（PRD §5.2 长按手柄拖动） */
export const DRAG_LONG_PRESS_MS = 300

/** 行高估算（DIP），用于指针位移 → 目标行换算 */
export const DRAG_ROW_HEIGHT = 44

export interface DragSortState {
  pressingIndex: number | null
  draggingIndex: number | null
  overIndex: number | null
}

export interface DragSortOptions {
  /** 批量模式下禁用（互斥） */
  enabled: () => boolean
  rowCount: () => number
  onDrop: (from: number, to: number) => void
}

interface PointerLike {
  clientY: number
}

/**
 * 长按拖拽排序状态机：
 * pointerdown →（300ms）→ dragging → pointermove 换算目标行（钳制范围内）→ pointerup 提交。
 */
export function createDragSort(options: DragSortOptions) {
  let startY = 0
  let pressTimer: ReturnType<typeof setTimeout> | null = null
  const state = reactive<DragSortState>({ pressingIndex: null, draggingIndex: null, overIndex: null })

  function handleDown(index: number, e: PointerLike): void {
    if (!options.enabled()) return
    startY = e.clientY
    state.pressingIndex = index
    pressTimer = setTimeout(() => {
      state.draggingIndex = index
      state.overIndex = index
      pressTimer = null
    }, DRAG_LONG_PRESS_MS)
  }

  function handleMove(e: PointerLike): void {
    if (state.draggingIndex === null) return
    const shift = Math.round((e.clientY - startY) / DRAG_ROW_HEIGHT)
    const max = Math.max(0, options.rowCount() - 1)
    state.overIndex = Math.min(max, Math.max(0, state.draggingIndex + shift))
  }

  function handleUp(): void {
    if (pressTimer !== null) {
      clearTimeout(pressTimer)
      pressTimer = null
    }
    if (state.draggingIndex !== null && state.overIndex !== null && state.draggingIndex !== state.overIndex) {
      options.onDrop(state.draggingIndex, state.overIndex)
    }
    state.pressingIndex = null
    state.draggingIndex = null
    state.overIndex = null
  }

  return { state, handleDown, handleMove, handleUp }
}

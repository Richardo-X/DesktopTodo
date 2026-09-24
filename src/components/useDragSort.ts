import { reactive } from 'vue'

/** 长按阈值：长按手柄 230ms 后进入拖动（决策#13，原型 v3.1 灵敏度） */
export const DRAG_LONG_PRESS_MS = 230

/** 相邻换位触发距离：指针越过相邻行边缘 4px 即换位（触碰即换，无需越过中线，决策#13） */
export const SWAP_EDGE_PX = 4

/** 指针位移去抖：小于该值忽略，避免抖动误换位 */
const MOVE_EPSILON_PX = 2

export interface DragSortState {
  pressingIndex: number | null
  /** 拖拽项当前实时索引（随相邻换位增量变化） */
  draggingIndex: number | null
}

/** 行矩形（视口坐标），由 UI 层从列表 DOM 查询后提供 */
export interface RowRect {
  top: number
  bottom: number
}

export interface DragSortOptions {
  /** 批量模式下禁用（互斥，决策#10） */
  enabled: () => boolean
  rowCount: () => number
  /** 行矩形取值器；返回 null 表示该位置无相邻行（列表边界） */
  rowRect: (index: number) => RowRect | null
  /** 相邻换位：from 与 to（=from±1）交换；UI 层提交 store 并做 FLIP 动画 */
  onSwap: (from: number, to: number) => void
}

interface PointerLike {
  clientY: number
}

/**
 * 长按拖拽排序状态机（决策#13，语义对齐原型 v3.1.2 bindGrip）：
 * pointerdown →（230ms）→ 拖动；启动前的移动不取消长按；
 * 拖动中指针触碰相邻行边缘 4px 内 → 增量换位一次；pointerup 清理。
 */
export function createDragSort(options: DragSortOptions) {
  let lastY = 0
  let pressTimer: ReturnType<typeof setTimeout> | null = null
  const state = reactive<DragSortState>({ pressingIndex: null, draggingIndex: null })

  function handleDown(index: number, e: PointerLike): void {
    if (!options.enabled()) return
    lastY = e.clientY
    state.pressingIndex = index
    pressTimer = setTimeout(() => {
      state.draggingIndex = index
      pressTimer = null
    }, DRAG_LONG_PRESS_MS)
  }

  function handleMove(e: PointerLike): void {
    const src = state.draggingIndex
    if (src === null) return
    const dy = e.clientY - lastY
    if (Math.abs(dy) < MOVE_EPSILON_PX) return
    lastY = e.clientY
    if (dy > 0) {
      const below = options.rowRect(src + 1)
      if (below !== null && e.clientY > below.top + SWAP_EDGE_PX) swap(src, src + 1)
    } else {
      const above = options.rowRect(src - 1)
      if (above !== null && e.clientY < above.bottom - SWAP_EDGE_PX) swap(src, src - 1)
    }
  }

  function swap(from: number, to: number): void {
    if (to < 0 || to >= options.rowCount()) return
    state.draggingIndex = to
    options.onSwap(from, to)
  }

  function handleUp(): void {
    if (pressTimer !== null) {
      clearTimeout(pressTimer)
      pressTimer = null
    }
    state.pressingIndex = null
    state.draggingIndex = null
  }

  return { state, handleDown, handleMove, handleUp }
}

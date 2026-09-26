import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ChildKind } from '../ipc/contract'
import { getApi } from '../services/api'
import { initialTuckState, reduceTuck, type TuckEvent, type TuckState } from '../core/utils/tuck'

/** 界面状态：批量删除模式（按目标列表隔离）、确认框与子窗口打开 */
export type BatchTarget = 'todos' | 'templates' | 'history'

export const useUiStore = defineStore('ui', () => {
  const batchTarget = ref<BatchTarget | null>(null)
  const selectedIds = ref<string[]>([])
  const confirmState = ref<{ message: string; resolve: (v: boolean) => void } | null>(null)

  // —— 贴边缩进状态机（§5-I，纯归约 + 宿主 tick） ——
  const tuck = ref<TuckState>(initialTuckState())
  let tickTimer: ReturnType<typeof setInterval> | null = null
  // 四轮：指针最后在窗内活动的时刻——弹出/窗口尺寸变化会引发伪 mouse-leave，
  // 缩回前校验：伪离开后指针仍在窗内活动 → 取消缩回（修闪烁与提前缩回）
  let lastPointerInsideAt = 0

  function dispatchTuck(e: TuckEvent): void {
    let event = e
    if (e.type === 'tick' && tuck.value.leaveAt !== null && lastPointerInsideAt > tuck.value.leaveAt) {
      // 指针在伪离开后仍在窗内活动 → 视为在组件上，取消这次缩回
      event = { type: 'mouse-enter', now: e.now }
    }
    const prevTucked = tuck.value.tucked
    tuck.value = reduceTuck(tuck.value, event)
    // 仅在 tucked 实际变化时同步主进程：事件乱序时旧状态不得回弹窗口（CI 反馈环根因）
    if (tuck.value.tucked !== prevTucked) void getApi().setTucked(tuck.value.tucked)
    if (tuck.value.leaveAt !== null && tickTimer === null) {
      tickTimer = setInterval(() => {
        dispatchTuck({ type: 'tick', now: Date.now() })
        if (tuck.value.leaveAt === null && tickTimer !== null) {
          clearInterval(tickTimer)
          tickTimer = null
        }
      }, 100)
    }
  }

  /** 装配系统事件（吸附变化/子窗口关闭/指针活动记录） */
  function initSystemEvents(): void {
    getApi().onSnapChanged((snapped) => dispatchTuck({ type: snapped ? 'snap' : 'unsnap' }))
    getApi().onChildClosed(() => dispatchTuck({ type: 'child-closed' }))
    // 三轮8.2-1：主进程窗口移动事件 → moving 抑制（修拖动中伪 leave 误缩回）
    getApi().onWindowMoving((now) => dispatchTuck({ type: 'window-move', now }))
    // 四轮：记录指针在窗内的最后活动时刻（缩回前校验用）
    window.addEventListener('pointermove', () => {
      lastPointerInsideAt = Date.now()
    })
  }

  function mouseLeave(): void {
    dispatchTuck({ type: 'mouse-leave', now: Date.now() })
  }

  function mouseEnter(): void {
    dispatchTuck({ type: 'mouse-enter', now: Date.now() })
  }

  /** 是否处于批量模式（任意列表） */
  const batchMode = computed(() => batchTarget.value !== null)

  /** 应用内确认框（替代原生 confirm）；resolve(true)=确定 */
  function confirm(message: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      confirmState.value = { message, resolve }
    })
  }

  function answerConfirm(v: boolean): void {
    const c = confirmState.value
    confirmState.value = null
    c?.resolve(v)
  }

  function enterBatch(target: BatchTarget): void {
    batchTarget.value = target
    selectedIds.value = []
  }

  function exitBatch(): void {
    batchTarget.value = null
    selectedIds.value = []
  }

  function toggleSelect(id: string): void {
    selectedIds.value = selectedIds.value.includes(id)
      ? selectedIds.value.filter((x) => x !== id)
      : [...selectedIds.value, id]
  }

  function selectAll(ids: string[]): void {
    selectedIds.value = [...ids]
  }

  async function openChild(kind: ChildKind, id?: string): Promise<void> {
    // 缩进状态机：打开子窗口立即弹出（I4）
    dispatchTuck({ type: 'child-open' })
    await getApi().openChild({ kind, id })
  }

  return {
    tuck,
    dispatchTuck,
    initSystemEvents,
    mouseLeave,
    mouseEnter,
    batchTarget,
    batchMode,
    selectedIds,
    confirmState,
    confirm,
    answerConfirm,
    enterBatch,
    exitBatch,
    toggleSelect,
    selectAll,
    openChild
  }
})

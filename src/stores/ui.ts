import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ChildKind } from '../ipc/contract'
import { getApi } from '../services/api'

/** 界面状态：批量删除模式（按目标列表隔离）、确认框与子窗口打开 */
export type BatchTarget = 'todos' | 'templates' | 'history'

export const useUiStore = defineStore('ui', () => {
  const batchTarget = ref<BatchTarget | null>(null)
  const selectedIds = ref<string[]>([])
  const confirmState = ref<{ message: string; resolve: (v: boolean) => void } | null>(null)

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
    await getApi().openChild({ kind, id })
  }

  return {
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

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ChildKind } from '../ipc/contract'
import { getApi } from '../services/api'

/** 界面状态：批量删除模式与子窗口打开 */
export const useUiStore = defineStore('ui', () => {
  const batchMode = ref(false)
  const selectedIds = ref<string[]>([])

  function enterBatch(): void {
    batchMode.value = true
    selectedIds.value = []
  }

  function exitBatch(): void {
    batchMode.value = false
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

  return { batchMode, selectedIds, enterBatch, exitBatch, toggleSelect, selectAll, openChild }
})

import type { IRepository } from '../interfaces/repository'

function clone<T>(value: T): T {
  return structuredClone(value)
}

/** 内存实现：单元测试与默认态使用 */
export class MemoryRepository<T> implements IRepository<T> {
  #data: T | null = null

  constructor(initial?: T) {
    this.#data = initial === undefined ? null : clone(initial)
  }

  async load(): Promise<T | null> {
    return this.#data === null ? null : clone(this.#data)
  }

  async save(data: T): Promise<void> {
    this.#data = clone(data)
  }

  async flush(): Promise<void> {
    /* 内存实现无落盘 */
  }
}

/**
 * 仓储抽象：单元测试用内存实现（MemoryRepository），
 * 生产用文件实现（FileRepository，原子写 + 防抖 flush）。（开发计划 §2.4）
 */
export interface IRepository<T> {
  /** 读取持久化数据；无数据文件（首次启动）返回 null */
  load(): Promise<T | null>
  /** 写入持久化数据（实现方需保证原子性） */
  save(data: T): Promise<void>
  /** 强制把防抖中未落盘的变更刷盘（退出前调用） */
  flush(): Promise<void>
}

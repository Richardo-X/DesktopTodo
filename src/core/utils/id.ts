/** 全局唯一 id（RFC 4122 v4；Node/浏览器双环境可用） */
export function newId(): string {
  return crypto.randomUUID()
}

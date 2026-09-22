import { deflateSync } from 'node:zlib'

/**
 * 运行时生成托盘占位图标（附录 B1：蓝底白勾，可随时替换素材）。
 * 无外部素材依赖：手写 PNG 编码（RGBA8，zlib deflate）。
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'latin1')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/** RGBA 像素 → PNG 文件字节 */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const BG = [0x2f, 0x6f, 0xed] // 蓝底
const WHITE = [255, 255, 255]

/** 蓝底圆角方块 + 白色对勾的 RGBA 像素 */
export function drawIconRgba(size: number): Uint8Array {
  const rgba = new Uint8Array(size * size * 4)
  const radius = size * 0.22
  const put = (x: number, y: number, rgb: number[], a: number): void => {
    const i = (y * size + x) * 4
    rgba[i] = rgb[0]
    rgba[i + 1] = rgb[1]
    rgba[i + 2] = rgb[2]
    rgba[i + 3] = a
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 圆角方块遮罩
      const dx = Math.max(radius - x, x - (size - 1 - radius), 0)
      const dy = Math.max(radius - y, y - (size - 1 - radius), 0)
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > radius) continue
      put(x, y, BG, 255)
    }
  }

  // 对勾：两段线段 (0.28,0.54)→(0.44,0.70)→(0.72,0.34)，线宽 ~10%
  const segs: Array<[number, number, number, number]> = [
    [size * 0.28, size * 0.54, size * 0.44, size * 0.7],
    [size * 0.44, size * 0.7, size * 0.72, size * 0.34]
  ]
  const half = size * 0.05
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (const [x1, y1, x2, y2] of segs) {
        const vx = x2 - x1
        const vy = y2 - y1
        const t = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / (vx * vx + vy * vy)))
        const px = x1 + t * vx
        const py = y1 + t * vy
        const dist = Math.hypot(x - px, y - py)
        if (dist <= half) put(x, y, WHITE, 255)
      }
    }
  }
  return rgba
}

/** 托盘图标 PNG 字节（32×32） */
export function trayIconPng(size = 32): Buffer {
  return encodePng(size, size, drawIconRgba(size))
}

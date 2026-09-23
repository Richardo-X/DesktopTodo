/* eslint-disable */
/**
 * 生成应用占位图标 build/icon.ico（蓝底白勾，附录 B1）。
 * 自包含实现 PNG（256 档）+ BMP(DIB)（16~128 档）编码，无外部依赖。
 * 用法：node scripts/gen-icon.cjs [输出路径]
 */
const { deflateSync } = require('node:zlib')
const { mkdirSync, writeFileSync } = require('node:fs')
const { dirname, resolve } = require('node:path')

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const tb = Buffer.from(type, 'latin1')
  const cb = Buffer.alloc(4)
  cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0)
  return Buffer.concat([len, tb, data, cb])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const BG = [0x2f, 0x6f, 0xed]
const WHITE = [255, 255, 255]

function drawRgba(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const radius = size * 0.22
  const put = (x, y, rgb, a) => {
    const i = (y * size + x) * 4
    rgba[i] = rgb[0]
    rgba[i + 1] = rgb[1]
    rgba[i + 2] = rgb[2]
    rgba[i + 3] = a
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(radius - x, x - (size - 1 - radius), 0)
      const dy = Math.max(radius - y, y - (size - 1 - radius), 0)
      if (Math.sqrt(dx * dx + dy * dy) > radius) continue
      put(x, y, BG, 255)
    }
  }
  const segs = [
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
        const dist = Math.hypot(x - (x1 + t * vx), y - (y1 + t * vy))
        if (dist <= half) put(x, y, WHITE, 255)
      }
    }
  }
  return rgba
}

/** ICO DIB（BMP）条目：底上行 BGRA + AND 掩码 */
function dibEntry(size) {
  const rgba = drawRgba(size)
  const xorStride = size * 4
  const maskStride = Math.ceil(size / 32) * 4
  const xor = Buffer.alloc(xorStride * size)
  for (let y = 0; y < size; y++) {
    const srcY = size - 1 - y
    for (let x = 0; x < size; x++) {
      const si = (srcY * size + x) * 4
      const di = (y * size + x) * 4
      xor[di] = rgba[si + 2]
      xor[di + 1] = rgba[si + 1]
      xor[di + 2] = rgba[si]
      xor[di + 3] = rgba[si + 3]
    }
  }
  const mask = Buffer.alloc(maskStride * size)
  const h = Buffer.alloc(40)
  h.writeUInt32LE(40, 0)
  h.writeInt32LE(size, 4)
  h.writeInt32LE(size * 2, 8)
  h.writeUInt16LE(1, 12)
  h.writeUInt16LE(32, 14)
  h.writeUInt32LE(xor.length + mask.length, 20)
  return Buffer.concat([h, xor, mask])
}

function pngEntry(size) {
  return encodePng(size, size, drawRgba(size))
}

function buildIco(sizes) {
  const entries = sizes.map((s) => ({
    size: s,
    data: s >= 256 ? pngEntry(s) : dibEntry(s)
  }))
  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0)
  dir.writeUInt16LE(1, 2)
  dir.writeUInt16LE(entries.length, 4)
  const offset = 6 + entries.length * 16
  const dirEntries = []
  let cur = offset
  for (const e of entries) {
    const d = Buffer.alloc(16)
    d[0] = e.size >= 256 ? 0 : e.size
    d[1] = e.size >= 256 ? 0 : e.size
    d[2] = 0
    d[3] = 0
    d.writeUInt16LE(1, 4)
    d.writeUInt16LE(32, 6)
    d.writeUInt32LE(e.data.length, 8)
    d.writeUInt32LE(cur, 12)
    cur += e.data.length
    dirEntries.push(d)
  }
  return Buffer.concat([dir, ...dirEntries, ...entries.map((e) => e.data)])
}

const out = resolve(process.argv[2] ?? 'build/icon.ico')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, buildIco([16, 24, 32, 48, 64, 128, 256]))
console.log('icon written:', out)

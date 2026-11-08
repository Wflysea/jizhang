/**
 * 零依赖的 ZIP 工具（仅 store 存储，不压缩）
 *
 * 背景：本应用导出的「凭证图片」已是 JPEG（本身已压缩），再用 deflate 压缩收益极低，
 * 因此这里只用 store 方式打包，既简单又足够快，且不引入任何第三方库。
 *
 * - zipStore(files): 把多个 { name, bytes:Uint8Array } 打包成 ZIP（Uint8Array）
 * - unzip(bytes):    解包 ZIP，返回 { 文件名: Uint8Array }（仅支持 store 项）
 * - bytesToBase64 / base64ToBytes: 二进制与 base64 互转（中文安全）
 * - dataUrlToBytes / bytesToDataUrl: 图片 dataURL 与二进制互转
 */

/* ---------- base64 ---------- */
export function bytesToBase64(bytes) {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export function base64ToBytes(base64) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/* ---------- dataURL ---------- */
const DATA_URL_RE = /^data:([^;,]*)?(;base64)?,(.*)$/s

/** dataURL → { mime, bytes }；非 dataURL 时返回 null */
export function dataUrlToBytes(dataUrl) {
  const m = String(dataUrl || '').match(DATA_URL_RE)
  if (!m) return null
  const mime = (m[1] || 'application/octet-stream').trim()
  const isB64 = !!m[2]
  const payload = m[3]
  const bytes = isB64 ? base64ToBytes(payload) : new TextEncoder().encode(decodeURIComponent(payload))
  return { mime, bytes }
}

export function bytesToDataUrl(mime, bytes) {
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}

/** 根据 mime 推断扩展名 */
export function extOfMime(mime) {
  const m = String(mime || '').toLowerCase()
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('gif')) return 'gif'
  return 'jpg'
}

/* ---------- CRC32 ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)
  }
  return (c ^ 0xFFFFFFFF) >>> 0
}

/* ---------- 打包 ---------- */
const enc = new TextEncoder()

/**
 * 打包 ZIP（store）
 * @param {Array<{name:string, bytes:Uint8Array}>} files
 * @returns {Uint8Array} 完整的 ZIP 文件二进制
 */
export function zipStore(files) {
  const local = []
  const central = []
  let offset = 0

  for (const f of files) {
    const nameBytes = enc.encode(f.name)
    const data = f.bytes
    const crc = crc32(data)
    const size = data.length

    const lh = new Uint8Array(30 + nameBytes.length)
    const dv = new DataView(lh.buffer)
    dv.setUint32(0, 0x04034B50, true)   // 本地文件头签名
    dv.setUint16(4, 20, true)            // 版本
    dv.setUint16(6, 0, true)             // 通用标志
    dv.setUint16(8, 0, true)             // 压缩方式：store
    dv.setUint16(10, 0, true)            // 修改时间
    dv.setUint16(12, 0, true)            // 修改日期
    dv.setUint32(14, crc, true)
    dv.setUint32(18, size, true)         // 压缩后大小
    dv.setUint32(22, size, true)         // 未压缩大小
    dv.setUint16(26, nameBytes.length, true)
    dv.setUint16(28, 0, true)            // 扩展字段长度
    lh.set(nameBytes, 30)
    local.push(lh, data)

    const ch = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(ch.buffer)
    cv.setUint32(0, 0x02014B50, true)    // 中央目录头签名
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint16(38, 0, true)
    cv.setUint32(40, offset, true)       // 本地文件头偏移
    ch.set(nameBytes, 46)
    central.push(ch)

    offset += lh.length + data.length
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0)
  const centralOffset = offset

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054B50, true)      // 结束中央目录签名
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, centralOffset, true)

  const total = local.reduce((s, c) => s + c.length, 0) + centralSize + eocd.length
  const out = new Uint8Array(total)
  let p = 0
  for (const c of [...local, ...central, eocd]) { out.set(c, p); p += c.length }
  return out
}

/* ---------- 解包 ---------- */
const dec = new TextDecoder()

/**
 * 解包 ZIP（仅支持 store 项；遇到 deflate 项返回 null 表示无法读取）
 * @param {Uint8Array} bytes
 * @returns {Object<string, Uint8Array|null>}
 */
export function unzip(bytes) {
  const files = {}
  let i = 0
  while (i + 4 <= bytes.length) {
    const sig = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)
    if (sig !== 0x04034B50) break       // 不再是本地文件头 → 结束

    const dv = new DataView(bytes.buffer, bytes.byteOffset + i, bytes.byteLength - i)
    const method = dv.getUint16(8, true)
    const compSize = dv.getUint32(18, true)
    const nameLen = dv.getUint16(26, true)
    const extraLen = dv.getUint16(28, true)
    const name = dec.decode(bytes.subarray(i + 30, i + 30 + nameLen))
    const contentStart = i + 30 + nameLen + extraLen

    if (method === 0) {
      files[name] = bytes.subarray(contentStart, contentStart + compSize)
    } else {
      files[name] = null                // deflate 不在本工具支持范围
    }
    i = contentStart + compSize
  }
  return files
}

/** 判断二进制是否为 ZIP（PK\x03\x04） */
export function isZip(bytes) {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04
}

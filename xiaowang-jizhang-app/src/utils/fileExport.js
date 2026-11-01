/**
 * 统一文件导出
 *
 * 背景：安卓 WebView 里 <a download> 不会触发系统下载，
 * 表现为「点了没反应、文件也找不到」。因此：
 * - 原生（App 内）：写文件到缓存目录 → 调系统分享面板，由用户选择保存位置/发送方式
 * - Web（浏览器预览）：仍走 Blob 下载
 */
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/** UTF-8 字符串 → base64（中文安全） */
export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** base64 → Blob（Web 下载用） */
function base64ToBlob(base64, mime) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function webDownload(filename, base64, mime) {
  const url = URL.createObjectURL(base64ToBlob(base64, mime))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 导出文件
 * @param {string} filename 文件名（含扩展名）
 * @param {string} base64   文件内容（base64）
 * @param {string} mime     MIME 类型
 * @returns {Promise<'web'|'shared'|'saved'>} 导出方式，便于给出对应提示
 */
export async function exportFile(filename, base64, mime) {
  if (!Capacitor.isNativePlatform()) {
    webDownload(filename, base64, mime)
    return 'web'
  }

  // 1) 写到缓存目录（无需任何权限）
  const safe = filename.replace(/[\\/:*?"<>|]/g, '_')
  const written = await Filesystem.writeFile({
    path: safe,
    data: base64,
    directory: Directory.Cache,
    recursive: true
  })

  // 2) 系统分享面板：可保存到本地、发微信、传网盘等
  const canShare = await Share.canShare()
  if (canShare.value) {
    try {
      await Share.share({
        title: safe,
        files: [written.uri],
        dialogTitle: '导出文件'
      })
      return 'shared'
    } catch (e) {
      // 用户取消分享面板也会走到这里，不算失败，继续走兜底
      if (!/cancel/i.test(String(e && e.message))) throw e
    }
  }

  // 3) 兜底：写到 Documents（用文件管理器可访问），并告知路径
  const doc = await Filesystem.writeFile({
    path: safe,
    data: base64,
    directory: Directory.Documents,
    recursive: true
  })
  return 'saved:' + doc.uri
}

/** 原生环境下导出后的提示文案 */
export function exportToast(result, filename) {
  if (result === 'web') return `已导出 ${filename}`
  if (result === 'shared') return '请在系统面板中选择保存位置'
  if (String(result).startsWith('saved:')) return `已保存到 ${String(result).slice(6)}`
  return '导出完成'
}

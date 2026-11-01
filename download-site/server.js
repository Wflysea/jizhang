/* 零依赖静态服务器：为 APK 提供正确 MIME 与断点续传（Range）支持 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const PORT = process.env.PORT || 3000
const CHUNK = 64 * 1024

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive',
  '.txt': 'text/plain; charset=utf-8'
}

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0])
  if (rel === '/' || rel === '') rel = '/index.html'

  const filePath = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''))
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden')
    return
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<h1>404</h1><p>文件不存在</p>')
      return
    }

    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    const range = req.headers.range

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range)
      const start = m[1] ? parseInt(m[1], 10) : 0
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1
      if (start >= stat.size || end >= stat.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end()
        return
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes'
      })
      fs.createReadStream(filePath, { start, end }).pipe(res)
      return
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    })
    fs.createReadStream(filePath, { highWaterMark: CHUNK }).pipe(res)
  })
}).listen(PORT, '0.0.0.0', () => {
  console.log(`download site running on ${PORT}`)
})

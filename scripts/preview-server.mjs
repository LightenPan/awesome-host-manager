import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT) || 4173
const host = process.env.HOST || '127.0.0.1'
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  let pathname

  try {
    pathname = decodeURIComponent(requestUrl.pathname)
  } catch {
    sendText(response, 400, 'Bad request')
    return
  }

  if (pathname === '/') {
    response.writeHead(302, { Location: '/preview/' })
    response.end()
    return
  }

  if (pathname.endsWith('/')) pathname += 'index.html'

  const filePath = path.resolve(rootDir, `.${pathname}`)
  if (!filePath.startsWith(`${rootDir}${path.sep}`)) {
    sendText(response, 403, 'Forbidden')
    return
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      sendText(response, 404, 'Not found')
      return
    }

    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream'
    })

    if (request.method === 'HEAD') {
      response.end()
      return
    }

    fs.createReadStream(filePath)
      .on('error', () => {
        if (!response.headersSent) sendText(response, 500, 'Read error')
        else response.destroy()
      })
      .pipe(response)
  })
})

function sendText(response, status, message) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8'
  })
  response.end(message)
}

server.listen(port, host, () => {
  console.log(`Design previews: http://${host}:${port}/preview/`)
})

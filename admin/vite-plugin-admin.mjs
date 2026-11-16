// 로컬 관리 화면(/admin)용 API. `yarn dev`(vite serve)에서만 켜지고 `yarn build` 결과물에는 들어가지 않는다.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024

function readBody (req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        reject(Object.assign(new Error(`파일이 너무 커 (최대 ${Math.round(limit / 1024 / 1024)}MB)`), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const readJsonBody = async req => {
  const buf = await readBody(req, 1024 * 1024)
  return buf.length ? JSON.parse(buf.toString('utf8')) : {}
}

function send (res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export default function adminPlugin () {
  return {
    name: 'storage-jjal-admin',
    apply: 'serve',
    configureServer (server) {
      const store = require('./server/store.js')
      const staging = require('./server/staging.js')
      const git = require('./server/git.js')
      const { suggestTags } = require('./server/suggest-tags.js')
      staging.resumePending()

      // 관리 화면이 sources/*.json 을 고칠 때마다 Vite 가 페이지를 새로고침하지 않도록 감시에서 뺀다.
      server.watcher.unwatch([path.join(store.DATA_DIR, 'sources'), path.join(store.DATA_DIR, 'data.json'), staging.STAGING_DIR])

      // 대기 중인 짤 미리보기 파일
      server.middlewares.use('/__admin/staging', (req, res, next) => {
        const name = decodeURIComponent((req.url || '').split('?')[0].replace(/^\//, ''))
        if (!/^[0-9a-f-]{36}\.(gif|jpg|png|webp)$/.test(name)) return next()
        const p = path.join(staging.STAGING_DIR, name)
        if (!fs.existsSync(p)) return next()
        const type = { gif: 'image/gif', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[name.split('.').pop()]
        res.setHeader('Content-Type', type)
        res.setHeader('Cache-Control', 'no-store')
        fs.createReadStream(p).pipe(res)
      })

      const routes = [
        ['GET', /^\/images$/, () => ({ images: store.listImages(), taxonomy: store.readTaxonomy() })],
        ['PUT', /^\/images\/(\d+)$/, async (req, [id]) => ({ image: store.updateImage(id, await readJsonBody(req)) })],
        ['POST', /^\/images\/(\d+)\/suggest$/, async (req, [id]) => {
          const rec = store.findImage(id)
          if (!rec) throw Object.assign(new Error(`id ${id} 짤이 없어`), { status: 404 })
          const { hint } = await readJsonBody(req)
          return { draft: await suggestTags(path.join(store.PUBLIC_DIR, rec.file), { hint }) }
        }],
        ['POST', /^\/taxonomy$/, async req => {
          const { axis, ko, en } = await readJsonBody(req)
          return { taxonomy: store.addTaxonomyItem(axis, ko, en || []) }
        }],
        ['GET', /^\/uploads$/, () => ({ uploads: staging.listStaged() })],
        ['POST', /^\/uploads$/, async req => {
          const name = decodeURIComponent(req.headers['x-filename'] || '')
          return { upload: await staging.stageUpload(await readBody(req, MAX_UPLOAD_BYTES), name) }
        }],
        ['POST', /^\/uploads\/([0-9a-f-]{36})\/suggest$/, async (req, [id]) => {
          const { hint } = await readJsonBody(req)
          return { upload: staging.retrySuggestion(id, hint) }
        }],
        ['POST', /^\/uploads\/([0-9a-f-]{36})\/commit$/, async (req, [id]) => ({ image: await staging.commitStaged(id, await readJsonBody(req)) })],
        ['DELETE', /^\/uploads\/([0-9a-f-]{36})$/, (req, [id]) => { staging.removeStaged(id); return { ok: true } }],
        ['GET', /^\/git$/, () => git.status()],
        ['POST', /^\/git\/publish$/, async req => git.publish(await readJsonBody(req))],
      ]

      server.middlewares.use('/__admin/api', async (req, res) => {
        const url = (req.url || '').split('?')[0]
        for (const [method, re, handler] of routes) {
          const m = url.match(re)
          if (!m || req.method !== method) continue
          try {
            send(res, 200, await handler(req, m.slice(1)))
          } catch (e) {
            send(res, e.status || 500, { error: e.message })
          }
          return
        }
        send(res, 404, { error: `알 수 없는 API: ${req.method} ${url}` })
      })
    },
  }
}

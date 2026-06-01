import express from 'express'
import cors from 'cors'
import path from 'path'
import config from './config.js'
import blogRoutes from './routes/blog.js'
import { initStorage, blogRoot } from './services/indexService.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.use('/api/blog', blogRoutes)

app.use('/storage', async (req, res, next) => {
  try {
    const root = await blogRoot()
    const rel = decodeURIComponent(req.path.replace(/^\//, ''))
    if (!rel || rel.includes('..')) {
      return res.status(403).send('Forbidden')
    }
    const filePath = path.resolve(root, rel)
    if (!filePath.startsWith(path.resolve(root) + path.sep)) {
      return res.status(403).send('Forbidden')
    }
    res.sendFile(filePath, (err) => {
      if (err) next()
    })
  } catch (err) {
    next(err)
  }
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

await initStorage()

const server = app.listen(config.port, () => {
  console.log(`Blog API server running at http://localhost:${config.port}`)
})

server.on('error', (err) => {
  if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EADDRINUSE') {
    console.error(
      `[api] 端口 ${config.port} 已被占用，请先结束旧进程：lsof -ti :${config.port} | xargs kill`,
    )
  } else {
    console.error('[api] 服务启动失败:', err.message)
  }
  process.exit(1)
})

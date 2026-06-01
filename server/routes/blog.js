import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import config from '../config.js'
import {
  listArticles,
  getArticleDetail,
  saveArticle,
  deleteArticle,
  saveImage,
  readIndex,
  rebuildIndex,
} from '../services/blogService.js'
import { importArticles } from '../services/importService.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = /\.(png|jpe?g|webp)$/i.test(file.originalname)
    cb(null, allowed)
  },
})

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.importMaxImageSize,
    files: 500,
  },
})

router.get('/list', async (req, res) => {
  try {
    const data = await listArticles(req.query)
    res.json({ code: 0, data })
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message })
  }
})

router.get('/index', async (_req, res) => {
  try {
    const data = await readIndex()
    res.json({ code: 0, data })
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message })
  }
})

router.post('/rebuild-index', async (_req, res) => {
  try {
    const data = await rebuildIndex()
    res.json({ code: 0, data, message: '索引重建成功' })
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message })
  }
})

router.get('/detail/:id', async (req, res) => {
  try {
    const data = await getArticleDetail(req.params.id)
    if (!data) {
      return res.status(404).json({ code: 404, message: '文章不存在' })
    }
    res.json({ code: 0, data })
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message })
  }
})

router.post('/save', async (req, res) => {
  try {
    const data = await saveArticle(req.body)
    const message =
      req.body.saveMode === 'manual' && req.body.status === 'published'
        ? '发布成功'
        : '保存成功'
    res.json({ code: 0, data, message })
  } catch (err) {
    const status = err.statusCode || 500
    res.status(status).json({ code: status, message: err.message })
  }
})

router.delete('/delete/:id', async (req, res) => {
  try {
    await deleteArticle(req.params.id)
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    const status = err.statusCode || 500
    res.status(status).json({ code: status, message: err.message })
  }
})

router.post('/import', importUpload.array('files', 500), async (req, res) => {
  try {
    let paths = []
    try {
      paths = JSON.parse(req.body?.paths || '[]')
    } catch {
      paths = []
    }
    const data = await importArticles(req.files || [], {
      mode: req.body?.mode,
      status: req.body?.status,
      paths: Array.isArray(paths) ? paths : [],
      folderName: req.body?.folderName,
    })
    const { successCount, skippedCount, failedCount } = data
    res.json({
      code: 0,
      data,
      message: `导入完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}`,
    })
  } catch (err) {
    const status = err.statusCode || 500
    res.status(status).json({ code: status, message: err.message })
  }
})

router.post('/upload/img', upload.single('file'), async (req, res) => {
  try {
    const articleId = req.body.articleId
    if (!articleId) {
      return res.status(400).json({ code: 400, message: '缺少 articleId' })
    }
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传 png/jpg/jpeg/webp 图片，且不超过 5MB' })
    }
    const ext = path.extname(req.file.originalname) || '.png'
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
    const result = await saveImage(articleId, filename, req.file.buffer)
    res.json({ code: 0, data: result })
  } catch (err) {
    const status = err.statusCode || 500
    res.status(status).json({ code: status, message: err.message })
  }
})

export default router

import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import config from '../config.js'
import {
  sanitizeFolderName,
  resolveUniqueFolderName,
  assertSafeArticlePath,
  DEFAULT_TITLE,
} from '../utils/folder.js'
import {
  readIndex,
  writeIndex,
  upsertArticle,
  removeArticle,
  removeTempById,
  rebuildIndex,
  blogRoot,
  addTagIfNew,
  collectTags,
  normalizeTags,
} from './indexService.js'
import { resolveContentAssetUrls } from '../utils/contentAssets.js'

/** @returns {string} */
function savedZone() {
  return config.savedDirName
}

/** @returns {string} */
function tempZone() {
  return config.tempDraftDirName
}

/**
 * @param {string} id
 */
export async function findArticleLocation(id) {
  const index = await readIndex()
  const entry = index.articles.find((a) => a.id === id)
  if (entry) {
    const root = await blogRoot()
    const full = path.join(root, entry.path)
    try {
      await fs.access(full)
      return { dir: full, entry, source: entry.source }
    } catch {
      /* fall through */
    }
  }

  const root = await blogRoot()
  for (const [zone, source] of [
    [savedZone(), 'saved'],
    [tempZone(), 'temp'],
  ]) {
    const zonePath = path.join(root, zone)
    let folders = []
    try {
      folders = await fs.readdir(zonePath, { withFileTypes: true })
    } catch {
      continue
    }
    for (const f of folders) {
      if (!f.isDirectory()) continue
      const dir = path.join(zonePath, f.name)
      try {
        const meta = JSON.parse(
          await fs.readFile(path.join(dir, 'meta.json'), 'utf8'),
        )
        if (meta.id === id) {
          return {
            dir,
            entry: entry ?? null,
            source: source === 'saved' ? 'saved' : 'temp',
          }
        }
      } catch {
        /* skip */
      }
    }
  }
  return null
}

/**
 * @param {Object} params
 */
export async function getArticleDetail(id) {
  const loc = await findArticleLocation(id)
  if (!loc) return null

  const meta = JSON.parse(
    await fs.readFile(path.join(loc.dir, 'meta.json'), 'utf8'),
  )
  let content = ''
  try {
    content = await fs.readFile(path.join(loc.dir, 'content.md'), 'utf8')
  } catch {
    content = ''
  }

  const root = await blogRoot()
  const relPath = path.relative(root, loc.dir).replace(/\\/g, '/')

  return {
    ...meta,
    tags: normalizeTags(meta.tags, meta.category),
    content: resolveContentAssetUrls(content, relPath),
    source: loc.source,
    path: relPath,
  }
}

/**
 * @param {Object} query
 */
export async function listArticles(query = {}) {
  let index
  try {
    index = await readIndex()
    if (!index.articles) throw new Error('invalid')
  } catch {
    index = await rebuildIndex()
  }

  const page = Math.max(1, parseInt(String(query.page || 1), 10) || 1)
  const size = Math.max(1, Math.min(100, parseInt(String(query.size || 10), 10) || 10))
  const status = query.status
  const keyword = (query.keyword || '').trim().toLowerCase()
  const source = query.source
  const tag = (query.tag || query.category || '').trim()

  let list = [...index.articles]

  if (tag) {
    list = list.filter((a) => normalizeTags(a.tags, a.category).includes(tag))
  }

  if (status === 'draft') {
    list = list.filter((a) => a.status === 'draft')
  } else if (status === 'published') {
    list = list.filter((a) => a.status === 'published')
  } else if (status === 'temp') {
    list = list.filter((a) => a.source === 'temp')
  }

  if (source === 'saved') {
    list = list.filter((a) => a.source === 'saved')
  } else if (source === 'temp') {
    list = list.filter((a) => a.source === 'temp')
  }

  if (keyword) {
    list = list.filter((a) => (a.title || '').toLowerCase().includes(keyword))
  }

  list.sort((a, b) => b.updateTime - a.updateTime)

  const total = list.length
  const start = (page - 1) * size
  const items = list.slice(start, start + size)

  return {
    items,
    total,
    page,
    size,
    totalPages: Math.ceil(total / size) || 1,
  }
}

export async function getTags() {
  const index = await readIndex()
  return collectTags(index)
}

/**
 * @param {Object} body
 */
export async function saveArticle(body) {
  const {
    id: inputId,
    title: inputTitle,
    content = '',
    status = 'draft',
    saveMode = 'manual',
    createTime: inputCreateTime,
    updateTime: inputUpdateTime,
    tags: inputTags = [],
  } = body

  const tags = normalizeTags(inputTags)

  const isAuto = saveMode === 'auto'
  const isManual = saveMode === 'manual'

  if (isManual && !(inputTitle || '').trim()) {
    const err = new Error('标题不能为空')
    err.statusCode = 400
    throw err
  }

  const displayTitle = (inputTitle || '').trim() || DEFAULT_TITLE
  const baseFolder = sanitizeFolderName(isAuto && !(inputTitle || '').trim() ? '' : inputTitle)

  const zoneName = isAuto ? tempZone() : savedZone()
  const source = isAuto ? 'temp' : 'saved'
  const root = await blogRoot()
  const zonePath = path.join(root, zoneName)

  let id = inputId || ''
  let createTime = inputCreateTime || Date.now()
  const updateTime = inputUpdateTime || Date.now()
  let existingLoc = id ? await findArticleLocation(id) : null

  if (!id) {
    id = randomUUID()
  } else if (existingLoc) {
    const meta = JSON.parse(
      await fs.readFile(path.join(existingLoc.dir, 'meta.json'), 'utf8'),
    )
    createTime = meta.createTime || createTime
  }

  let folderName = baseFolder
  let articleDir

  if (existingLoc) {
    const currentFolder = path.basename(existingLoc.dir)
    const currentZone = path.basename(path.dirname(existingLoc.dir))
    const targetZone = zoneName

    if (currentZone === targetZone && currentFolder !== baseFolder) {
      folderName = await resolveUniqueFolderName(zonePath, baseFolder, id, fs)
      const newDir = path.join(zonePath, folderName)
      await fs.rename(existingLoc.dir, newDir)
      articleDir = newDir
    } else if (currentZone !== targetZone) {
      folderName = await resolveUniqueFolderName(zonePath, baseFolder, id, fs)
      articleDir = path.join(zonePath, folderName)
      await fs.mkdir(articleDir, { recursive: true })
      await copyDir(existingLoc.dir, articleDir)
      if (isManual) {
        await removeDirSafe(existingLoc.dir)
      }
    } else {
      folderName = currentFolder
      articleDir = existingLoc.dir
    }
  } else {
    folderName = await resolveUniqueFolderName(zonePath, baseFolder, id, fs)
    articleDir = path.join(zonePath, folderName)
    await fs.mkdir(articleDir, { recursive: true })
  }

  const meta = {
    id,
    title: displayTitle,
    status: isAuto ? 'draft' : status,
    folderName,
    createTime,
    updateTime,
    tags,
  }

  await fs.writeFile(
    path.join(articleDir, 'meta.json'),
    JSON.stringify(meta, null, 2),
    'utf8',
  )
  await fs.writeFile(path.join(articleDir, 'content.md'), content, 'utf8')
  await fs.mkdir(path.join(articleDir, 'assets'), { recursive: true })

  const relPath = `${zoneName}/${folderName}`.replace(/\\/g, '/')
  const index = await readIndex()

  if (isManual) {
    removeTempById(index, id)
    const tempLoc = await findArticleInZone(id, tempZone())
    if (tempLoc) await removeDirSafe(tempLoc)
  }

  upsertArticle(index, {
    id,
    title: displayTitle,
    folderName,
    source,
    status: meta.status,
    path: relPath,
    createTime,
    updateTime,
    tags,
  })
  if (isManual) {
    for (const t of tags) {
      addTagIfNew(index, t)
    }
  }
  await writeIndex(index)

  return { ...meta, source, path: relPath }
}

/**
 * @param {string} id
 * @param {string} zone
 */
async function findArticleInZone(id, zone) {
  const root = await blogRoot()
  const zonePath = path.join(root, zone)
  let folders = []
  try {
    folders = await fs.readdir(zonePath, { withFileTypes: true })
  } catch {
    return null
  }
  for (const f of folders) {
    if (!f.isDirectory()) continue
    const dir = path.join(zonePath, f.name)
    try {
      const meta = JSON.parse(
        await fs.readFile(path.join(dir, 'meta.json'), 'utf8'),
      )
      if (meta.id === id) return dir
    } catch {
      /* skip */
    }
  }
  return null
}

/** @param {string} id */
export async function deleteArticle(id) {
  const loc = await findArticleLocation(id)
  if (!loc) {
    const err = new Error('文章不存在')
    err.statusCode = 404
    throw err
  }

  await removeDirSafe(loc.dir)

  const savedDir = await findArticleInZone(id, savedZone())
  const tempDir = await findArticleInZone(id, tempZone())
  if (savedDir && savedDir !== loc.dir) await removeDirSafe(savedDir)
  if (tempDir && tempDir !== loc.dir) await removeDirSafe(tempDir)

  const index = await readIndex()
  removeArticle(index, id)
  await writeIndex(index)
  return { success: true }
}

/**
 * @param {string} articleId
 * @param {string} destFilename
 * @param {Buffer} buffer
 */
export async function saveImage(articleId, destFilename, buffer) {
  const loc = await findArticleLocation(articleId)
  if (!loc) {
    const err = new Error('文章不存在，请先保存文章')
    err.statusCode = 404
    throw err
  }

  const assetsDir = path.join(loc.dir, 'assets')
  await fs.mkdir(assetsDir, { recursive: true })
  const safeName = destFilename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = path.join(assetsDir, safeName)
  await fs.writeFile(filePath, buffer)

  const root = await blogRoot()
  const rel = path.relative(root, filePath).replace(/\\/g, '/')
  return { url: `/storage/${rel}`, path: rel }
}

/** @param {string} dir */
async function removeDirSafe(dir) {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

/** @param {string} src @param {string} dest */
async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const ent of entries) {
    const s = path.join(src, ent.name)
    const d = path.join(dest, ent.name)
    if (ent.isDirectory()) {
      await copyDir(s, d)
    } else {
      await fs.copyFile(s, d)
    }
  }
}

export { readIndex, rebuildIndex, assertSafeArticlePath, blogRoot }

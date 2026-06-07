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
  ensureTags,
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

  if (status === 'published') {
    list = list.filter((a) => a.status === 'published')
  } else if (status === 'unpublished') {
    list = list.filter((a) => a.status !== 'published')
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
  const pageItems = list.slice(start, start + size)
  const items = await Promise.all(
    pageItems.map(async (entry) => ({
      ...entry,
      excerpt: await readArticleExcerpt(entry),
    })),
  )

  return {
    items,
    total,
    page,
    size,
    totalPages: Math.ceil(total / size) || 1,
  }
}

const LIST_EXCERPT_MAX = 150

const SEARCH_SNIPPET_BEFORE = 60
const SEARCH_SNIPPET_AFTER = 60
const SEARCH_MIN_KEYWORD_LEN = 2
const SEARCH_DEFAULT_LIMIT = 50
const SEARCH_MAX_LIMIT = 100

/**
 * @param {import('../types.js').BlogIndexArticle} entry
 */
async function readArticleExcerpt(entry) {
  try {
    const root = await blogRoot()
    const content = await fs.readFile(
      path.join(root, entry.path, 'content.md'),
      'utf8',
    )
    const plain = stripMarkdownForSnippet(content)
    if (!plain) return ''
    return plain.length > LIST_EXCERPT_MAX
      ? `${plain.slice(0, LIST_EXCERPT_MAX)}…`
      : plain
  } catch {
    return ''
  }
}

/**
 * @param {string} text
 */
function stripMarkdownForSnippet(text) {
  return text
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/```\w*\n?/g, '').slice(0, 80),
    )
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {string} content
 * @param {number} offset
 * @param {number} keywordLen
 */
function extractSearchSnippet(content, offset, keywordLen) {
  const start = Math.max(0, offset - SEARCH_SNIPPET_BEFORE)
  const end = Math.min(content.length, offset + keywordLen + SEARCH_SNIPPET_AFTER)
  let snippet = stripMarkdownForSnippet(content.slice(start, end))
  if (start > 0) snippet = `…${snippet}`
  if (end < content.length) snippet = `${snippet}…`
  return snippet
}

/**
 * @param {Object} query
 */
export async function searchArticlesContent(query = {}) {
  const keyword = (query.q || query.keyword || '').trim()
  const limit = Math.max(
    1,
    Math.min(
      SEARCH_MAX_LIMIT,
      parseInt(String(query.limit || SEARCH_DEFAULT_LIMIT), 10) || SEARCH_DEFAULT_LIMIT,
    ),
  )

  if (keyword.length < SEARCH_MIN_KEYWORD_LEN) {
    const err = new Error(`关键词至少 ${SEARCH_MIN_KEYWORD_LEN} 个字符`)
    err.statusCode = 400
    throw err
  }

  const keywordLower = keyword.toLowerCase()
  let index
  try {
    index = await readIndex()
    if (!index.articles) throw new Error('invalid')
  } catch {
    index = await rebuildIndex()
  }

  const root = await blogRoot()
  const items = []
  let totalMatches = 0
  let truncated = false

  for (const article of index.articles) {
    if (!article.path) continue

    let content = ''
    try {
      content = await fs.readFile(
        path.join(root, article.path, 'content.md'),
        'utf8',
      )
    } catch {
      continue
    }

    const contentLower = content.toLowerCase()
    let searchFrom = 0
    let matchIndex = 0

    while (searchFrom < content.length) {
      const idx = contentLower.indexOf(keywordLower, searchFrom)
      if (idx === -1) break

      totalMatches += 1

      if (items.length < limit) {
        items.push({
          id: article.id,
          title: article.title || DEFAULT_TITLE,
          snippet: extractSearchSnippet(content, idx, keyword.length),
          matchIndex,
          offset: idx,
          updateTime: article.updateTime || 0,
        })
      } else {
        truncated = true
      }

      matchIndex += 1
      searchFrom = idx + keyword.length
    }
  }

  if (totalMatches > items.length) {
    truncated = true
  }

  return {
    items,
    total: totalMatches,
    keyword,
    truncated,
  }
}

export async function getTags() {
  const index = await readIndex()
  return collectTags(index)
}

/** @returns {Promise<{ name: string, count: number }[]>} */
export async function getTagStats() {
  const index = await readIndex()
  const allTags = collectTags(index)
  const counts = new Map(allTags.map((t) => [t, 0]))
  for (const article of index.articles) {
    for (const tag of normalizeTags(article.tags, article.category)) {
      counts.set(tag, (counts.get(tag) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

/** @param {string} name */
export async function createTag(name) {
  const trimmed = (name || '').trim()
  if (!trimmed) {
    const err = new Error('分类名称不能为空')
    err.statusCode = 400
    throw err
  }
  const index = await readIndex()
  if (collectTags(index).includes(trimmed)) {
    const err = new Error('分类已存在')
    err.statusCode = 400
    throw err
  }
  addTagIfNew(index, trimmed)
  await writeIndex(index)
  return { name: trimmed }
}

/**
 * @param {string} oldName
 * @param {string} newName
 */
export async function renameTag(oldName, newName) {
  const from = (oldName || '').trim()
  const to = (newName || '').trim()
  if (!from || !to) {
    const err = new Error('分类名称不能为空')
    err.statusCode = 400
    throw err
  }
  if (from === to) return { name: to }
  const index = await readIndex()
  const allTags = collectTags(index)
  if (!allTags.includes(from)) {
    const err = new Error('原分类不存在')
    err.statusCode = 404
    throw err
  }
  if (allTags.includes(to)) {
    const err = new Error('目标分类名称已存在')
    err.statusCode = 400
    throw err
  }
  ensureTags(index)
  index.tags = index.tags.map((t) => (t === from ? to : t))
  index.tags.sort((a, b) => a.localeCompare(b, 'zh-CN'))

  let updated = 0
  for (const article of index.articles) {
    const tags = normalizeTags(article.tags, article.category)
    if (!tags.includes(from)) continue
    const nextTags = [...new Set(tags.map((t) => (t === from ? to : t)))]
    await updateArticleTagsOnDisk(article.id, nextTags)
    article.tags = nextTags
    delete article.category
    updated++
  }
  await writeIndex(index)
  return { name: to, updated }
}

/** @param {string} name */
export async function deleteTag(name) {
  const trimmed = (name || '').trim()
  if (!trimmed) {
    const err = new Error('分类名称不能为空')
    err.statusCode = 400
    throw err
  }
  const index = await readIndex()
  if (!collectTags(index).includes(trimmed)) {
    const err = new Error('分类不存在')
    err.statusCode = 404
    throw err
  }
  ensureTags(index)
  index.tags = index.tags.filter((t) => t !== trimmed)

  let updated = 0
  for (const article of index.articles) {
    const tags = normalizeTags(article.tags, article.category)
    if (!tags.includes(trimmed)) continue
    const nextTags = tags.filter((t) => t !== trimmed)
    await updateArticleTagsOnDisk(article.id, nextTags)
    article.tags = nextTags
    delete article.category
    updated++
  }
  await writeIndex(index)
  return { name: trimmed, updated }
}

/**
 * @param {Object} params
 * @param {string} params.tag
 * @param {string[]} params.articleIds
 * @param {'add'|'remove'|'set'} [params.mode]
 */
export async function assignArticlesToTag({ tag, articleIds, mode = 'add' }) {
  const tagName = (tag || '').trim()
  if (!tagName) {
    const err = new Error('请指定分类')
    err.statusCode = 400
    throw err
  }
  if (!Array.isArray(articleIds) || articleIds.length === 0) {
    const err = new Error('请选择文章')
    err.statusCode = 400
    throw err
  }
  if (!['add', 'remove', 'set'].includes(mode)) {
    const err = new Error('无效的操作模式')
    err.statusCode = 400
    throw err
  }

  const index = await readIndex()
  if (mode !== 'remove') {
    addTagIfNew(index, tagName)
  }

  let updated = 0
  const failed = []
  for (const id of articleIds) {
    const entry = index.articles.find((a) => a.id === id)
    if (!entry) {
      failed.push(id)
      continue
    }
    const current = normalizeTags(entry.tags, entry.category)
    let nextTags
    if (mode === 'add') {
      nextTags = current.includes(tagName)
        ? current
        : [...current, tagName]
    } else if (mode === 'remove') {
      nextTags = current.filter((t) => t !== tagName)
    } else {
      nextTags = [tagName]
    }
    if (JSON.stringify(current) === JSON.stringify(nextTags)) continue
    const ok = await updateArticleTagsOnDisk(id, nextTags)
    if (!ok) {
      failed.push(id)
      continue
    }
    entry.tags = nextTags
    delete entry.category
    entry.updateTime = Date.now()
    updated++
  }
  await writeIndex(index)
  return { tag: tagName, mode, updated, failed }
}

/** @param {string} id @param {string[]} tags */
async function updateArticleTagsOnDisk(id, tags) {
  const loc = await findArticleLocation(id)
  if (!loc) return false
  const metaPath = path.join(loc.dir, 'meta.json')
  const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'))
  meta.tags = tags
  meta.updateTime = Date.now()
  delete meta.category
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8')
  return true
}

/**
 * @param {Object} body
 */
export async function saveArticle(body) {
  const {
    id: inputId,
    title: inputTitle,
    content = '',
    status,
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
    folderName,
    createTime,
    updateTime,
    tags,
  }
  if (!isAuto && status === 'published') {
    meta.status = 'published'
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

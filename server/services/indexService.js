import fs from 'fs/promises'
import path from 'path'
import config from '../config.js'
import { sanitizeFolderName } from '../utils/folder.js'

/** @returns {Promise<string>} */
function blogRoot() {
  return path.resolve(config.blogRootDir)
}

/** @returns {Promise<string>} */
async function indexPath() {
  return path.join(await blogRoot(), config.indexFileName)
}

/** @returns {Promise<import('../types.js').BlogIndex>} */
export async function readIndex() {
  const file = await indexPath()
  try {
    const raw = await fs.readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
      return createEmptyIndex()
    }
    throw err
  }
}

/** @returns {import('../types.js').BlogIndex} */
export function createEmptyIndex() {
  return {
    version: 1,
    updatedAt: Date.now(),
    articles: [],
    tags: [],
  }
}

/** @param {unknown[]} [tags] @param {string} [legacyCategory] */
export function normalizeTags(tags, legacyCategory) {
  const result = Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter(Boolean)
    : []
  const legacy = (legacyCategory || '').trim()
  if (legacy && !result.includes(legacy)) {
    result.push(legacy)
  }
  return result
}

/** @param {import('../types.js').BlogIndex} index */
export function ensureTags(index) {
  if (Array.isArray(index.categories) && !index.tags) {
    index.tags = index.categories
    delete index.categories
  }
  if (!Array.isArray(index.tags)) {
    index.tags = []
  }
}

/** @param {import('../types.js').BlogIndex} index @param {string} tag */
export function addTagIfNew(index, tag) {
  const name = (tag || '').trim()
  if (!name) return
  ensureTags(index)
  if (!index.tags.includes(name)) {
    index.tags.push(name)
    index.tags.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }
}

/** @param {import('../types.js').BlogIndex} index */
export function collectTags(index) {
  ensureTags(index)
  const set = new Set(index.tags)
  for (const article of index.articles) {
    for (const tag of normalizeTags(article.tags, article.category)) {
      set.add(tag)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

/** @param {import('../types.js').BlogIndex} index */
export async function writeIndex(index) {
  const file = await indexPath()
  const tmp = `${file}.tmp`
  index.updatedAt = Date.now()
  await fs.writeFile(tmp, JSON.stringify(index, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

/** @param {import('../types.js').BlogIndexArticle} entry */
export function upsertArticle(index, entry) {
  const idx = index.articles.findIndex((a) => a.id === entry.id)
  if (idx >= 0) {
    index.articles[idx] = entry
  } else {
    index.articles.push(entry)
  }
  index.articles = index.articles.filter(
    (a, i, arr) => arr.findIndex((x) => x.id === a.id) === i,
  )
}

/** @param {string} id */
export function removeArticle(index, id) {
  index.articles = index.articles.filter((a) => a.id !== id)
}

/** @param {string} id */
export function removeTempById(index, id) {
  index.articles = index.articles.filter(
    (a) => !(a.id === id && a.source === 'temp'),
  )
}

export async function ensureIndexFile() {
  const file = await indexPath()
  try {
    await fs.access(file)
  } catch {
    await writeIndex(createEmptyIndex())
  }
}

/** @param {import('fs/promises')} fsPromises */
async function readMetaFromDir(articleDir, source, zoneName) {
  const metaPath = path.join(articleDir, 'meta.json')
  try {
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'))
    const folderName = path.basename(articleDir)
    const relPath = `${zoneName}/${folderName}`
    return {
      id: meta.id,
      title: meta.title ?? folderName,
      folderName: meta.folderName ?? folderName,
      source: source === 'saved' ? 'saved' : 'temp',
      status: meta.status ?? 'draft',
      path: relPath,
      createTime: meta.createTime ?? Date.now(),
      updateTime: meta.updateTime ?? Date.now(),
      tags: normalizeTags(meta.tags, meta.category),
    }
  } catch {
    return null
  }
}

export async function rebuildIndex() {
  const root = await blogRoot()
  const articles = []

  for (const [zoneName, source] of [
    [config.savedDirName, 'saved'],
    [config.tempDraftDirName, 'temp'],
  ]) {
    const zonePath = path.join(root, zoneName)
    let entries = []
    try {
      entries = await fs.readdir(zonePath, { withFileTypes: true })
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err
      continue
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue
      const item = await readMetaFromDir(
        path.join(zonePath, ent.name),
        source,
        zoneName,
      )
      if (item) articles.push(item)
    }
  }

  const byId = new Map()
  for (const a of articles) {
    const existing = byId.get(a.id)
    if (!existing || a.updateTime >= existing.updateTime) {
      byId.set(a.id, a)
    }
  }

  const index = {
    version: 1,
    updatedAt: Date.now(),
    articles: [...byId.values()].sort((a, b) => b.updateTime - a.updateTime),
    tags: [],
  }
  for (const article of index.articles) {
    for (const tag of article.tags || []) {
      addTagIfNew(index, tag)
    }
  }
  await writeIndex(index)
  return index
}

export async function initStorage() {
  const root = await blogRoot()
  if (config.autoCreateDir) {
    await fs.mkdir(root, { recursive: true })
    await fs.mkdir(path.join(root, config.savedDirName), { recursive: true })
    await fs.mkdir(path.join(root, config.tempDraftDirName), { recursive: true })
    await ensureIndexFile()
  }
}

export { blogRoot, sanitizeFolderName }

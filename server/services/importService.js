import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import config from '../config.js'
import { sanitizeFolderName, resolveUniqueFolderName, DEFAULT_TITLE } from '../utils/folder.js'
import { storageAssetUrl } from '../utils/contentAssets.js'
import { readIndex, writeIndex, upsertArticle, blogRoot } from './indexService.js'

const MD_EXT = '.md'

/** @param {string} filename */
function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase()
  return config.importImageExts.some((e) => e.toLowerCase() === ext)
}

/** @param {string} filename */
function isMdFile(filename) {
  return path.extname(filename).toLowerCase() === MD_EXT
}

/** @param {string} relPath */
function assertSafePath(relPath) {
  const normalized = relPath.replace(/\\/g, '/')
  if (normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error('非法路径')
  }
  return normalized
}

/** @param {string} content @param {string} fallback */
function extractTitle(content, fallback) {
  const match = content.match(/^#\s+(.+)$/m)
  if (match?.[1]?.trim()) return match[1].trim()
  return fallback
}

/** @param {string} refPath */
function refBasename(refPath) {
  return path.posix.basename(
    refPath.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, ''),
  )
}

/** @param {string} ref */
function isExternalRef(ref) {
  return /^(https?:|data:|\/)/i.test(ref.trim())
}

/** @param {Set<string>} used @param {string} baseName */
function uniqueAssetName(used, baseName) {
  const safe = baseName.replace(/[^a-zA-Z0-9._\u4e00-\u9fff-]/g, '_')
  let name = safe || 'image.png'
  let suffix = 2
  while (used.has(name)) {
    const ext = path.extname(name)
    const stem = path.basename(name, ext)
    name = `${stem}_${suffix++}${ext}`
  }
  used.add(name)
  return name
}

/**
 * @param {string} content
 * @param {Map<string, string>} basenameMap basename -> ./assets/name
 */
function replaceImagesByBasename(content, basenameMap) {
  if (basenameMap.size === 0) return content

  const lookup = (base) =>
    basenameMap.get(base) || basenameMap.get(base.toLowerCase())

  let result = content.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (full, alt, rawRef) => {
      const ref = rawRef.trim().split(/\s+/)[0]
      if (isExternalRef(ref)) return full
      const repl = lookup(refBasename(ref))
      return repl ? `![${alt}](${repl})` : full
    },
  )

  result = result.replace(
    /(<img[^>]+src=["'])([^"']+)(["'])/gi,
    (full, prefix, rawRef, suffix) => {
      const ref = rawRef.trim()
      if (isExternalRef(ref)) return full
      const repl = lookup(refBasename(ref))
      return repl ? `${prefix}${repl}${suffix}` : full
    },
  )

  return result
}

/**
 * @param {import('multer').File[]} files
 * @param {string[]} [pathsFromClient]
 * @param {string} [folderNameHint]
 */
function parseUploadItems(files, pathsFromClient = [], folderNameHint = '') {
  /** @type {Array<{ relPath: string, buffer: Buffer, size: number }>} */
  const items = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    try {
      let relPath = pathsFromClient[i] || file.originalname || file.originalname
      relPath = assertSafePath(relPath).replace(/\\/g, '/')
      if (folderNameHint && !relPath.includes('/')) {
        relPath = `${folderNameHint}/${relPath}`
      }
      items.push({
        relPath,
        buffer: file.buffer,
        size: file.buffer.length,
      })
    } catch {
      /* skip invalid */
    }
  }
  return items
}

/**
 * @param {Array<{ relPath: string, buffer: Buffer, size: number }>} imageItems
 * @param {string} assetsDir
 * @param {string} storageArticleRel e.g. saved/article-title
 */
async function copyImagesToAssets(imageItems, assetsDir, storageArticleRel) {
  await fs.mkdir(assetsDir, { recursive: true })
  const used = new Set()
  /** @type {Map<string, string>} */
  const basenameMap = new Map()

  for (const img of imageItems) {
    if (img.size > config.importMaxImageSize) continue
    const base = path.posix.basename(img.relPath)
    const destName = uniqueAssetName(used, base)
    await fs.writeFile(path.join(assetsDir, destName), img.buffer)
    const repl = storageAssetUrl(storageArticleRel, destName)
    basenameMap.set(base, repl)
    basenameMap.set(base.toLowerCase(), repl)
  }

  return basenameMap
}

/**
 * @param {Object} params
 */
async function createArticle(params) {
  const {
    savedPath,
    index,
    status,
    title,
    content,
    basenameMap,
    name,
    type,
    folderName: presetFolderName,
  } = params

  const baseFolder = sanitizeFolderName(title)
  const folderName =
    presetFolderName ||
    (await resolveUniqueFolderName(savedPath, baseFolder, undefined, fs))

  const id = randomUUID()
  const now = Date.now()
  const articleDir = path.join(savedPath, folderName)

  const finalContent = replaceImagesByBasename(content, basenameMap)
  const imageCount = basenameMap.size > 0 ? new Set(basenameMap.values()).size : 0

  const meta = {
    id,
    title,
    folderName,
    createTime: now,
    updateTime: now,
  }
  if (status === 'published') {
    meta.status = 'published'
  }

  await fs.mkdir(articleDir, { recursive: true })
  if (basenameMap.size > 0) {
    await fs.mkdir(path.join(articleDir, 'assets'), { recursive: true })
  }
  await fs.writeFile(
    path.join(articleDir, 'meta.json'),
    JSON.stringify(meta, null, 2),
    'utf8',
  )
  await fs.writeFile(path.join(articleDir, 'content.md'), finalContent, 'utf8')

  const relPath = `${config.savedDirName}/${folderName}`.replace(/\\/g, '/')
  upsertArticle(index, {
    id,
    title,
    folderName,
    source: 'saved',
    status,
    path: relPath,
    createTime: now,
    updateTime: now,
  })

  const result = {
    name,
    type,
    status: 'success',
    articleId: id,
    title,
    path: relPath,
    images: imageCount,
  }
  if (folderName !== baseFolder) {
    result.warnings = [`目录名「${baseFolder}」已占用，已创建为「${folderName}」`]
  }
  return result
}

/**
 * @param {Array<{ relPath: string, buffer: Buffer, size: number }>} items
 * @param {Object} ctx
 */
async function importMdMode(items, ctx) {
  const results = []
  const mdItems = items.filter((i) => isMdFile(i.relPath) && !i.relPath.includes('/'))

  if (mdItems.length === 0) {
    const err = new Error('请上传至少一个 .md 文件')
    err.statusCode = 400
    throw err
  }
  if (mdItems.length > config.importMaxFiles) {
    const err = new Error(`单次最多导入 ${config.importMaxFiles} 个 Markdown 文件`)
    err.statusCode = 400
    throw err
  }

  for (const md of mdItems) {
    if (md.size > config.importMaxMdSize) {
      results.push({
        name: md.relPath,
        type: 'file',
        status: 'skipped',
        reason: `Markdown 文件超过 ${Math.round(config.importMaxMdSize / 1024 / 1024)}MB 限制`,
      })
      continue
    }

    const content = md.buffer.toString('utf8')
    const fallback = path.basename(md.relPath, MD_EXT) || DEFAULT_TITLE
    const title = extractTitle(content, fallback)

    results.push(
      await createArticle({
        ...ctx,
        title,
        content,
        basenameMap: new Map(),
        name: md.relPath,
        type: 'file',
      }),
    )
  }

  return results
}

/**
 * @param {Array<{ relPath: string, buffer: Buffer, size: number }>} items
 * @param {Object} ctx
 */
function extractFolderBundle(items, folderNameHint = '') {
  let nested = items.filter((i) => i.relPath.includes('/'))

  if (nested.length === 0 && folderNameHint && items.length > 0) {
    nested = items.map((i) => ({
      ...i,
      relPath: `${folderNameHint}/${path.posix.basename(i.relPath)}`,
    }))
  }

  if (nested.length === 0) return null

  const folderName = nested[0].relPath.split('/')[0]
  const sameFolder = nested.every((i) => i.relPath.startsWith(`${folderName}/`))
  if (!sameFolder) return null

  return { folderName, items: nested }
}

/**
 * @param {Array<{ relPath: string, buffer: Buffer, size: number }>} items
 * @param {Object} ctx
 */
async function importFolderPackageMode(items, ctx, folderNameHint = '') {
  const bundle = extractFolderBundle(items, folderNameHint)
  if (!bundle) {
    const err = new Error('请选择一个文件夹（含 1 个 Markdown 与图片）')
    err.statusCode = 400
    throw err
  }

  const { folderName: uploadName, items: folderItems } = bundle
  const mdItems = folderItems.filter((i) => isMdFile(i.relPath))
  const imageItems = folderItems.filter((i) => isImageFile(i.relPath))

  if (mdItems.length === 0) {
    return [{
      name: uploadName,
      type: 'folder',
      status: 'failed',
      reason: '未找到 Markdown 文件',
    }]
  }

  if (mdItems.length > 1) {
    return [{
      name: uploadName,
      type: 'folder',
      status: 'failed',
      reason: '文章包模式仅支持 1 个 Markdown 文件，请改用「多篇 Markdown」模式',
    }]
  }

  const md = mdItems[0]
  if (md.size > config.importMaxMdSize) {
    return [{
      name: uploadName,
      type: 'folder',
      status: 'skipped',
      reason: `Markdown 文件超过 ${Math.round(config.importMaxMdSize / 1024 / 1024)}MB 限制`,
    }]
  }

  const content = md.buffer.toString('utf8')
  // 文章包：优先用 md 文件名/文件夹名，避免文内第一个 # 与已有目录重名
  const title =
    path.basename(md.relPath, MD_EXT) || uploadName || extractTitle(content, DEFAULT_TITLE)
  const baseFolder = sanitizeFolderName(title)
  const folderName = await resolveUniqueFolderName(
    ctx.savedPath,
    baseFolder,
    undefined,
    fs,
  )

  const articleDir = path.join(ctx.savedPath, folderName)
  const assetsDir = path.join(articleDir, 'assets')
  const storageRel = `${config.savedDirName}/${folderName}`.replace(/\\/g, '/')
  const basenameMap = await copyImagesToAssets(imageItems, assetsDir, storageRel)

  const result = await createArticle({
    ...ctx,
    title,
    folderName,
    content,
    basenameMap,
    name: uploadName,
    type: 'folder',
  })

  return [result]
}

/**
 * @param {Array<{ relPath: string, buffer: Buffer, size: number }>} items
 * @param {Object} ctx
 */
async function importFolderMultiMdMode(items, ctx, folderNameHint = '') {
  const bundle = extractFolderBundle(items, folderNameHint)
  if (!bundle) {
    const err = new Error('请选择一个含多个 Markdown 的文件夹')
    err.statusCode = 400
    throw err
  }

  const { folderName, items: folderItems } = bundle
  const mdItems = folderItems.filter((i) => isMdFile(i.relPath))
  const imageItems = folderItems.filter((i) => isImageFile(i.relPath))

  if (mdItems.length === 0) {
    return [{
      name: folderName,
      type: 'folder',
      status: 'failed',
      reason: '未找到 Markdown 文件',
    }]
  }

  if (mdItems.length > config.importMaxFiles) {
    const err = new Error(`单次最多导入 ${config.importMaxFiles} 篇 Markdown`)
    err.statusCode = 400
    throw err
  }

  /** @type {Array<Record<string, unknown>>} */
  const results = []

  for (const md of mdItems) {
    if (md.size > config.importMaxMdSize) {
      results.push({
        name: path.basename(md.relPath),
        type: 'file',
        status: 'skipped',
        reason: `Markdown 文件超过 ${Math.round(config.importMaxMdSize / 1024 / 1024)}MB 限制`,
      })
      continue
    }

    const content = md.buffer.toString('utf8')
    const fallback = path.basename(md.relPath, MD_EXT) || DEFAULT_TITLE
    const title = extractTitle(content, fallback)

    const baseFolder = sanitizeFolderName(title)
    const folderName = await resolveUniqueFolderName(
      ctx.savedPath,
      baseFolder,
      undefined,
      fs,
    )
    const articleDir = path.join(ctx.savedPath, folderName)
    const assetsDir = path.join(articleDir, 'assets')
    const storageRel = `${config.savedDirName}/${folderName}`.replace(/\\/g, '/')

    const referenced = new Set()
    const refPattern = /!\[[^\]]*\]\(([^)]+)\)/g
    let m
    while ((m = refPattern.exec(content)) !== null) {
      const ref = m[1].trim().split(/\s+/)[0]
      if (!isExternalRef(ref)) referenced.add(refBasename(ref))
    }

    const neededImages = imageItems.filter((img) => {
      const base = path.posix.basename(img.relPath)
      return referenced.has(base) || referenced.has(base.toLowerCase())
    })

    const basenameMap = await copyImagesToAssets(neededImages, assetsDir, storageRel)

    results.push(
      await createArticle({
        ...ctx,
        title,
        folderName,
        content,
        basenameMap,
        name: path.basename(md.relPath),
        type: 'file',
      }),
    )
  }

  return results
}

/**
 * @param {import('multer').File[]} files
 * @param {{ mode?: string, status?: string, paths?: string[], folderName?: string }} [options]
 */
export async function importArticles(files, options = {}) {
  if (!files?.length) {
    const err = new Error('请上传至少一个文件')
    err.statusCode = 400
    throw err
  }

  const mode = options.mode || 'md'
  const status = options.status === 'published' ? 'published' : undefined
  const pathsFromClient = options.paths || []
  const folderNameHint = (options.folderName || '').trim()
  const totalSize = files.reduce((s, f) => s + (f.buffer?.length || 0), 0)

  if (totalSize > config.importMaxTotalSize) {
    const err = new Error(
      `超出单次导入总大小限制（${Math.round(config.importMaxTotalSize / 1024 / 1024)}MB）`,
    )
    err.statusCode = 400
    throw err
  }

  const items = parseUploadItems(files, pathsFromClient, folderNameHint)
  if (items.length === 0) {
    const err = new Error('未找到有效文件')
    err.statusCode = 400
    throw err
  }

  const root = await blogRoot()
  const savedPath = path.join(root, config.savedDirName)
  await fs.mkdir(savedPath, { recursive: true })

  const index = await readIndex()
  const ctx = { savedPath, index, status }

  /** @type {Array<Record<string, unknown>>} */
  let results = []

  if (mode === 'md') {
    results = await importMdMode(items, ctx)
  } else if (mode === 'folder-package') {
    results = await importFolderPackageMode(items, ctx, folderNameHint)
  } else if (mode === 'folder-multi-md') {
    results = await importFolderMultiMdMode(items, ctx, folderNameHint)
  } else {
    const err = new Error(`不支持的导入模式：${mode}`)
    err.statusCode = 400
    throw err
  }

  await writeIndex(index)

  const successCount = results.filter((r) => r.status === 'success').length
  const skippedCount = results.filter((r) => r.status === 'skipped').length
  const failedCount = results.filter((r) => r.status === 'failed').length

  return {
    results,
    successCount,
    skippedCount,
    failedCount,
  }
}

import path from 'path'

const ILLEGAL_CHARS = /[\\/:*?"<>|]/g
const MAX_FOLDER_LEN = 80
const DEFAULT_TITLE = '未命名'

/** @param {string} title */
export function sanitizeFolderName(title) {
  let name = (title ?? '').trim()
  if (!name) name = DEFAULT_TITLE
  name = name.replace(ILLEGAL_CHARS, '_')
  if (name.length > MAX_FOLDER_LEN) {
    name = name.slice(0, MAX_FOLDER_LEN)
  }
  return name || DEFAULT_TITLE
}

/**
 * @param {string} zoneDir
 * @param {string} baseName
 * @param {string | undefined} excludeId
 */
export async function resolveUniqueFolderName(zoneDir, baseName, excludeId, fs) {
  let candidate = baseName
  let suffix = 2
  while (true) {
    const fullPath = path.join(zoneDir, candidate)
    try {
      const stat = await fs.stat(fullPath)
      if (!stat.isDirectory()) {
        candidate = `${baseName}_${suffix++}`
        continue
      }
      const metaPath = path.join(fullPath, 'meta.json')
      const metaRaw = await fs.readFile(metaPath, 'utf8')
      const meta = JSON.parse(metaRaw)
      if (excludeId && meta.id === excludeId) return candidate
      candidate = `${baseName}_${suffix++}`
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
        return candidate
      }
      throw err
    }
  }
}

/**
 * @param {string} blogRoot
 * @param {string} relativePath
 */
export function assertSafeArticlePath(blogRoot, relativePath) {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '')
  const full = path.resolve(blogRoot, normalized)
  const root = path.resolve(blogRoot)
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error('非法路径')
  }
  const rel = path.relative(root, full)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('非法路径')
  }
  return { full, rel }
}

export { DEFAULT_TITLE }

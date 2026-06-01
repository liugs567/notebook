/** @param {string} ref */
function isExternalRef(ref) {
  return /^(https?:|data:|\/)/i.test(ref.trim())
}

/**
 * @param {string} ref
 * @param {string} articleRelPath e.g. saved/my-article
 */
function relativeAssetToUrl(ref, articleRelPath) {
  const trimmed = ref.trim().split(/\s+/)[0]
  if (isExternalRef(trimmed)) return trimmed
  const normalized = trimmed.replace(/\\/g, '/').replace(/^\.\/+/, '')
  const m = normalized.match(/^assets\/(.+)$/i)
  if (!m) return trimmed
  const base = `/storage/${articleRelPath.replace(/\\/g, '/')}/assets/`
  return base + m[1]
}

/**
 * 将正文中的 ./assets/xxx 转为 /storage/{文章目录}/assets/xxx，供浏览器预览
 * @param {string} content
 * @param {string} articleRelPath
 */
export function resolveContentAssetUrls(content, articleRelPath) {
  if (!content || !articleRelPath) return content

  let result = content.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (full, alt, rawRef) => {
      const url = relativeAssetToUrl(rawRef, articleRelPath)
      const orig = rawRef.trim().split(/\s+/)[0]
      return url !== orig ? `![${alt}](${url})` : full
    },
  )

  result = result.replace(
    /(<img[^>]+src=["'])([^"']+)(["'])/gi,
    (full, prefix, rawRef, suffix) => {
      const url = relativeAssetToUrl(rawRef, articleRelPath)
      const orig = rawRef.trim()
      return url !== orig ? `${prefix}${url}${suffix}` : full
    },
  )

  return result
}

/**
 * @param {string} articleRelPath e.g. saved/my-article
 * @param {string} fileName
 */
export function storageAssetUrl(articleRelPath, fileName) {
  return `/storage/${articleRelPath.replace(/\\/g, '/')}/assets/${fileName}`
}

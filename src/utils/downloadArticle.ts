import JSZip from 'jszip'
import type { ArticleDetail } from '../api/blog'

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'article'
}

function isExternalRef(ref: string): boolean {
  return /^(https?:|data:)/i.test(ref.trim())
}

function extractLocalAssetFilenames(content: string, articlePath: string): Set<string> {
  const filenames = new Set<string>()
  const storagePrefix = `/storage/${articlePath.replace(/\\/g, '/')}/assets/`

  function collect(rawRef: string) {
    const ref = rawRef.trim().split(/\s+/)[0]
    if (!ref || isExternalRef(ref)) return
    if (ref.startsWith(storagePrefix)) {
      const name = decodeURIComponent(ref.slice(storagePrefix.length))
      if (name && !name.includes('/')) filenames.add(name)
      return
    }
    const assetMatch = ref.match(/^(?:\.\/)?assets\/([^/?#]+)$/i)
    if (assetMatch?.[1]) filenames.add(decodeURIComponent(assetMatch[1]))
  }

  content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_full, _alt, rawRef) => {
    collect(rawRef)
    return _full
  })
  content.replace(/(<img[^>]+src=["'])([^"']+)(["'])/gi, (_full, _prefix, rawRef) => {
    collect(rawRef)
    return _full
  })

  return filenames
}

function toExportContent(content: string, articlePath: string): string {
  const storagePrefix = `/storage/${articlePath.replace(/\\/g, '/')}/assets/`

  let result = content.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (full, alt, rawRef) => {
      const ref = rawRef.trim().split(/\s+/)[0]
      if (ref.startsWith(storagePrefix)) {
        const filename = ref.slice(storagePrefix.length)
        return `![${alt}](./assets/${filename})`
      }
      return full
    },
  )

  result = result.replace(
    /(<img[^>]+src=["'])([^"']+)(["'])/gi,
    (full, prefix, rawRef, suffix) => {
      const ref = rawRef.trim()
      if (ref.startsWith(storagePrefix)) {
        const filename = ref.slice(storagePrefix.length)
        return `${prefix}./assets/${filename}${suffix}`
      }
      return full
    },
  )

  return result
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function assetFetchUrl(articlePath: string, filename: string): string {
  const normalizedPath = articlePath.replace(/\\/g, '/')
  const encodedName = filename.split('/').map(encodeURIComponent).join('/')
  return `/storage/${normalizedPath}/assets/${encodedName}`
}

export async function downloadArticleExport(detail: ArticleDetail): Promise<void> {
  const { content, path: articlePath, title } = detail
  const baseName = sanitizeFilename(title)
  const filenames = extractLocalAssetFilenames(content, articlePath)

  if (filenames.size === 0) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    triggerDownload(blob, `${baseName}.md`)
    return
  }

  const zip = new JSZip()
  zip.file(`${baseName}.md`, toExportContent(content, articlePath))

  const assetsFolder = zip.folder('assets')
  if (!assetsFolder) throw new Error('创建压缩包失败')

  for (const filename of filenames) {
    const res = await fetch(assetFetchUrl(articlePath, filename))
    if (!res.ok) throw new Error(`图片 ${filename} 下载失败`)
    assetsFolder.file(filename, await res.blob())
  }

  triggerDownload(await zip.generateAsync({ type: 'blob' }), `${baseName}.zip`)
}

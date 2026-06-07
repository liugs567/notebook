import axios from 'axios'

const http = axios.create({
  baseURL: '/api/blog',
  timeout: 30000,
})

export interface BlogIndexArticle {
  id: string
  title: string
  folderName: string
  source: 'saved' | 'temp'
  status?: 'published'
  path: string
  createTime: number
  updateTime: number
  tags?: string[]
  excerpt?: string
}

export interface ArticleDetail extends BlogIndexArticle {
  content: string
}

export interface ListResult {
  items: BlogIndexArticle[]
  total: number
  page: number
  size: number
  totalPages: number
}

export interface SavePayload {
  id?: string
  title: string
  content: string
  status?: 'published'
  saveMode: 'auto' | 'manual'
  createTime?: number
  updateTime?: number
  tags?: string[]
}

export function fetchList(params: {
  page?: number
  size?: number
  status?: string
  keyword?: string
  source?: string
  tag?: string
}) {
  return http.get<{ code: number; data: ListResult }>('/list', { params })
}

export interface ContentSearchItem {
  id: string
  title: string
  snippet: string
  matchIndex: number
  offset: number
  updateTime: number
}

export interface ContentSearchResult {
  items: ContentSearchItem[]
  total: number
  keyword: string
  truncated: boolean
}

export function searchContent(params: { q: string; limit?: number }) {
  return http.get<{ code: number; data: ContentSearchResult }>('/search', {
    params,
  })
}

export function fetchTags() {
  return http.get<{ code: number; data: string[] }>('/tags')
}

export interface TagStat {
  name: string
  count: number
}

export function fetchTagStats() {
  return http.get<{ code: number; data: TagStat[] }>('/tags/stats')
}

export function createTag(name: string) {
  return http.post<{ code: number; data: { name: string }; message: string }>(
    '/tags',
    { name },
  )
}

export function renameTag(oldName: string, newName: string) {
  return http.put<{ code: number; data: { name: string; updated: number }; message: string }>(
    `/tags/${encodeURIComponent(oldName)}`,
    { name: newName },
  )
}

export function deleteTag(name: string) {
  return http.delete<{ code: number; data: { name: string; updated: number }; message: string }>(
    `/tags/${encodeURIComponent(name)}`,
  )
}

export function assignArticlesToTag(payload: {
  tag: string
  articleIds: string[]
  mode?: 'add' | 'remove' | 'set'
}) {
  return http.post<{
    code: number
    data: { tag: string; mode: string; updated: number; failed: string[] }
    message: string
  }>('/tags/assign', payload)
}

export function fetchDetail(id: string) {
  return http.get<{ code: number; data: ArticleDetail }>(`/detail/${id}`)
}

export function saveArticle(payload: SavePayload) {
  return http.post<{ code: number; data: ArticleDetail; message: string }>(
    '/save',
    payload,
  )
}

export function deleteArticle(id: string) {
  return http.delete<{ code: number; message: string }>(`/delete/${id}`)
}

export function uploadImage(articleId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  form.append('articleId', articleId)
  return axios.post<{ code: number; data: { url: string } }>(
    '/api/blog/upload/img',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
}

export interface ImportResultItem {
  name: string
  type: 'file' | 'folder'
  status: 'success' | 'skipped' | 'failed'
  articleId?: string
  title?: string
  path?: string
  images?: number
  reason?: string
  warnings?: string[]
}

export interface ImportResult {
  results: ImportResultItem[]
  successCount: number
  skippedCount: number
  failedCount: number
}

export type ImportMode = 'md' | 'folder-package' | 'folder-multi-md'

export type ImportFile = File & {
  webkitRelativePath?: string
  importPath?: string
}

export function getImportRelativePath(file: ImportFile): string {
  return file.importPath || file.webkitRelativePath || file.name
}

export function importArticles(
  files: ImportFile[],
  options?: {
    mode?: ImportMode
    status?: 'published'
    folderName?: string
  },
) {
  const form = new FormData()
  const paths: string[] = []
  for (const file of files) {
    const relativePath = getImportRelativePath(file)
    paths.push(relativePath)
    form.append('files', file, relativePath)
  }
  form.append('paths', JSON.stringify(paths))
  if (options?.mode) {
    form.append('mode', options.mode)
  }
  if (options?.folderName) {
    form.append('folderName', options.folderName)
  }
  if (options?.status) {
    form.append('status', options.status)
  }
  return axios.post<{ code: number; data: ImportResult; message: string }>(
    '/api/blog/import',
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    },
  )
}

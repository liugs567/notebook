<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { MdPreview } from 'md-editor-v3'
import { message } from 'ant-design-vue'
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  InboxOutlined,
  FileMarkdownOutlined,
  FolderOutlined,
  CloseOutlined,
  ImportOutlined,
} from '@ant-design/icons-vue'
import {
  fetchList,
  fetchDetail,
  deleteArticle,
  importArticles,
  fetchTags,
  type BlogIndexArticle,
  type ImportResultItem,
  type ImportMode,
  type ImportFile,
  getImportRelativePath,
} from '../api/blog'
import { formatRelativeDate } from '../utils/date'
import { downloadArticleExport } from '../utils/downloadArticle'

const router = useRouter()

const items = ref<BlogIndexArticle[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(12)
const loading = ref(false)
const keyword = ref('')
const publishFilter = ref('')
const sourceFilter = ref('')
const tagFilter = ref('')
const allTags = ref<string[]>([])
const importVisible = ref(false)
const previewVisible = ref(false)
const previewLoading = ref(false)
const previewTitle = ref('')
const previewContent = ref('')
const previewId = ref('')
const previewScrollRef = ref<HTMLElement>()
const downloadingId = ref('')

type ImportKind = 'md' | 'folder'
type FolderMode = 'package' | 'multi-md'

interface QueueItem {
  key: string
  name: string
  type: 'file' | 'folder'
  size: number
  fileCount: number
}

const importKind = ref<ImportKind>('md')
const folderMode = ref<FolderMode>('package')
const pendingFiles = ref<ImportFile[]>([])
const importQueue = ref<QueueItem[]>([])
const importing = ref(false)
const importProgress = ref(0)
const resultVisible = ref(false)
const importResults = ref<ImportResultItem[]>([])
const dragOver = ref(false)
const fileInputRef = ref<HTMLInputElement>()
const folderInputRef = ref<HTMLInputElement>()

const importMode = computed<ImportMode>(() => {
  if (importKind.value === 'md') return 'md'
  return folderMode.value === 'package' ? 'folder-package' : 'folder-multi-md'
})

const dropzoneHint = computed(() => {
  if (importKind.value === 'md') {
    return '选择一个或多个 .md 文件，每个文件将新建一篇文章（最多 20 个）'
  }
  if (folderMode.value === 'package') {
    return '选择一个文件夹：内含 1 个 Markdown + 图片，将合并为 1 篇文章'
  }
  return '选择一个文件夹：其中每个 .md 文件各新建一篇文章'
})

function isMdFile(name: string) {
  return /\.md$/i.test(name)
}

function fileRelativePath(file: ImportFile): string {
  return getImportRelativePath(file).replace(/\\/g, '/')
}

function tagImportPath(file: File, relPath: string): ImportFile {
  const normalized = relPath.replace(/\\/g, '/')
  const patched = withRelativePath(file, normalized) as ImportFile
  patched.importPath = normalized
  return patched
}

function withRelativePath(file: File, relPath: string): File {
  if (fileRelativePath(file) === relPath) return file
  const patched = new File([file], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  })
  Object.defineProperty(patched, 'webkitRelativePath', {
    value: relPath,
    configurable: true,
  })
  return patched
}

function rebuildMdQueue() {
  importQueue.value = pendingFiles.value.map((file) => ({
    key: `file:${file.name}`,
    name: file.name,
    type: 'file' as const,
    size: file.size,
    fileCount: 1,
  }))
}

function rebuildFolderQueue() {
  if (pendingFiles.value.length === 0) {
    importQueue.value = []
    return
  }
  const firstFile = pendingFiles.value[0]!
  const first = fileRelativePath(firstFile).replace(/\\/g, '/')
  const folderName = first.split('/')[0] || 'folder'
  importQueue.value = [{
    key: `folder:${folderName}`,
    name: folderName,
    type: 'folder',
    size: pendingFiles.value.reduce((s, f) => s + f.size, 0),
    fileCount: pendingFiles.value.length,
  }]
}

function onImportKindChange() { clearQueue() }
function onFolderModeChange() { if (importKind.value === 'folder') clearQueue() }

function addMdFiles(files: File[]) {
  const mds = files.filter((f) => {
    const rel = fileRelativePath(f).replace(/\\/g, '/')
    return isMdFile(f.name) && !rel.includes('/')
  })
  if (mds.length === 0) { message.warning('请选择 .md 文件'); return }
  pendingFiles.value = [...pendingFiles.value, ...mds]
  if (pendingFiles.value.length > 20) {
    pendingFiles.value = pendingFiles.value.slice(0, 20)
    message.warning('单次最多 20 个 Markdown 文件')
  }
  rebuildMdQueue()
}

function setFolderFiles(files: File[]) {
  const nested = files
    .map((f) => {
      const rel = (
        (f as ImportFile).importPath ||
        (f as File & { webkitRelativePath?: string }).webkitRelativePath ||
        f.name
      ).replace(/\\/g, '/')
      if (!rel.includes('/')) return null
      return tagImportPath(f, rel)
    })
    .filter((f): f is ImportFile => f !== null)
  if (nested.length === 0) { message.warning('请选择一个文件夹'); return }
  pendingFiles.value = nested
  rebuildFolderQueue()
}

function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  addMdFiles(Array.from(input.files || []))
  input.value = ''
}

function onFolderInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || []).map((f) => {
    const rel = ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).replace(/\\/g, '/')
    return tagImportPath(f, rel)
  })
  setFolderFiles(files)
  input.value = ''
}

function pickFiles() {
  if (importKind.value === 'md') fileInputRef.value?.click()
  else folderInputRef.value?.click()
}

function onDragOver(e: DragEvent) { e.preventDefault(); dragOver.value = true }
function onDragLeave() { dragOver.value = false }

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = []
  let batch: FileSystemEntry[]
  do {
    batch = await new Promise((resolve, reject) => { reader.readEntries(resolve, reject) })
    all.push(...batch)
  } while (batch.length > 0)
  return all
}

async function traverseEntry(entry: FileSystemEntry, files: File[], basePath = '') {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      ;(entry as FileSystemFileEntry).file(resolve, reject)
    })
    const relPath = basePath ? `${basePath}/${file.name}` : file.name
    files.push(tagImportPath(file, relPath))
  } else if (entry.isDirectory) {
    const dirPath = basePath ? `${basePath}/${entry.name}` : entry.name
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const entries = await readAllEntries(reader)
    for (const sub of entries) await traverseEntry(sub, files, dirPath)
  }
}

async function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  if (importing.value) return
  const dtItems = e.dataTransfer?.items
  const collected: File[] = []
  if (dtItems?.length) {
    const tasks: Promise<void>[] = []
    for (const item of dtItems) {
      const entry = item.webkitGetAsEntry?.()
      if (entry) tasks.push(traverseEntry(entry, collected))
    }
    if (tasks.length > 0) await Promise.all(tasks)
  }
  const files = collected.length > 0 ? collected : Array.from(e.dataTransfer?.files || [])
  if (importKind.value === 'md') addMdFiles(files)
  else setFolderFiles(files)
}

function removeQueueItem(key: string) {
  if (importKind.value === 'md') {
    pendingFiles.value = pendingFiles.value.filter((f) => `file:${f.name}` !== key)
    rebuildMdQueue()
  } else clearQueue()
}

function clearQueue() { pendingFiles.value = []; importQueue.value = [] }

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function startImport() {
  if (importQueue.value.length === 0) { message.warning('请先选择要导入的内容'); return }
  importing.value = true
  importProgress.value = 10
  try {
    importProgress.value = 40
    const res = await importArticles(pendingFiles.value, {
      mode: importMode.value,
      folderName: importKind.value === 'folder' ? importQueue.value[0]?.name : undefined,
    })
    importProgress.value = 100
    const data = res.data.data
    importResults.value = data.results
    if (data.successCount > 0) {
      message.success(res.data.message)
      await loadTags()
      await loadList()
    } else if (data.failedCount > 0) {
      message.error(res.data.message)
    } else {
      message.warning(res.data.message)
    }
    resultVisible.value = true
    clearQueue()
  } catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
      : undefined
    message.error(msg || '导入失败')
  } finally {
    importing.value = false
    importProgress.value = 0
  }
}

function goEditFromResult(id: string) { resultVisible.value = false; router.push(`/blog/edit/${id}`) }

function resultStatusColor(status: string) {
  if (status === 'success') return 'success'
  if (status === 'skipped') return 'warning'
  return 'error'
}

function resultStatusLabel(status: string) {
  if (status === 'success') return '成功'
  if (status === 'skipped') return '跳过'
  return '失败'
}

async function loadTags() {
  try {
    const res = await fetchTags()
    allTags.value = res.data.data
  } catch { allTags.value = [] }
}

async function loadList() {
  loading.value = true
  try {
    const res = await fetchList({
      page: page.value,
      size: size.value,
      keyword: keyword.value || undefined,
      status: publishFilter.value || undefined,
      source: sourceFilter.value || undefined,
      tag: tagFilter.value || undefined,
    })
    const data = res.data.data
    items.value = data.items
    total.value = data.total
  } catch { message.error('加载列表失败') }
  finally { loading.value = false }
}

function onSearch() { page.value = 1; loadList() }

function onReset() {
  keyword.value = ''
  publishFilter.value = ''
  sourceFilter.value = ''
  tagFilter.value = ''
  page.value = 1
  loadList()
}

function setPublishFilter(value: string) {
  publishFilter.value = value
  page.value = 1
  loadList()
}

function setSourceFilter(value: string) {
  sourceFilter.value = value
  page.value = 1
  loadList()
}

function openImportModal() {
  importVisible.value = true
}

function selectTag(name: string) {
  tagFilter.value = tagFilter.value === name ? '' : name
  page.value = 1
  loadList()
}

function clearTagFilter() { tagFilter.value = ''; page.value = 1; loadList() }

function goCreate() { router.push('/blog/create') }
function goView(id: string) { router.push(`/blog/view/${id}`) }
function goEdit(id: string) { router.push(`/blog/edit/${id}`) }

async function openPreview(id: string) {
  previewId.value = `blog-list-preview-${id}`
  previewTitle.value = ''
  previewContent.value = ''
  previewVisible.value = true
  previewLoading.value = true
  try {
    const res = await fetchDetail(id)
    const data = res.data.data
    previewTitle.value = data.title
    previewContent.value = data.content
  } catch {
    message.error('加载预览失败')
    previewVisible.value = false
  } finally {
    previewLoading.value = false
  }
}

function onPreviewWheel(e: WheelEvent) {
  if (!previewVisible.value || !previewScrollRef.value) return
  if (previewScrollRef.value.contains(e.target as Node)) return
  e.preventDefault()
  previewScrollRef.value.scrollTop += e.deltaY
}

watch(previewVisible, (visible) => {
  if (visible) {
    window.addEventListener('wheel', onPreviewWheel, { passive: false })
  } else {
    window.removeEventListener('wheel', onPreviewWheel)
  }
})

async function doDelete(id: string) {
  try {
    await deleteArticle(id)
    message.success('删除成功')
    await loadList()
  } catch { message.error('删除失败') }
}

async function doDownload(item: BlogIndexArticle) {
  if (downloadingId.value) return
  downloadingId.value = item.id
  try {
    const res = await fetchDetail(item.id)
    await downloadArticleExport(res.data.data)
    message.success('下载成功')
  } catch {
    message.error('下载失败')
  } finally {
    downloadingId.value = ''
  }
}

function sourceLabel(source: string) { return source === 'temp' ? '草稿' : '已保存' }

onMounted(async () => {
  await loadTags()
  await loadList()
})

onUnmounted(() => {
  window.removeEventListener('wheel', onPreviewWheel)
})
</script>

<template>
  <div class="page-root">
    <main class="main-content">
      <div class="page-header">
        <div>
          <h1 class="page-title">文章管理</h1>
          <p class="page-subtitle">管理和发布您的博客内容</p>
        </div>
        <div class="header-right">
          <a-button class="accent-btn" @click="openImportModal">
            <template #icon><ImportOutlined /></template>
            导入文章
          </a-button>
          <span class="total-badge">共 {{ total }} 篇</span>
          <a-button shape="circle" :loading="loading" size="small" @click="loadList" title="刷新">
            <template #icon><ReloadOutlined /></template>
          </a-button>
        </div>
      </div>

      <div class="filter-card glass-surface">
        <div class="filter-card-row">
          <a-input
            v-model:value="keyword"
            class="filter-search-input"
            placeholder="搜索文章标题..."
            allow-clear
            @pressEnter="onSearch"
          >
            <template #prefix><SearchOutlined style="color: #94a3b8" /></template>
          </a-input>

          <span class="filter-row-divider" />

          <div class="filter-row-item">
            <span class="filter-row-label">发布</span>
            <div class="segment-group">
              <button
                type="button"
                class="segment-btn"
                :class="{ 'segment-btn--active': !publishFilter }"
                @click="setPublishFilter('')"
              >全部</button>
              <button
                type="button"
                class="segment-btn"
                :class="{ 'segment-btn--active': publishFilter === 'published' }"
                @click="setPublishFilter('published')"
              >已发布</button>
              <button
                type="button"
                class="segment-btn"
                :class="{ 'segment-btn--active': publishFilter === 'unpublished' }"
                @click="setPublishFilter('unpublished')"
              >未发布</button>
            </div>
          </div>

          <span class="filter-row-divider" />

          <div class="filter-row-item">
            <span class="filter-row-label">保存</span>
            <div class="segment-group">
              <button
                type="button"
                class="segment-btn"
                :class="{ 'segment-btn--active': !sourceFilter }"
                @click="setSourceFilter('')"
              >全部</button>
              <button
                type="button"
                class="segment-btn"
                :class="{ 'segment-btn--active': sourceFilter === 'saved' }"
                @click="setSourceFilter('saved')"
              >已保存</button>
              <button
                type="button"
                class="segment-btn"
                :class="{ 'segment-btn--active': sourceFilter === 'temp' }"
                @click="setSourceFilter('temp')"
              >未保存</button>
            </div>
          </div>

          <a-button class="filter-reset-btn" @click="onReset">重置</a-button>
        </div>
      </div>

      <div v-if="allTags.length > 0" class="tag-bar glass-surface">
        <span class="tag-bar-label">分类</span>
        <div class="tag-bar-items">
          <button
            type="button"
            class="tag-chip"
            :class="{ 'tag-chip--active': !tagFilter }"
            @click="clearTagFilter"
          >全部</button>
          <button
            v-for="tag in allTags"
            :key="tag"
            type="button"
            class="tag-chip"
            :class="{ 'tag-chip--active': tagFilter === tag }"
            @click="selectTag(tag)"
          >{{ tag }}</button>
        </div>
      </div>

      <div v-if="loading" class="cards-loading">
        <a-spin size="large" />
      </div>

      <div v-else-if="items.length === 0" class="cards-empty">
        <a-empty description="还没有任何文章">
          <a-button class="accent-btn" @click="goCreate">
            <template #icon><PlusOutlined /></template>
            撰写第一篇文章
          </a-button>
        </a-empty>
      </div>

      <div v-else class="cards-grid">
        <div
          v-for="item in items"
          :key="item.id"
          class="article-card"
        >
          <div class="card-title-wrap" @click="goView(item.id)">
            <h3 class="card-title">
              <span
                class="card-status-tag"
                :class="item.source === 'temp' ? 'card-status-tag--draft' : 'card-status-tag--saved'"
              >{{ sourceLabel(item.source) }}</span>{{ item.title }}
            </h3>
          </div>

          <p
            class="card-excerpt"
            @click="openPreview(item.id)"
          >
            {{ item.excerpt || '暂无摘要，点击预览全文' }}
          </p>

          <div class="card-bottom">
            <span class="card-time">{{ formatRelativeDate(item.updateTime) }}</span>
            <div class="card-actions">
              <button
                type="button"
                class="card-icon-btn"
                title="编辑"
                @click.stop="goEdit(item.id)"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                  <path
                    d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="card-icon-btn"
                title="下载"
                :disabled="downloadingId === item.id"
                @click.stop="doDownload(item)"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                  <path
                    d="M12 3v12M7 10l5 5 5-5M5 21h14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
              <a-popconfirm
                title="确定删除这篇文章吗？"
                description="删除后无法恢复。"
                ok-text="删除"
                cancel-text="取消"
                ok-type="danger"
                @confirm="doDelete(item.id)"
              >
                <button type="button" class="card-icon-btn card-icon-btn--delete" title="删除" @click.stop>
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                    <path
                      d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.75"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </a-popconfirm>
            </div>
          </div>
        </div>
      </div>

      <div v-if="total > size" class="pagination-bar">
        <a-pagination
          :current="page"
          :page-size="size"
          :total="total"
          :show-size-changer="true"
          :page-size-options="['12', '24', '48']"
          :show-total="(t: number) => `共 ${t} 篇`"
          @change="(p: number, ps: number) => { page = p; size = ps; loadList() }"
          @showSizeChange="(_cur: number, ps: number) => { page = 1; size = ps; loadList() }"
        />
      </div>
    </main>

    <a-modal
      v-model:open="importVisible"
      title="导入 Markdown"
      width="760px"
      centered
      :footer="null"
      :mask-closable="!importing"
      :closable="!importing"
    >
      <div class="import-mode-bar">
        <a-radio-group v-model:value="importKind" :disabled="importing" @change="onImportKindChange">
          <a-radio-button value="md">上传 Markdown</a-radio-button>
          <a-radio-button value="folder">上传文件夹</a-radio-button>
        </a-radio-group>
        <a-radio-group
          v-if="importKind === 'folder'"
          v-model:value="folderMode"
          :disabled="importing"
          class="import-folder-mode"
          @change="onFolderModeChange"
        >
          <a-radio value="package">文章包（1 个 md + 图片）</a-radio>
          <a-radio value="multi-md">多篇 Markdown</a-radio>
        </a-radio-group>
      </div>

      <div
        class="import-dropzone"
        :class="{ 'import-dropzone--active': dragOver, 'import-dropzone--disabled': importing }"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <input ref="fileInputRef" type="file" accept=".md,text/markdown" multiple hidden @change="onFileInputChange" />
        <input ref="folderInputRef" type="file" multiple hidden webkitdirectory @change="onFolderInputChange" />
        <p class="import-dropzone-icon"><InboxOutlined /></p>
        <p class="import-dropzone-text">{{ importKind === 'md' ? '拖拽或选择 .md 文件' : '拖拽或选择一个文件夹' }}</p>
        <p class="import-dropzone-hint">{{ dropzoneHint }}</p>
        <a-button size="small" :disabled="importing" @click="pickFiles">
          <template #icon>
            <FileMarkdownOutlined v-if="importKind === 'md'" />
            <FolderOutlined v-else />
          </template>
          {{ importKind === 'md' ? '选择 .md 文件' : '选择文件夹' }}
        </a-button>
      </div>

      <div v-if="importQueue.length > 0" class="import-queue">
        <div class="import-queue-header">
          <span>待导入队列（{{ importQueue.length }} 项）</span>
          <a-space>
            <a-button size="small" :disabled="importing" @click="clearQueue">清空</a-button>
            <a-button type="primary" size="small" :loading="importing" @click="startImport">
              <template #icon><ImportOutlined /></template>
              开始导入
            </a-button>
          </a-space>
        </div>
        <a-list size="small" :data-source="importQueue" bordered>
          <template #renderItem="{ item }">
            <a-list-item>
              <a-list-item-meta>
                <template #avatar>
                  <FolderOutlined v-if="item.type === 'folder'" style="font-size: 18px; color: #1677ff" />
                  <FileMarkdownOutlined v-else style="font-size: 18px; color: #52c41a" />
                </template>
                <template #title>
                  <span>{{ item.name }}</span>
                  <a-tag :bordered="false" style="margin-left: 8px">{{ item.type === 'folder' ? '文件夹' : '文件' }}</a-tag>
                </template>
                <template #description>{{ item.fileCount }} 个文件 · {{ formatSize(item.size) }}</template>
              </a-list-item-meta>
              <template #actions>
                <a-button type="text" size="small" :disabled="importing" @click="removeQueueItem(item.key)">
                  <CloseOutlined />
                </a-button>
              </template>
            </a-list-item>
          </template>
        </a-list>
      </div>

      <a-progress v-if="importing" :percent="importProgress" status="active" :show-info="false" style="margin-top: 12px" />
    </a-modal>

    <a-modal
      v-model:open="previewVisible"
      :title="previewTitle || '文章预览'"
      width="860px"
      centered
      :footer="null"
      destroy-on-close
      class="preview-modal"
    >
      <div class="preview-modal-body">
        <div v-if="previewLoading" class="preview-loading">
          <a-spin size="large" />
        </div>
        <div
          v-else
          ref="previewScrollRef"
          class="preview-scroll"
          tabindex="-1"
        >
          <MdPreview
            :id="previewId"
            :model-value="previewContent"
            preview-theme="cyanosis"
            :code-foldable="false"
          />
        </div>
      </div>
    </a-modal>

    <a-modal v-model:open="resultVisible" title="导入结果" :footer="null" width="680px" centered>
      <a-list size="small" :data-source="importResults">
        <template #renderItem="{ item }">
          <a-list-item>
            <a-list-item-meta>
              <template #title>
                <a-space>
                  <a-tag :color="resultStatusColor(item.status)" :bordered="false">{{ resultStatusLabel(item.status) }}</a-tag>
                  <span>{{ item.title || item.name }}</span>
                </a-space>
              </template>
              <template #description>
                <template v-if="item.status === 'success'">
                  <span v-if="item.images">已导入 {{ item.images }} 张图片</span>
                  <div v-if="item.warnings?.length" class="import-warnings">
                    <div v-for="(w, i) in item.warnings" :key="i">{{ w }}</div>
                  </div>
                </template>
                <span v-else>{{ item.reason }}</span>
              </template>
            </a-list-item-meta>
            <template v-if="item.status === 'success' && item.articleId" #actions>
              <a @click="goEditFromResult(item.articleId)">去编辑</a>
            </template>
          </a-list-item>
        </template>
      </a-list>
    </a-modal>
  </div>
</template>

<style scoped>
.page-root {
  min-height: 100vh;
  background: transparent;
  color: #3d3428;
  font-family: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Georgia', serif;
}

.glass-surface {
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow:
    0 4px 24px rgba(92, 73, 48, 0.07),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
}

.main-content {
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.page-title {
  font-size: 26px;
  font-weight: 700;
  color: #2c2418;
  margin: 0 0 4px;
  letter-spacing: -0.3px;
}

.page-subtitle {
  font-size: 14px;
  color: #7a6f5f;
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

:deep(.accent-btn) {
  background: rgba(139, 105, 20, 0.78);
  border: 1px solid rgba(122, 92, 16, 0.55);
  color: #fffdf8;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow:
    0 2px 10px rgba(139, 105, 20, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

:deep(.accent-btn:hover),
:deep(.accent-btn:focus) {
  background: rgba(139, 105, 20, 0.88) !important;
  border-color: rgba(122, 92, 16, 0.65) !important;
  color: #fffdf8 !important;
}

:deep(.accent-btn:active) {
  background: rgba(122, 92, 16, 0.92) !important;
  border-color: rgba(107, 80, 14, 0.75) !important;
}

.total-badge {
  font-size: 13px;
  color: #6b5f4f;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.65);
  padding: 3px 10px;
  border-radius: 20px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
}

.import-mode-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.import-folder-mode {
  padding-left: 4px;
}

.import-dropzone {
  border: 1.5px dashed #d9d9d9;
  border-radius: 12px;
  background: #fafafa;
  padding: 40px 24px;
  text-align: center;
  transition: border-color 0.2s, background 0.2s;
  margin-bottom: 16px;
}

.import-dropzone--active {
  border-color: #1677ff;
  background: #e6f4ff;
}

.import-dropzone--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.import-dropzone-icon {
  font-size: 56px;
  color: #1677ff;
  margin: 0 0 12px;
}

.import-dropzone-text {
  margin: 0 0 6px;
  font-size: 16px;
  color: #334155;
}

.import-dropzone-hint {
  margin: 0 0 20px;
  font-size: 14px;
  color: #94a3b8;
}

.import-queue {
  margin-top: 16px;
}

.import-queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  color: #64748b;
}

.import-warnings {
  margin-top: 4px;
  color: #faad14;
  font-size: 12px;
}

.filter-card {
  border-radius: 18px;
  padding: 14px 18px;
}

.filter-card :deep(.ant-input),
.filter-card :deep(.ant-input-affix-wrapper) {
  background: rgba(255, 255, 255, 0.58);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-color: rgba(255, 255, 255, 0.65);
  color: #3d3428;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.filter-card :deep(.ant-input::placeholder) {
  color: #a89880;
}

.filter-card :deep(.ant-input-affix-wrapper:hover),
.filter-card :deep(.ant-input-affix-wrapper-focused) {
  border-color: rgba(255, 255, 255, 0.82);
  background: rgba(255, 255, 255, 0.72);
}

.filter-card :deep(.ant-input-affix-wrapper-focused) {
  box-shadow: 0 0 0 2px rgba(139, 105, 20, 0.15);
}

.filter-reset-btn {
  flex-shrink: 0;
  margin-left: auto;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-color: rgba(255, 255, 255, 0.65);
  color: #6b5f4f;
}

.filter-card-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 16px;
}

.filter-search-input {
  flex: 1;
  min-width: 180px;
}

.filter-row-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-row-label {
  font-size: 12px;
  font-weight: 500;
  color: #8a7d6b;
  flex-shrink: 0;
}

.filter-row-divider {
  width: 1px;
  height: 22px;
  background: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}

.segment-group {
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

.segment-btn {
  border: none;
  background: transparent;
  padding: 4px 14px;
  font-size: 13px;
  color: #7a6f5f;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, background 0.15s, box-shadow 0.15s;
  line-height: 1.5;
}

.segment-btn:hover:not(.segment-btn--active) {
  color: #3d3428;
}

.segment-btn--active {
  background: rgba(255, 255, 255, 0.78);
  color: #8b6914;
  font-weight: 500;
  box-shadow:
    0 1px 4px rgba(92, 73, 48, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.tag-bar {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-radius: 16px;
  padding: 12px 16px;
}

.tag-bar-label {
  font-size: 12px;
  font-weight: 500;
  color: #8a7d6b;
  flex-shrink: 0;
  line-height: 30px;
}

.tag-chip {
  border: 1px solid rgba(255, 255, 255, 0.58);
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 4px 14px;
  font-size: 13px;
  color: #7a6f5f;
  border-radius: 20px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.2s, background 0.2s, border-color 0.2s;
  line-height: 1.5;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
}

.tag-chip:hover:not(.tag-chip--active) {
  color: #3d3428;
  background: rgba(255, 255, 255, 0.68);
  border-color: rgba(255, 255, 255, 0.75);
}

.tag-chip--active {
  background: rgba(139, 105, 20, 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-color: rgba(255, 255, 255, 0.28);
  color: #fffdf8;
  font-weight: 500;
  box-shadow: 0 2px 10px rgba(139, 105, 20, 0.25);
}

.cards-empty :deep(.ant-empty-description) {
  color: #8a7d6b;
}

.cards-loading,
.cards-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 18px;
}

.tag-bar-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.article-card {
  position: relative;
  background: rgba(255, 255, 255, 0.58);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 14px;
  box-shadow:
    0 4px 20px rgba(92, 73, 48, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
  overflow: hidden;
  padding: 16px;
  padding-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease;
}

.article-card:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.72);
  border-color: rgba(255, 255, 255, 0.85);
  box-shadow:
    0 8px 28px rgba(92, 73, 48, 0.09),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.card-title-wrap {
  cursor: pointer;
}

.card-title-wrap:hover .card-title {
  color: #8b6914;
}

.card-status-tag {
  display: inline-block;
  vertical-align: middle;
  margin-right: 6px;
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
  font-weight: 500;
  white-space: nowrap;
  transform: translateY(-1px);
}

.card-status-tag--saved {
  color: #1e4d8c;
  background: rgba(191, 219, 254, 0.55);
  border: 1px solid rgba(147, 197, 253, 0.45);
}

.card-status-tag--draft {
  color: #9a3412;
  background: rgba(254, 215, 170, 0.55);
  border: 1px solid rgba(253, 186, 116, 0.45);
}

.card-title {
  font-size: 17px;
  font-weight: 700;
  color: #2c2418;
  margin: 0;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  letter-spacing: 0.01em;
  transition: color 0.15s;
}

.card-excerpt {
  font-size: 13px;
  color: #6b5f4f;
  line-height: 1.65;
  margin: 0;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  cursor: pointer;
  transition: color 0.15s;
}

.card-excerpt:hover {
  color: #8b6914;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.card-title-wrap,
.card-excerpt,
.card-bottom {
  position: relative;
  z-index: 1;
}

.card-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.42);
  color: #b8a990;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.card-icon-btn:hover:not(:disabled) {
  color: #6b5f4f;
  background: rgba(255, 255, 255, 0.72);
}

.card-icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.card-icon-btn--delete:hover {
  color: #b91c1c;
  background: rgba(254, 226, 226, 0.7);
}

.card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.55);
}

.card-time {
  font-size: 12px;
  color: #a89880;
  white-space: nowrap;
}

:deep(.preview-modal .ant-modal-content) {
  background: rgba(255, 255, 255, 0.68);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.78);
  box-shadow: 0 16px 48px rgba(92, 73, 48, 0.1);
  border-radius: 16px;
  overflow: hidden;
}

:deep(.preview-modal .ant-modal-header) {
  background: rgba(255, 255, 255, 0.45);
  border-bottom: 1px solid rgba(255, 255, 255, 0.55);
}

:deep(.preview-modal .ant-modal-title) {
  color: #2c2418;
  font-weight: 600;
}

:deep(.preview-modal .ant-modal-close-x) {
  color: #8a7d6b;
}

.pagination-bar :deep(.ant-pagination-item),
.pagination-bar :deep(.ant-pagination-prev),
.pagination-bar :deep(.ant-pagination-next) {
  background: rgba(255, 255, 255, 0.52);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-color: rgba(255, 255, 255, 0.62);
}

.pagination-bar :deep(.ant-pagination-item a),
.pagination-bar :deep(.ant-pagination-item-link) {
  color: #7a6f5f;
}

.pagination-bar :deep(.ant-pagination-item-active) {
  background: rgba(139, 105, 20, 0.65);
  border-color: rgba(255, 255, 255, 0.3);
}

.pagination-bar :deep(.ant-pagination-item-active a) {
  color: #fffdf8;
}

.preview-modal-body {
  min-height: 320px;
}

.preview-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
}

.preview-scroll {
  max-height: min(70vh, 640px);
  overflow-y: auto;
  padding-right: 4px;
  outline: none;
}

.preview-scroll :deep(.md-editor-preview) {
  padding: 8px 4px 16px;
}

.pagination-bar {
  display: flex;
  justify-content: center;
  padding-top: 8px;
}
</style>

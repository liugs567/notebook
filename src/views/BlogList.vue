<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue'
// 引入 Ant Design Icons
import {
  PlusOutlined,
  SearchOutlined,
  FileSearchOutlined,
  ReloadOutlined,
  DeleteOutlined, 
  EditOutlined, 
  EyeOutlined,
  ExclamationCircleFilled,
  InboxOutlined,
  FileMarkdownOutlined,
  FolderOutlined,
  CloseOutlined,
  TagsOutlined,
  DiffOutlined,
  ImportOutlined,
} from '@ant-design/icons-vue'
import {
  fetchList,
  deleteArticle,
  importArticles,
  fetchTags,
  type BlogIndexArticle,
  type ImportResultItem,
  type ImportMode,
  type ImportFile,
  getImportRelativePath,
} from '../api/blog'
import { formatDateTime } from '../utils/date'
import { useContentSearch } from '../composables/useContentSearch'

const router = useRouter()
const { openSearch } = useContentSearch()

const items = ref<BlogIndexArticle[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(10)
const loading = ref(false)
const keyword = ref('')
const statusFilter = ref('')
const tagFilter = ref('')
const allTags = ref<string[]>([])
const importVisible = ref(false)

// --- 批量导入 ---
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

function onImportKindChange() {
  clearQueue()
}

function onFolderModeChange() {
  if (importKind.value === 'folder') clearQueue()
}

function addMdFiles(files: File[]) {
  const mds = files.filter((f) => {
    const rel = fileRelativePath(f).replace(/\\/g, '/')
    return isMdFile(f.name) && !rel.includes('/')
  })
  if (mds.length === 0) {
    message.warning('请选择 .md 文件')
    return
  }
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

  if (nested.length === 0) {
    message.warning('请选择一个文件夹')
    return
  }
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
    const rel = (
      (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
    ).replace(/\\/g, '/')
    return tagImportPath(f, rel)
  })
  setFolderFiles(files)
  input.value = ''
}

function pickFiles() {
  if (importKind.value === 'md') {
    fileInputRef.value?.click()
  } else {
    folderInputRef.value?.click()
  }
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = []
  let batch: FileSystemEntry[]
  do {
    batch = await new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
    all.push(...batch)
  } while (batch.length > 0)
  return all
}

async function traverseEntry(
  entry: FileSystemEntry,
  files: File[],
  basePath = '',
) {
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
    for (const sub of entries) {
      await traverseEntry(sub, files, dirPath)
    }
  }
}

async function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  if (importing.value) return

  const items = e.dataTransfer?.items
  const collected: File[] = []

  if (items?.length) {
    const tasks: Promise<void>[] = []
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.()
      if (entry) tasks.push(traverseEntry(entry, collected))
    }
    if (tasks.length > 0) await Promise.all(tasks)
  }

  const files = collected.length > 0
    ? collected
    : Array.from(e.dataTransfer?.files || [])

  if (importKind.value === 'md') {
    addMdFiles(files)
  } else {
    setFolderFiles(files)
  }
}

function removeQueueItem(key: string) {
  if (importKind.value === 'md') {
    pendingFiles.value = pendingFiles.value.filter(
      (f) => `file:${f.name}` !== key,
    )
    rebuildMdQueue()
  } else {
    clearQueue()
  }
}

function clearQueue() {
  pendingFiles.value = []
  importQueue.value = []
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function startImport() {
  if (importQueue.value.length === 0) {
    message.warning('请先选择要导入的内容')
    return
  }

  importing.value = true
  importProgress.value = 10
  try {
    importProgress.value = 40
    const res = await importArticles(pendingFiles.value, {
      mode: importMode.value,
      folderName:
        importKind.value === 'folder'
          ? importQueue.value[0]?.name
          : undefined,
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
    const msg =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data
            ?.message
        : undefined
    message.error(msg || '导入失败')
  } finally {
    importing.value = false
    importProgress.value = 0
  }
}

function goEditFromResult(id: string) {
  resultVisible.value = false
  router.push(`/blog/edit/${id}`)
}

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

const columns: TableColumnsType<BlogIndexArticle> = [
  { title: '标题', dataIndex: 'title', key: 'title' },
  { title: '分类', key: 'tags', width: 120 },
  { title: '来源', key: 'source', width: 100 },
  { title: '状态', key: 'status', width: 100 },
  { title: '创建时间', key: 'createTime', width: 160 },
  { title: '更新时间', key: 'updateTime', width: 160 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' },
]

const pagination = computed(() => ({
  current: page.value,
  pageSize: size.value,
  total: total.value,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50'],
  showTotal: (t: number) => `共 ${t} 篇`,
}))

async function loadTags() {
  try {
    const res = await fetchTags()
    allTags.value = res.data.data
  } catch {
    allTags.value = []
  }
}

async function loadList() {
  loading.value = true
  try {
    const res = await fetchList({
      page: page.value,
      size: size.value,
      keyword: keyword.value || undefined,
      status: statusFilter.value || undefined,
      tag: tagFilter.value || undefined,
    })
    const data = res.data.data
    items.value = data.items
    total.value = data.total
  } catch {
    message.error('加载列表失败')
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  loadList()
}

function onReset() {
  keyword.value = ''
  statusFilter.value = ''
  tagFilter.value = ''
  page.value = 1
  loadList()
}

function toggleImport() {
  importVisible.value = !importVisible.value
}

function selectTag(name: string) {
  tagFilter.value = tagFilter.value === name ? '' : name
  page.value = 1
  loadList()
}

function clearTagFilter() {
  tagFilter.value = ''
  page.value = 1
  loadList()
}

function onTableChange(pag: TablePaginationConfig) {
  page.value = pag.current ?? page.value
  size.value = pag.pageSize ?? size.value
  loadList()
}

function goCreate() {
  router.push('/blog/create')
}

function goCategories() {
  router.push('/blog/categories')
}

function goDiff() {
  router.push('/blog/diff')
}

function goView(id: string) {
  router.push(`/blog/view/${id}`)
}

function goEdit(id: string) {
  router.push(`/blog/edit/${id}`)
}

async function doDelete(id: string) {
  try {
    await deleteArticle(id)
    message.success('删除成功')
    await loadList()
  } catch {
    message.error('删除失败')
  }
}

function sourceLabel(source: string) {
  return source === 'temp' ? '临时草稿' : '已保存'
}

function sourceColor(source: string) {
  return source === 'temp' ? 'warning' : 'success'
}

function statusLabel(item: BlogIndexArticle) {
  return item.status === 'published' ? '已发布' : '未发布'
}

function statusBadgeStatus(item: BlogIndexArticle) {
  return item.status === 'published' ? 'success' : 'default'
}

onMounted(async () => {
  await loadTags()
  await loadList()
})
</script>

<template>
  <div class="blog-list-page">
    <div class="page-header-wrapper">
      <div class="page-header-left">
        <h2 class="page-title">文章管理</h2>
        <p class="page-subtitle">管理和发布您的博客文章内容</p>
      </div>
      <a-space :size="12">
        <a-button size="large" @click="openSearch">
          <template #icon><FileSearchOutlined /></template>
          内容检索
        </a-button>
        <a-button size="large" @click="goDiff">
          <template #icon><DiffOutlined /></template>
          文本对比
        </a-button>
        <a-button size="large" @click="goCategories">
          <template #icon><TagsOutlined /></template>
          分类管理
        </a-button>
        <a-button
          type="primary"
          size="large"
          :ghost="!importVisible"
          @click="toggleImport"
        >
          <template #icon><ImportOutlined /></template>
          导入文章
        </a-button>
        <a-button type="primary" size="large" class="create-btn" @click="goCreate">
          <template #icon><PlusOutlined /></template>
          新建文章
        </a-button>
      </a-space>
    </div>

    <div v-show="importVisible" class="import-section">
      <div class="import-section-header">
        <span class="import-section-title">导入 Markdown</span>
      </div>

      <div class="import-mode-bar">
        <a-radio-group
          v-model:value="importKind"
          :disabled="importing"
          @change="onImportKindChange"
        >
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
        <input
          ref="fileInputRef"
          type="file"
          accept=".md,text/markdown"
          multiple
          hidden
          @change="onFileInputChange"
        />
        <input
          ref="folderInputRef"
          type="file"
          multiple
          hidden
          webkitdirectory
          @change="onFolderInputChange"
        />

        <p class="import-dropzone-icon">
          <InboxOutlined />
        </p>
        <p class="import-dropzone-text">
          {{ importKind === 'md' ? '拖拽或选择 .md 文件' : '拖拽或选择一个文件夹' }}
        </p>
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
            <a-button
              type="primary"
              size="small"
              :loading="importing"
              :disabled="importQueue.length === 0"
              @click="startImport"
            >
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
                  <a-tag :bordered="false" style="margin-left: 8px">
                    {{ item.type === 'folder' ? '文件夹' : '文件' }}
                  </a-tag>
                </template>
                <template #description>
                  {{ item.fileCount }} 个文件 · {{ formatSize(item.size) }}
                </template>
              </a-list-item-meta>
              <template #actions>
                <a-button
                  type="text"
                  size="small"
                  :disabled="importing"
                  @click="removeQueueItem(item.key)"
                >
                  <CloseOutlined />
                </a-button>
              </template>
            </a-list-item>
          </template>
        </a-list>
      </div>

      <a-progress
        v-if="importing"
        :percent="importProgress"
        status="active"
        :show-info="false"
        style="margin-top: 12px"
      />
    </div>

    <a-card :bordered="false" class="list-card">
      <div class="filter-section">
        <a-space wrap :size="16">
          <a-input
            v-model:value="keyword"
            placeholder="输入文章标题搜索..."
            allow-clear
            style="width: 280px"
            @pressEnter="onSearch"
          >
            <template #prefix><SearchOutlined style="color: rgba(0,0,0,0.25)" /></template>
          </a-input>
          
          <a-select
            v-model:value="statusFilter"
            placeholder="筛选类型"
            allow-clear
            style="width: 180px"
            @change="onSearch"
          >
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="published">已发布</a-select-option>
            <a-select-option value="temp">临时草稿</a-select-option>
          </a-select>

          <a-button type="primary" ghost @click="onSearch">筛选</a-button>
          <a-button @click="onReset">重置</a-button>
        </a-space>

        <a-button :loading="loading" shape="circle" @click="loadList" title="刷新数据">
          <template #icon><ReloadOutlined /></template>
        </a-button>
      </div>

      <div v-if="allTags.length > 0" class="category-section">
        <span class="category-section-label">分类：</span>
        <a-space wrap :size="8">
          <a-checkable-tag
            :checked="!tagFilter"
            @change="clearTagFilter"
          >
            全部
          </a-checkable-tag>
          <a-checkable-tag
            v-for="tag in allTags"
            :key="tag"
            :checked="tagFilter === tag"
            @change="() => selectTag(tag)"
          >
            {{ tag }}
          </a-checkable-tag>
        </a-space>
      </div>

      <a-table
        class="article-table"
        :columns="columns"
        :data-source="items"
        :loading="loading"
        :pagination="pagination"
        row-key="id"
        :scroll="{ x: 900 }"
        @change="onTableChange"
      >
        <template #emptyText>
          <a-empty description="这里太空了，还没有任何文章">
            <a-button type="primary" @click="goCreate">
              <template #icon><PlusOutlined /></template>
              撰写第一篇文章
            </a-button>
          </a-empty>
        </template>

        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'title'">
            <a class="article-title-link" @click="goView(record.id)">
              {{ record.title }}
            </a>
          </template>

          <template v-else-if="column.key === 'tags'">
            <a-space v-if="record.tags?.length" wrap :size="4">
              <a-tag v-for="tag in record.tags" :key="tag" color="blue" :bordered="false">
                {{ tag }}
              </a-tag>
            </a-space>
            <span v-else class="empty-text">—</span>
          </template>

          <template v-else-if="column.key === 'source'">
            <a-tag :color="sourceColor(record.source)" :bordered="false">
              {{ sourceLabel(record.source) }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'status'">
            <a-badge :status="statusBadgeStatus(record)" :text="statusLabel(record)" />
          </template>

          <template v-else-if="column.key === 'createTime'">
            <span class="time-text">{{ formatDateTime(record.createTime) }}</span>
          </template>

          <template v-else-if="column.key === 'updateTime'">
            <span class="time-text">{{ formatDateTime(record.updateTime) }}</span>
          </template>

          <template v-else-if="column.key === 'action'">
            <div class="action-buttons">
              <a @click="goView(record.id)" class="action-link">
                <EyeOutlined /> 查看
              </a>
              <a-divider type="vertical" />
              <a @click="goEdit(record.id)" class="action-link edit-link">
                <EditOutlined /> 编辑
              </a>
              <a-divider type="vertical" />
              <a-popconfirm
                title="确定要删除这篇文章吗？"
                description="删除后数据将无法恢复。"
                ok-text="确定"
                cancel-text="取消"
                ok-type="danger"
                @confirm="doDelete(record.id)"
              >
                <template #icon>
                  <ExclamationCircleFilled style="color: #ff4d4f" />
                </template>
                <a class="action-link delete-link">
                  <DeleteOutlined /> 删除
                </a>
              </a-popconfirm>
            </div>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="resultVisible"
      title="导入结果"
      :footer="null"
      width="560px"
    >
      <a-list size="small" :data-source="importResults">
        <template #renderItem="{ item }">
          <a-list-item>
            <a-list-item-meta>
              <template #title>
                <a-space>
                  <a-tag :color="resultStatusColor(item.status)" :bordered="false">
                    {{ resultStatusLabel(item.status) }}
                  </a-tag>
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
.blog-list-page {
  max-width: 1250px;
  margin: 0 auto;
  padding: 28px 24px;
  background-color: #f8fafc; /* 给予页面微弱的底色衬托卡片 */
  min-height: 100vh;
}

/* 顶部标题区样式增强 */
.page-header-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 4px 0;
}

.page-subtitle {
  font-size: 14px;
  color: #64748b;
  margin: 0;
}

.create-btn {
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.25);
  border-radius: 6px;
}

/* 卡片阴影与圆角微调 */
.list-card {
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.03);
  border-radius: 8px;
  background: #ffffff;
}

.list-card :deep(.ant-card-body) {
  padding: 24px;
}

/* 过滤区域弹性布局 */
.filter-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 4px;
}

.category-section {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 16px;
}

.category-section-label {
  flex-shrink: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 22px;
}

.empty-text {
  color: #cbd5e1;
}

/* 表格内元素美化 */
.article-title-link {
  font-weight: 500;
  color: #1e293b;
  transition: color 0.2s;
  word-break: break-word;
  white-space: normal;
  line-height: 1.5;
}

.article-title-link:hover {
  color: #1677ff;
}

.time-text {
  color: #64748b;
  font-size: 13px;
}

/* 操作按钮美化 */
.action-buttons {
  display: flex;
  align-items: center;
}

.action-link {
  font-size: 13px;
  color: #475569;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: color 0.2s;
}

.action-link:hover {
  color: #1677ff;
}

.edit-link:hover {
  color: #722ed1; /* 编辑给与个性的紫色 */
}

.delete-link {
  color: #ff4d4f;
}

.delete-link:hover {
  color: #ff7875 !important;
}

.article-table :deep(.ant-table-thead > tr > th) {
  background-color: #f8fafc; /* 表头浅色加深 */
  font-weight: 600;
  color: #334155;
}

/* 导入区域（独立于列表卡片） */
.import-section {
  margin-bottom: 24px;
  padding: 24px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.03);
}

.import-section-header {
  margin-bottom: 12px;
}

.import-mode-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.import-folder-mode {
  padding-left: 4px;
}

.import-section-title {
  font-weight: 600;
  color: #334155;
  font-size: 15px;
}

.import-section-hint {
  font-size: 13px;
  color: #94a3b8;
}

.import-dropzone {
  border: 1px dashed #d9d9d9;
  border-radius: 8px;
  background: #fafafa;
  padding: 24px 16px;
  text-align: center;
  transition: border-color 0.2s, background 0.2s;
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
  font-size: 48px;
  color: #1677ff;
  margin: 0 0 8px;
}

.import-dropzone-text {
  margin: 0 0 4px;
  font-size: 15px;
  color: #334155;
}

.import-dropzone-hint {
  margin: 0 0 16px;
  font-size: 13px;
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
</style>
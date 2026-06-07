<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  FolderOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons-vue'
import {
  fetchList,
  fetchTagStats,
  createTag,
  renameTag,
  deleteTag,
  assignArticlesToTag,
  type BlogIndexArticle,
  type TagStat,
} from '../api/blog'
import { formatDateTime } from '../utils/date'

const router = useRouter()

const tagStats = ref<TagStat[]>([])
const tagsLoading = ref(false)
const selectedTag = ref('')

const articles = ref<BlogIndexArticle[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(10)
const articlesLoading = ref(false)
const keyword = ref('')
const articleFilter = ref<'all' | 'in' | 'out'>('all')
const selectedRowKeys = ref<string[]>([])
const assigning = ref(false)

const createVisible = ref(false)
const createName = ref('')
const createLoading = ref(false)

const renameVisible = ref(false)
const renameTarget = ref('')
const renameName = ref('')
const renameLoading = ref(false)

const columns: TableColumnsType<BlogIndexArticle> = [
  { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true, width: 360 },
  { title: '分类', key: 'tags', width: 220 },
  { title: '状态', key: 'status', width: 100 },
  { title: '更新时间', key: 'updateTime', width: 170 },
]

const pagination = computed(() => ({
  current: page.value,
  pageSize: size.value,
  total: total.value,
  showSizeChanger: true,
  showTotal: (t: number) => `共 ${t} 篇`,
}))

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: (string | number)[]) => {
    selectedRowKeys.value = keys as string[]
  },
}))

const filteredHint = computed(() => {
  if (!selectedTag.value) return '请先在左侧选择一个分类'
  if (articleFilter.value === 'in') return `显示「${selectedTag.value}」下的文章`
  if (articleFilter.value === 'out') return `显示未加入「${selectedTag.value}」的文章`
  return '显示全部文章'
})

async function loadTags() {
  tagsLoading.value = true
  try {
    const res = await fetchTagStats()
    tagStats.value = res.data.data
    if (selectedTag.value && !tagStats.value.some((t) => t.name === selectedTag.value)) {
      selectedTag.value = ''
    }
  } catch {
    message.error('加载分类失败')
  } finally {
    tagsLoading.value = false
  }
}

async function loadArticles() {
  articlesLoading.value = true
  try {
    const res = await fetchList({
      page: 1,
      size: 500,
      keyword: keyword.value.trim() || undefined,
    })
    let list = res.data.data.items

    if (selectedTag.value) {
      if (articleFilter.value === 'in') {
        list = list.filter((a) => (a.tags || []).includes(selectedTag.value))
      } else if (articleFilter.value === 'out') {
        list = list.filter((a) => !(a.tags || []).includes(selectedTag.value))
      }
    }

    total.value = list.length
    const start = (page.value - 1) * size.value
    articles.value = list.slice(start, start + size.value)
  } catch {
    message.error('加载文章失败')
  } finally {
    articlesLoading.value = false
  }
}

function selectTag(name: string) {
  selectedTag.value = selectedTag.value === name ? '' : name
  selectedRowKeys.value = []
  page.value = 1
  void loadArticles()
}

function onArticleFilterChange() {
  page.value = 1
  selectedRowKeys.value = []
  void loadArticles()
}

function onSearch() {
  page.value = 1
  void loadArticles()
}

function onTableChange(pag: TablePaginationConfig) {
  page.value = pag.current || 1
  size.value = pag.pageSize || 10
  void loadArticles()
}

function goBack() {
  router.push('/blog/list')
}

function openCreate() {
  createName.value = ''
  createVisible.value = true
}

async function submitCreate() {
  const name = createName.value.trim()
  if (!name) {
    message.warning('请输入分类名称')
    return
  }
  createLoading.value = true
  try {
    await createTag(name)
    message.success('分类创建成功')
    createVisible.value = false
    await loadTags()
    selectedTag.value = name
    await loadArticles()
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    message.error(msg || '创建失败')
  } finally {
    createLoading.value = false
  }
}

function openRename(name: string) {
  renameTarget.value = name
  renameName.value = name
  renameVisible.value = true
}

async function submitRename() {
  const newName = renameName.value.trim()
  if (!newName) {
    message.warning('请输入分类名称')
    return
  }
  renameLoading.value = true
  try {
    await renameTag(renameTarget.value, newName)
    message.success('重命名成功')
    renameVisible.value = false
    if (selectedTag.value === renameTarget.value) {
      selectedTag.value = newName
    }
    await loadTags()
    await loadArticles()
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    message.error(msg || '重命名失败')
  } finally {
    renameLoading.value = false
  }
}

async function confirmDelete(name: string) {
  try {
    await deleteTag(name)
    message.success('分类已删除')
    if (selectedTag.value === name) {
      selectedTag.value = ''
    }
    await loadTags()
    await loadArticles()
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    message.error(msg || '删除失败')
  }
}

async function batchAssign(mode: 'add' | 'remove') {
  if (!selectedTag.value) {
    message.warning('请先选择分类')
    return
  }
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先选择文章')
    return
  }
  assigning.value = true
  try {
    const res = await assignArticlesToTag({
      tag: selectedTag.value,
      articleIds: selectedRowKeys.value,
      mode,
    })
    message.success(res.data.message)
    selectedRowKeys.value = []
    await loadTags()
    await loadArticles()
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    message.error(msg || '操作失败')
  } finally {
    assigning.value = false
  }
}

function statusLabel(item: BlogIndexArticle) {
  return item.status === 'published' ? '已发布' : '未发布'
}

function statusBadgeStatus(item: BlogIndexArticle) {
  return item.status === 'published' ? 'success' : 'default'
}

onMounted(async () => {
  await loadTags()
  await loadArticles()
})
</script>

<template>
  <div class="category-page">
    <div class="page-header-wrapper">
      <div class="page-header-left">
        <h2 class="page-title">分类管理</h2>
        <p class="page-subtitle">管理文章分类，并快速将文章加入指定分类</p>
      </div>
      <a-space :size="12">
        <a-button size="large" @click="goBack">
          <template #icon><ArrowLeftOutlined /></template>
          返回列表
        </a-button>
        <a-button type="primary" size="large" @click="openCreate">
          <template #icon><PlusOutlined /></template>
          新建分类
        </a-button>
      </a-space>
    </div>

    <div class="main-layout">
      <a-card :bordered="false" class="tag-panel" title="分类列表">
        <template #extra>
          <a-button type="text" size="small" :loading="tagsLoading" @click="loadTags">
            <template #icon><ReloadOutlined /></template>
          </a-button>
        </template>

        <a-spin :spinning="tagsLoading">
          <a-empty v-if="tagStats.length === 0" description="暂无分类，点击右上角新建" />
          <div v-else class="tag-list">
            <div
              v-for="item in tagStats"
              :key="item.name"
              class="tag-item"
              :class="{ active: selectedTag === item.name }"
              @click="selectTag(item.name)"
            >
              <div class="tag-item-main">
                <FolderOutlined class="tag-icon" />
                <span class="tag-name">{{ item.name }}</span>
                <a-badge
                  :count="item.count"
                  :number-style="{ backgroundColor: selectedTag === item.name ? '#1677ff' : '#94a3b8' }"
                  :overflow-count="999"
                />
              </div>
              <div class="tag-item-actions" @click.stop>
                <a-button type="text" size="small" @click="openRename(item.name)">
                  <template #icon><EditOutlined /></template>
                </a-button>
                <a-popconfirm
                  title="确定删除该分类？文章不会被删除，仅移除分类标签"
                  ok-text="删除"
                  cancel-text="取消"
                  @confirm="confirmDelete(item.name)"
                >
                  <a-button type="text" size="small" danger>
                    <template #icon><DeleteOutlined /></template>
                  </a-button>
                </a-popconfirm>
              </div>
            </div>
          </div>
        </a-spin>
      </a-card>

      <a-card :bordered="false" class="article-panel">
        <div class="article-toolbar">
          <div class="toolbar-left">
            <a-input
              v-model:value="keyword"
              placeholder="搜索文章标题..."
              allow-clear
              style="width: 260px"
              @pressEnter="onSearch"
            >
              <template #prefix><SearchOutlined style="color: rgba(0,0,0,0.25)" /></template>
            </a-input>

            <a-radio-group
              v-model:value="articleFilter"
              :disabled="!selectedTag"
              @change="onArticleFilterChange"
            >
              <a-radio-button value="all">全部</a-radio-button>
              <a-radio-button value="in">已在分类</a-radio-button>
              <a-radio-button value="out">未在分类</a-radio-button>
            </a-radio-group>

            <span class="filter-hint">{{ filteredHint }}</span>
          </div>

          <a-space>
            <a-button
              type="primary"
              :disabled="!selectedTag || selectedRowKeys.length === 0"
              :loading="assigning"
              @click="batchAssign('add')"
            >
              加入分类
            </a-button>
            <a-button
              :disabled="!selectedTag || selectedRowKeys.length === 0"
              :loading="assigning"
              danger
              @click="batchAssign('remove')"
            >
              <template #icon><MinusCircleOutlined /></template>
              移出分类
            </a-button>
            <a-button :loading="articlesLoading" shape="circle" @click="loadArticles">
              <template #icon><ReloadOutlined /></template>
            </a-button>
          </a-space>
        </div>

        <a-table
          class="article-table"
          :columns="columns"
          :data-source="articles"
          :loading="articlesLoading"
          :pagination="pagination"
          :row-selection="rowSelection"
          row-key="id"
          :scroll="{ x: 900 }"
          @change="onTableChange"
        >
          <template #emptyText>
            <a-empty description="暂无文章" />
          </template>

          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'tags'">
              <a-space v-if="record.tags?.length" wrap :size="4">
                <a-tag v-for="tag in record.tags" :key="tag" color="blue">{{ tag }}</a-tag>
              </a-space>
              <span v-else class="empty-text">—</span>
            </template>
            <template v-else-if="column.key === 'status'">
              <a-badge :status="statusBadgeStatus(record)" :text="statusLabel(record)" />
            </template>
            <template v-else-if="column.key === 'updateTime'">
              {{ formatDateTime(record.updateTime) }}
            </template>
          </template>
        </a-table>
      </a-card>
    </div>

    <a-modal
      v-model:open="createVisible"
      title="新建分类"
      :confirm-loading="createLoading"
      ok-text="创建"
      cancel-text="取消"
      @ok="submitCreate"
    >
      <a-input
        v-model:value="createName"
        placeholder="输入分类名称"
        allow-clear
        @pressEnter="submitCreate"
      />
    </a-modal>

    <a-modal
      v-model:open="renameVisible"
      title="重命名分类"
      :confirm-loading="renameLoading"
      ok-text="保存"
      cancel-text="取消"
      @ok="submitRename"
    >
      <a-input
        v-model:value="renameName"
        placeholder="输入新名称"
        allow-clear
        @pressEnter="submitRename"
      />
    </a-modal>
  </div>
</template>

<style scoped>
.category-page {
  margin: 0 auto;
  padding: 28px 24px;
  background-color: #f8fafc;
  min-height: 100vh;
}

.page-header-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.page-subtitle {
  font-size: 14px;
  color: #64748b;
  margin: 4px 0 0;
}

.main-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 16px;
  align-items: start;
}

.tag-panel,
.article-panel {
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.03);
  border-radius: 8px;
  background: #fff;
}

.tag-panel :deep(.ant-card-body) {
  padding: 12px;
}

.article-panel :deep(.ant-card-body) {
  padding: 20px 24px;
}

.tag-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tag-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.tag-item:hover {
  background: #f1f5f9;
}

.tag-item.active {
  background: #eff6ff;
}

.tag-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.tag-icon {
  color: #64748b;
  flex-shrink: 0;
}

.tag-item.active .tag-icon {
  color: #1677ff;
}

.tag-name {
  font-weight: 500;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-item-actions {
  display: flex;
  opacity: 0;
  transition: opacity 0.15s;
}

.tag-item:hover .tag-item-actions,
.tag-item.active .tag-item-actions {
  opacity: 1;
}

.article-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.filter-hint {
  font-size: 13px;
  color: #94a3b8;
}

.empty-text {
  color: #cbd5e1;
}

@media (max-width: 960px) {
  .main-layout {
    grid-template-columns: 1fr;
  }
}
</style>

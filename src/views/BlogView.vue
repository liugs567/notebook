<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MdPreview, MdCatalog } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { fetchDetail } from '../api/blog'
import { formatDateTime } from '../utils/date'

const route = useRoute()
const router = useRouter()

const title = ref('')
const content = ref('')
const status = ref<'draft' | 'published'>('draft')
const source = ref<'saved' | 'temp'>('saved')
const createTime = ref(0)
const updateTime = ref(0)
const pageLoading = ref(false)
const error = ref('')

const previewId = computed(() => `blog-preview-${route.params.id}`)

/** 整页滚动，供大纲高亮与跳转 */
const scrollElement = ref<HTMLElement | string>(document.documentElement)
const scrollOffsetTop = 72

const statusText = computed(() =>
  status.value === 'published' ? '已发布' : '未发布',
)

const sourceText = computed(() =>
  source.value === 'temp' ? '临时草稿' : '已保存',
)

async function loadArticle() {
  const id = route.params.id as string
  if (!id) return

  pageLoading.value = true
  error.value = ''
  try {
    const res = await fetchDetail(id)
    const data = res.data.data
    title.value = data.title
    content.value = data.content
    status.value = data.status
    source.value = data.source
    createTime.value = data.createTime
    updateTime.value = data.updateTime
    document.title = data.title
  } catch {
    error.value = '加载文章失败'
  } finally {
    pageLoading.value = false
  }
}

function goBack() {
  router.push('/blog/list')
}

function goEdit() {
  router.push(`/blog/edit/${route.params.id}`)
}

onMounted(loadArticle)
</script>

<template>
  <div class="blog-view-page">
    <header class="toolbar">
      <button class="btn" @click="goBack">返回列表</button>
      <div class="toolbar-actions">
        <button class="btn btn-primary" @click="goEdit">编辑</button>
      </div>
    </header>

    <div v-if="pageLoading" class="loading">加载中...</div>

    <div v-else-if="error" class="error">{{ error }}</div>

    <article v-else class="article">
      <h1 class="article-title">{{ title }}</h1>
      <div class="article-meta">
        <span>{{ sourceText }}</span>
        <span>·</span>
        <span>{{ statusText }}</span>
        <span>·</span>
        <span>更新于 {{ formatDateTime(updateTime) }}</span>
      </div>

      <div class="article-body">
        <aside class="catalog-aside">
          <h2 class="catalog-label">大纲</h2>
          <MdCatalog
            :editor-id="previewId"
            :scroll-element="scrollElement"
            :scroll-element-offset-top="scrollOffsetTop"
            :offset-top="scrollOffsetTop"
            class="view-catalog"
          />
        </aside>

        <div class="preview-main">
          <MdPreview
            :id="previewId"
            :model-value="content"
            language="zh-CN"
            preview-theme="cyanosis"
          />
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.blog-view-page {
  /* max-width: 1100px; */
  margin: 0 auto;
  padding: 0 16px 32px;
  min-height: 100vh;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  position: sticky;
  top: 0;
  background: #f8f9fa;
  z-index: 10;
  border-bottom: 1px solid #eee;
  margin-bottom: 24px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.article-title {
  margin: 0 0 12px;
  font-size: 1.75rem;
  line-height: 1.35;
  word-break: break-word;
}

.article-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 14px;
  color: #888;
  margin-bottom: 24px;
}

.article-body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.catalog-aside {
  width: 220px;
  flex-shrink: 0;
  position: sticky;
  top: 72px;
  max-height: calc(100vh - 88px);
  overflow-y: auto;
  padding: 12px 0;
}

.catalog-label {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #666;
}

.view-catalog :deep(.md-editor-catalog) {
  position: static;
  direction: ltr;
}

.view-catalog :deep(.md-editor-catalog-link) {
  font-size: 13px;
}

.preview-main {
  flex: 1;
  min-width: 0;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #eee;
  padding: 16px 20px;
}

.preview-main :deep(.md-editor-preview) {
  padding: 0;
}

@media (max-width: 768px) {
  .article-body {
    flex-direction: column;
  }

  .catalog-aside {
    width: 100%;
    position: static;
    max-height: none;
    padding: 0 0 8px;
    border-bottom: 1px solid #eee;
  }
}

.loading,
.error {
  text-align: center;
  padding: 48px;
  color: #888;
}

.error {
  color: #c62828;
}
</style>

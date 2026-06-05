<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MdPreview, MdCatalog } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { fetchDetail } from '../api/blog'
import { formatDateTime } from '../utils/date'

const route = useRoute()
const router = useRouter()

const title = ref('')
const content = ref('')
const status = ref<'published' | undefined>()
const source = ref<'saved' | 'temp'>('saved')
const createTime = ref(0)
const updateTime = ref(0)
const pageLoading = ref(false)
const error = ref('')

const catalogWidth = ref(220)
const isResizing = ref(false)
const MIN_CATALOG_WIDTH = 140
const MAX_CATALOG_WIDTH = 520

let resizeStartX = 0
let resizeStartWidth = 0

const previewId = computed(() => `blog-preview-${route.params.id}`)

/** 整页滚动，供大纲高亮与跳转 */
const scrollElement = ref<HTMLElement | string>(document.documentElement)
const scrollOffsetTop = 16

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

function onResizeMove(e: MouseEvent) {
  const delta = e.clientX - resizeStartX
  catalogWidth.value = Math.min(
    MAX_CATALOG_WIDTH,
    Math.max(MIN_CATALOG_WIDTH, resizeStartWidth + delta),
  )
}

function stopResize() {
  isResizing.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', stopResize)
}

function startResize(e: MouseEvent) {
  e.preventDefault()
  isResizing.value = true
  resizeStartX = e.clientX
  resizeStartWidth = catalogWidth.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', stopResize)
}

onMounted(loadArticle)
onUnmounted(stopResize)
</script>

<template>
  <div class="blog-view-page">
    <nav class="fab-group" aria-label="文章操作">
      <button class="fab-btn" type="button" title="返回列表" @click="goBack">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M19 12H5M12 19l-7-7 7-7"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        class="fab-btn fab-btn--primary"
        type="button"
        title="编辑"
        @click="goEdit"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </nav>

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

      <div class="article-body" :class="{ 'article-body--resizing': isResizing }">
        <aside class="catalog-aside" :style="{ width: `${catalogWidth}px` }">
          <h2 class="catalog-label">大纲</h2>
          <MdCatalog
            :editor-id="previewId"
            :scroll-element="scrollElement"
            :scroll-element-offset-top="scrollOffsetTop"
            :offset-top="scrollOffsetTop"
            class="view-catalog"
          />
        </aside>

        <div
          class="split-handle"
          title="拖拽调整宽度"
          @mousedown="startResize"
        />

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
  margin: 0 auto;
  padding: 24px 16px 32px 16px;
  min-height: 100vh;
}

.fab-group {
  position: fixed;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 20000;
}

.fab-btn {
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: #fff;
  color: #475569;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.04);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, box-shadow 0.2s, color 0.2s, background 0.2s;
}

.fab-btn svg {
  width: 20px;
  height: 20px;
}

.fab-btn:hover {
  transform: scale(1.06);
  color: #1677ff;
  box-shadow: 0 4px 16px rgba(22, 119, 255, 0.18), 0 0 0 1px rgba(22, 119, 255, 0.08);
}

.fab-btn:active {
  transform: scale(0.98);
}

.fab-btn--primary {
  background: #1677ff;
  color: #fff;
}

.fab-btn--primary:hover {
  background: #4096ff;
  color: #fff;
  box-shadow: 0 4px 16px rgba(22, 119, 255, 0.35), 0 0 0 1px rgba(22, 119, 255, 0.1);
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
  align-items: flex-start;
}

.article-body--resizing {
  cursor: col-resize;
  user-select: none;
}

.catalog-aside {
  flex-shrink: 0;
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 12px 4px 12px 0;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.catalog-aside:hover {
  scrollbar-color: rgba(148, 163, 184, 0.55) transparent;
}

.catalog-aside::-webkit-scrollbar {
  width: 5px;
}

.catalog-aside::-webkit-scrollbar-track {
  background: transparent;
  margin: 4px 0;
}

.catalog-aside::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 999px;
  transition: background 0.2s;
}

.catalog-aside:hover::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.45);
}

.catalog-aside::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 116, 139, 0.75);
}

.catalog-aside::-webkit-scrollbar-thumb:active {
  background: rgba(71, 85, 105, 0.85);
}

.split-handle {
  flex-shrink: 0;
  width: 8px;
  align-self: stretch;
  min-height: 120px;
  margin: 0 8px;
  cursor: col-resize;
  position: relative;
  border-radius: 4px;
  transition: background 0.15s;
}

.split-handle::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: #e2e8f0;
  border-radius: 1px;
  transition: background 0.15s;
}

.split-handle:hover::after,
.article-body--resizing .split-handle::after {
  background: #1677ff;
}

.split-handle:hover,
.article-body--resizing .split-handle {
  background: rgba(22, 119, 255, 0.06);
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
  width: 100%;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #eee;
  padding: 16px 20px;
}

.preview-main :deep(.md-editor-preview) {
  padding: 0;
}

@media (max-width: 768px) {
  .blog-view-page {
    padding-right: 16px;
  }

  .fab-group {
    right: 12px;
    gap: 10px;
  }

  .fab-btn {
    width: 40px;
    height: 40px;
  }

  .fab-btn svg {
    width: 18px;
    height: 18px;
  }

  .article-body {
    flex-direction: column;
  }

  .catalog-aside {
    width: 100% !important;
    position: static;
    max-height: none;
    padding: 0 0 8px;
    border-bottom: 1px solid #eee;
  }

  .split-handle {
    display: none;
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

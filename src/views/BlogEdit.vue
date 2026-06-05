<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import {
  fetchDetail,
  saveArticle,
  uploadImage,
  fetchTags,
} from '../api/blog'
import { formatDateTime } from '../utils/date'

const route = useRoute()
const router = useRouter()

const articleId = ref('')
const title = ref('')
const content = ref('')
const tags = ref<string[]>([])
const tagOptions = ref<string[]>([])
const isPublished = ref(false)
const createTime = ref<number | undefined>()
const pageLoading = ref(false)
const savingDraft = ref(false)
const publishing = ref(false)

const autoSaveEnabled = ref(true)
const autoSaveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const autoSaveTime = ref(0)
const toast = ref('')
const toastType = ref<'success' | 'error'>('success')

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let lastSavedSnapshot = ''
const isMobile = ref(false)

const isEdit = computed(() => !!route.params.id)
const pageTitle = computed(() =>
  isEdit.value ? '编辑文章' : '新建文章',
)

const editorId = computed(() => `blog-editor-${articleId.value || 'new'}`)

const autoSaveHint = computed(() => {
  if (autoSaveStatus.value === 'saving') return '正在自动保存到临时草稿…'
  if (autoSaveStatus.value === 'saved' && autoSaveTime.value) {
    return `已自动保存到临时草稿（${formatDateTime(autoSaveTime.value)}）`
  }
  if (autoSaveStatus.value === 'error') return '自动保存失败'
  return ''
})

function snapshot() {
  return JSON.stringify({
    title: title.value,
    content: content.value,
    tags: tags.value,
  })
}

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toast.value = msg
  toastType.value = type
  setTimeout(() => {
    toast.value = ''
  }, 3000)
}

function updateDocumentTitle() {
  const t = title.value.trim() || pageTitle.value
  document.title = t
}

function scheduleAutoSave() {
  if (!autoSaveEnabled.value) return
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    void doAutoSave()
  }, 3000)
}

async function doAutoSave() {
  if (!autoSaveEnabled.value) return
  const current = snapshot()
  if (current === lastSavedSnapshot) return

  autoSaveStatus.value = 'saving'
  try {
    const res = await saveArticle({
      id: articleId.value || undefined,
      title: title.value,
      content: content.value,
      saveMode: 'auto',
      createTime: createTime.value,
      updateTime: Date.now(),
      tags: tags.value,
    })
    const data = res.data.data
    articleId.value = data.id
    createTime.value = data.createTime
    lastSavedSnapshot = snapshot()
    autoSaveStatus.value = 'saved'
    autoSaveTime.value = Date.now()

    if (route.name === 'BlogCreate' && articleId.value) {
      router.replace(`/blog/edit/${articleId.value}`)
    }
  } catch {
    autoSaveStatus.value = 'error'
  }
}

async function loadTags() {
  try {
    const res = await fetchTags()
    tagOptions.value = res.data.data
  } catch {
    tagOptions.value = []
  }
}

async function loadArticle() {
  const id = route.params.id as string
  if (!id) return

  pageLoading.value = true
  try {
    const res = await fetchDetail(id)
    const data = res.data.data
    articleId.value = data.id
    title.value = data.title
    content.value = data.content
    tags.value = data.tags ? [...data.tags] : []
    isPublished.value = data.status === 'published'
    createTime.value = data.createTime
    lastSavedSnapshot = snapshot()
    updateDocumentTitle()
  } catch {
    showToast('加载文章失败', 'error')
  } finally {
    pageLoading.value = false
  }
}

async function manualSave(publish: boolean) {
  if (!title.value.trim()) {
    showToast('请填写文章标题', 'error')
    return
  }

  if (publish) {
    publishing.value = true
  } else {
    savingDraft.value = true
  }

  try {
    const res = await saveArticle({
      id: articleId.value || undefined,
      title: title.value.trim(),
      content: content.value,
      ...(publish ? { status: 'published' as const } : {}),
      saveMode: 'manual',
      createTime: createTime.value,
      updateTime: Date.now(),
      tags: tags.value,
    })
    const data = res.data.data
    articleId.value = data.id
    createTime.value = data.createTime
    isPublished.value = data.status === 'published'
    tags.value = data.tags ? [...data.tags] : []
    lastSavedSnapshot = snapshot()
    autoSaveStatus.value = 'idle'

    if (route.name === 'BlogCreate') {
      router.replace(`/blog/edit/${articleId.value}`)
    }

    showToast(res.data.message || (publish ? '发布成功' : '保存成功'))
    await loadTags()
  } catch (err: unknown) {
    const msg =
      axiosMessage(err) || (publish ? '发布失败' : '保存失败')
    showToast(msg, 'error')
  } finally {
    savingDraft.value = false
    publishing.value = false
  }
}

function axiosMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as { response?: { data?: { message?: string } } }).response
    return res?.data?.message || ''
  }
  return ''
}

function goBack() {
  router.push('/blog/list')
}

async function onUploadImg(
  files: File[],
  callback: (urls: string[]) => void,
) {
  if (!articleId.value) {
    if (!autoSaveEnabled.value) {
      showToast('请先保存文章后再上传图片', 'error')
      return
    }
    await doAutoSave()
  }
  if (!articleId.value) {
    showToast('请先输入内容，等待自动保存后再上传图片', 'error')
    return
  }

  try {
    const urls: string[] = []
    for (const file of files) {
      const res = await uploadImage(articleId.value, file)
      urls.push(res.data.data.url)
    }
    callback(urls)
  } catch {
    showToast('图片上传失败', 'error')
  }
}

function onContentChange() {
  scheduleAutoSave()
}

function checkMobile() {
  isMobile.value = window.innerWidth < 768
}

watch(title, () => {
  updateDocumentTitle()
  scheduleAutoSave()
})

watch(content, () => {
  scheduleAutoSave()
})

watch(autoSaveEnabled, (enabled) => {
  if (!enabled) {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }
    autoSaveStatus.value = 'idle'
    return
  }
  scheduleAutoSave()
})

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  void loadTags()
  if (isEdit.value) {
    loadArticle()
  } else {
    lastSavedSnapshot = snapshot()
  }
})

onUnmounted(() => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  window.removeEventListener('resize', checkMobile)
})
</script>

<template>
  <div class="blog-edit-page">
    <header class="toolbar">
      <button class="btn" @click="goBack">返回列表</button>
      <span class="page-label">{{ pageTitle }}</span>
      <div class="toolbar-actions">
        <a-checkbox v-model:checked="autoSaveEnabled" class="autosave-checkbox">
          自动保存
        </a-checkbox>
        <button
          class="btn"
          :disabled="savingDraft || publishing || pageLoading"
          @click="manualSave(false)"
        >
          {{ savingDraft ? '保存中...' : '保存' }}
        </button>
        <button
          class="btn btn-primary"
          :disabled="savingDraft || publishing || pageLoading"
          @click="manualSave(true)"
        >
          {{ publishing ? '发布中...' : '发布' }}
        </button>
      </div>
    </header>

    <div v-if="toast" class="toast" :class="toastType">{{ toast }}</div>

    <div v-if="pageLoading" class="loading">加载中...</div>

    <template v-else>
      <div class="meta-row">
        <input
          v-model="title"
          type="text"
          class="title-input"
          placeholder="标题（必填，最多 60 字）"
          maxlength="60"
        />
        <a-select
          v-model:value="tags"
          mode="tags"
          class="tags-select"
          :options="tagOptions.map((t) => ({ value: t }))"
          placeholder="分类，回车添加"
          :token-separators="[',', '，']"
        />
      </div>

      <div class="editor-wrap">
        <MdEditor
          :id="editorId"
          v-model="content"
          language="zh-CN"
          :preview="!isMobile"
          :toolbars="[
            'bold',
            'underline',
            'italic',
            '-',
            'title',
            'strikeThrough',
            'quote',
            'unorderedList',
            'orderedList',
            'task',
            '-',
            'codeRow',
            'code',
            'link',
            'image',
            'table',
            '-',
            'revoke',
            'next',
            '=',
            'pageFullscreen',
            'fullscreen',
            'preview',
            'catalog',
          ]"
          :footers="['markdownTotal', '=', 'scrollSwitch']"
          preview-theme="cyanosis"
          :style="{ height: '100%' }"
          placeholder="开始写作..."
          @on-change="onContentChange"
          @on-upload-img="onUploadImg"
        />
      </div>

      <footer class="autosave-footer">
        <span
          v-if="autoSaveEnabled && autoSaveHint"
          class="autosave-hint"
          :class="{ error: autoSaveStatus === 'error' }"
        >
          {{ autoSaveHint }}
        </span>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.blog-edit-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.page-label {
  font-weight: 600;
  flex: 1;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.autosave-checkbox {
  font-size: 14px;
  white-space: nowrap;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  flex-shrink: 0;
}

.title-input {
  flex: 0 0 240px;
  width: 240px;
  max-width: 32%;
  padding: 6px 10px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-sizing: border-box;
}

.tags-select {
  flex: 1;
  min-width: 0;
}

.editor-wrap {
  flex: 1;
  min-height: 0;
  padding: 0 16px 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.editor-wrap :deep(.md-editor) {
  flex: 1;
  min-height: 0;
}

.autosave-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 16px 8px;
  flex-shrink: 0;
  font-size: 12px;
  color: #666;
}

.autosave-hint.error {
  color: #c62828;
}

.toast {
  margin: 0 16px;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 14px;
}

.toast.success {
  background: #e8f5e9;
  color: #2e7d32;
}

.toast.error {
  background: #ffebee;
  color: #c62828;
}

.loading {
  padding: 48px;
  text-align: center;
  color: #888;
}

@media (max-width: 767px) {
  .meta-row {
    flex-wrap: wrap;
  }

  .title-input {
    flex: 1 1 100%;
    width: 100%;
    max-width: none;
  }
}
</style>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { CodeDiff } from 'v-code-diff'
import {
  ArrowLeftOutlined,
  SwapOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue'
import { fetchList, fetchDetail, type BlogIndexArticle } from '../api/blog'

type DiffMode = 'article' | 'text'
type OutputFormat = 'side-by-side' | 'line-by-line'
type DiffStyle = 'word' | 'char'

const route = useRoute()
const router = useRouter()

const diffMode = ref<DiffMode>('text')
const outputFormat = ref<OutputFormat>('side-by-side')
const language = ref('plaintext')
const diffStyle = ref<DiffStyle>('word')
const forceInlineComparison = ref(false)
const trim = ref(false)
const noDiffLineFeed = ref(false)
const ignoreBlankLines = ref(false)
const ignoreTrailingSpace = ref(false)
const context = ref(10)

const articleOptions = ref<BlogIndexArticle[]>([])
const articlesLoading = ref(false)
const leftArticleId = ref<string>()
const rightArticleId = ref<string>()
const leftTitle = ref('旧文本')
const rightTitle = ref('新文本')
const leftContent = ref('')
const rightContent = ref('')
const leftText = ref('')
const rightText = ref('')
const contentLoading = ref(false)

const rawOldString = computed(() =>
  diffMode.value === 'article' ? leftContent.value : leftText.value,
)
const rawNewString = computed(() =>
  diffMode.value === 'article' ? rightContent.value : rightText.value,
)

function preprocessText(text: string) {
  let result = text
  if (ignoreTrailingSpace.value) {
    result = result.split('\n').map((line) => line.trimEnd()).join('\n')
  }
  if (ignoreBlankLines.value) {
    result = result.split('\n').filter((line) => line.trim() !== '').join('\n')
  }
  return result
}

const oldString = computed(() => preprocessText(rawOldString.value))
const newString = computed(() => preprocessText(rawNewString.value))

const canCompareArticles = computed(
  () => !!leftArticleId.value && !!rightArticleId.value,
)

async function loadArticleOptions() {
  articlesLoading.value = true
  try {
    const res = await fetchList({ page: 1, size: 500 })
    articleOptions.value = res.data.data.items
  } catch {
    articleOptions.value = []
    message.error('加载文章列表失败')
  } finally {
    articlesLoading.value = false
  }
}

async function loadArticleContent(side: 'left' | 'right', id: string) {
  const res = await fetchDetail(id)
  const data = res.data.data
  if (side === 'left') {
    leftContent.value = data.content
    leftTitle.value = data.title
  } else {
    rightContent.value = data.content
    rightTitle.value = data.title
  }
}

async function loadSelectedArticles() {
  if (!leftArticleId.value || !rightArticleId.value) return

  contentLoading.value = true
  try {
    await Promise.all([
      loadArticleContent('left', leftArticleId.value),
      loadArticleContent('right', rightArticleId.value),
    ])
  } catch {
    message.error('加载文章内容失败')
  } finally {
    contentLoading.value = false
  }
}

function applyQueryArticles() {
  const left = route.query.left as string | undefined
  const right = route.query.right as string | undefined
  if (!left || !right) return

  diffMode.value = 'article'
  leftArticleId.value = left
  rightArticleId.value = right
}

function swapSides() {
  if (diffMode.value === 'article') {
    const tempId = leftArticleId.value
    leftArticleId.value = rightArticleId.value
    rightArticleId.value = tempId

    const tempTitle = leftTitle.value
    leftTitle.value = rightTitle.value
    rightTitle.value = tempTitle

    const tempContent = leftContent.value
    leftContent.value = rightContent.value
    rightContent.value = tempContent
    return
  }

  const tempText = leftText.value
  leftText.value = rightText.value
  rightText.value = tempText
}

function goBack() {
  router.push('/blog/list')
}

function onDiffModeChange() {
  if (diffMode.value === 'article' && canCompareArticles.value) {
    loadSelectedArticles()
  }
}

watch([leftArticleId, rightArticleId], () => {
  if (diffMode.value !== 'article') return
  if (leftArticleId.value && rightArticleId.value) {
    loadSelectedArticles()
  } else {
    if (!leftArticleId.value) {
      leftContent.value = ''
      leftTitle.value = '旧文本'
    }
    if (!rightArticleId.value) {
      rightContent.value = ''
      rightTitle.value = '新文本'
    }
  }
})

onMounted(async () => {
  applyQueryArticles()
  await loadArticleOptions()
  if (leftArticleId.value && rightArticleId.value) {
    await loadSelectedArticles()
  }
})
</script>

<template>
  <div class="blog-diff-page">
    <div class="page-header-wrapper">
      <div class="page-header-left">
        <h2 class="page-title">文本对比</h2>
        <p class="page-subtitle">对比两篇文章或两段文本的差异</p>
      </div>
      <a-space :size="12">
        <a-button size="large" @click="goBack">
          <template #icon>
            <ArrowLeftOutlined />
          </template>
          返回列表
        </a-button>
      </a-space>
    </div>

    <a-card :bordered="false" class="diff-card">
      <div class="toolbar">
        <a-radio-group v-model:value="diffMode" button-style="solid" @change="onDiffModeChange">
          <a-radio-button value="text">自由文本</a-radio-button>
          <a-radio-button value="article">文章对比</a-radio-button>
        </a-radio-group>

        <a-space wrap :size="12">
          <a-select v-model:value="outputFormat" style="width: 140px">
            <a-select-option value="side-by-side">左右对比</a-select-option>
            <a-select-option value="line-by-line">上下对比</a-select-option>
          </a-select>

          <a-select v-model:value="language" style="width: 120px">
            <a-select-option value="plaintext">纯文本</a-select-option>
            <a-select-option value="markdown">Markdown</a-select-option>
            <a-select-option value="javascript">JavaScript</a-select-option>
            <a-select-option value="json">JSON</a-select-option>
            <a-select-option value="yaml">YAML</a-select-option>
          </a-select>

          <a-button @click="swapSides">
            <template #icon>
              <SwapOutlined />
            </template>
            交换左右
          </a-button>

          <a-button v-if="diffMode === 'article'" :loading="contentLoading" :disabled="!canCompareArticles"
            @click="loadSelectedArticles">
            <template #icon>
              <ReloadOutlined />
            </template>
            重新加载
          </a-button>
        </a-space>
      </div>

      <div class="diff-settings">
        <span class="settings-label">对比设置</span>
        <div class="settings-grid">
          <div class="setting-item">
            <span class="setting-name">差异粒度</span>
            <a-radio-group v-model:value="diffStyle" size="small">
              <a-radio-button value="word">单词</a-radio-button>
              <a-radio-button value="char">字符</a-radio-button>
            </a-radio-group>
          </div>

          <div class="setting-item">
            <span class="setting-name">上下文行数</span>
            <a-input-number
              v-model:value="context"
              :min="0"
              :max="50"
              size="small"
              style="width: 88px"
            />
          </div>

          <div class="setting-item setting-switches">
            <a-tooltip title="存在差异时，在同一行内按单词或字符高亮对比">
              <a-checkbox v-model:checked="forceInlineComparison">强制行内对比</a-checkbox>
            </a-tooltip>
            <a-tooltip title="对比前去除文本首尾空白字符">
              <a-checkbox v-model:checked="trim">去除首尾空白</a-checkbox>
            </a-tooltip>
            <a-tooltip title="将 Windows (CRLF) 与 Unix (LF) 换行视为相同">
              <a-checkbox v-model:checked="noDiffLineFeed">忽略换行符差异</a-checkbox>
            </a-tooltip>
            <a-tooltip title="对比前忽略仅含空白的空行">
              <a-checkbox v-model:checked="ignoreBlankLines">忽略空行</a-checkbox>
            </a-tooltip>
            <a-tooltip title="对比前忽略每行末尾的空格与制表符">
              <a-checkbox v-model:checked="ignoreTrailingSpace">忽略行尾空格</a-checkbox>
            </a-tooltip>
          </div>
        </div>
      </div>

      <div v-if="diffMode === 'article'" class="article-picker">
        <div class="picker-item">
          <span class="picker-label">旧版本</span>
          <a-select v-model:value="leftArticleId" show-search allow-clear placeholder="选择文章 A"
            :loading="articlesLoading" :filter-option="(input: string, option: { label: string }) =>
              option.label.toLowerCase().includes(input.toLowerCase())" style="width: 100%" :options="articleOptions.map((a) => ({
                value: a.id,
                label: a.title,
              }))" />
        </div>
        <div class="picker-item">
          <span class="picker-label">新版本</span>
          <a-select v-model:value="rightArticleId" show-search allow-clear placeholder="选择文章 B"
            :loading="articlesLoading" :filter-option="(input: string, option: { label: string }) =>
              option.label.toLowerCase().includes(input.toLowerCase())" style="width: 100%" :options="articleOptions.map((a) => ({
                value: a.id,
                label: a.title,
              }))" />
        </div>
      </div>

      <div v-else class="text-editor">
        <div class="editor-item">
          <span class="picker-label">旧文本</span>
          <a-textarea v-model:value="leftText" placeholder="在此粘贴或输入旧文本..." :rows="10" allow-clear />
        </div>
        <div class="editor-item">
          <span class="picker-label">新文本</span>
          <a-textarea v-model:value="rightText" placeholder="在此粘贴或输入新文本..." :rows="10" allow-clear />
        </div>
      </div>

      <a-spin :spinning="contentLoading">
        <div class="diff-result">
          <div v-if="!oldString && !newString" class="diff-empty">
            <FileTextOutlined class="diff-empty-icon" />
            <p>请选择两篇文章，或输入两段文本后开始对比</p>
          </div>
          <CodeDiff
            v-else
            :old-string="oldString"
            :new-string="newString"
            :output-format="outputFormat"
            :language="language"
            :filename="diffMode === 'article' ? leftTitle : '旧文本'"
            :new-filename="diffMode === 'article' ? rightTitle : '新文本'"
            :context="context"
            :diff-style="diffStyle"
            :force-inline-comparison="forceInlineComparison"
            :trim="trim"
            :no-diff-line-feed="noDiffLineFeed"
            theme="light"
          />
        </div>
      </a-spin>
    </a-card>
  </div>
</template>

<style scoped>
.blog-diff-page {
  max-width: 1250px;
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

.diff-card {
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.03);
  border-radius: 8px;
  background: #ffffff;
}

.diff-card :deep(.ant-card-body) {
  padding: 24px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
}

.diff-settings {
  margin-bottom: 20px;
  padding: 14px 16px;
  background: #f8fafc;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
}

.settings-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 12px;
}

.settings-grid {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px 28px;
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.setting-name {
  flex-shrink: 0;
  font-size: 13px;
  color: #64748b;
}

.setting-switches {
  flex-wrap: wrap;
  gap: 12px 20px;
}

.article-picker,
.text-editor {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

.picker-item,
.editor-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.picker-label {
  font-size: 13px;
  font-weight: 500;
  color: #475569;
}

.diff-result {
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  overflow: auto;
  min-height: 320px;
  background: #fafafa;
}

.diff-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  color: #94a3b8;
}

.diff-empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  color: #cbd5e1;
}

@media (max-width: 768px) {

  .article-picker,
  .text-editor {
    grid-template-columns: 1fr;
  }
}
</style>

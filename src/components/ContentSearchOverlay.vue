<script setup lang="ts">
import { ref, watch, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  SearchOutlined,
  CloseOutlined,
  RightOutlined,
} from '@ant-design/icons-vue'
import { searchContent, type ContentSearchItem } from '../api/blog'
import { splitHighlightParts } from '../utils/searchHighlight'
import { useContentSearch } from '../composables/useContentSearch'
import { formatDateTime } from '../utils/date'

const router = useRouter()
const { visible, closeSearch } = useContentSearch()

const keyword = ref('')
const loading = ref(false)
const items = ref<ContentSearchItem[]>([])
const total = ref(0)
const truncated = ref(false)
const error = ref('')
const activeIndex = ref(-1)
const expandedIds = ref<Set<string>>(new Set())

const inputRef = ref<HTMLInputElement>()
const panelRef = ref<HTMLElement>()

const hasKeyword = computed(() => keyword.value.trim().length >= 2)
const showEmptyHint = computed(() => !hasKeyword.value && !loading.value)
const showNoResult = computed(
  () => hasKeyword.value && !loading.value && !error.value && items.value.length === 0,
)

interface SearchResultGroup {
  id: string
  title: string
  updateTime: number
  matches: ContentSearchItem[]
}

type FlatNavTarget =
  | { kind: 'group'; group: SearchResultGroup }
  | { kind: 'match'; group: SearchResultGroup; match: ContentSearchItem }

const resultGroups = computed<SearchResultGroup[]>(() => {
  const order: string[] = []
  const map = new Map<string, SearchResultGroup>()

  for (const item of items.value) {
    if (!map.has(item.id)) {
      order.push(item.id)
      map.set(item.id, {
        id: item.id,
        title: item.title,
        updateTime: item.updateTime,
        matches: [],
      })
    }
    map.get(item.id)!.matches.push(item)
  }

  return order.map((id) => map.get(id)!)
})

const flatNavTargets = computed<FlatNavTarget[]>(() => {
  const targets: FlatNavTarget[] = []

  for (const group of resultGroups.value) {
    if (group.matches.length === 1) {
      targets.push({ kind: 'match', group, match: group.matches[0] })
      continue
    }

    targets.push({ kind: 'group', group })
    if (expandedIds.value.has(group.id)) {
      for (const match of group.matches) {
        targets.push({ kind: 'match', group, match })
      }
    }
  }

  return targets
})

let debounceTimer: ReturnType<typeof setTimeout> | null = null

function resetResults() {
  items.value = []
  total.value = 0
  truncated.value = false
  error.value = ''
  activeIndex.value = -1
  expandedIds.value = new Set()
}

function navIndexForGroup(group: SearchResultGroup) {
  return flatNavTargets.value.findIndex(
    (target) => target.kind === 'group' && target.group.id === group.id,
  )
}

function navIndexForMatch(group: SearchResultGroup, match: ContentSearchItem) {
  return flatNavTargets.value.findIndex(
    (target) =>
      target.kind === 'match' &&
      target.group.id === group.id &&
      target.match.matchIndex === match.matchIndex &&
      target.match.offset === match.offset,
  )
}

function isNavActive(index: number) {
  return index >= 0 && activeIndex.value === index
}

function isGroupExpanded(id: string) {
  return expandedIds.value.has(id)
}

function toggleGroup(id: string) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

async function runSearch() {
  const q = keyword.value.trim()
  if (q.length < 2) {
    resetResults()
    return
  }

  loading.value = true
  error.value = ''
  expandedIds.value = new Set()
  try {
    const res = await searchContent({ q, limit: 50 })
    const data = res.data.data
    items.value = data.items
    total.value = data.total
    truncated.value = data.truncated
    activeIndex.value = data.items.length > 0 ? 0 : -1
  } catch (err: unknown) {
    resetResults()
    const msg =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data
            ?.message
        : undefined
    error.value = msg || '搜索失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function scheduleSearch() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runSearch, 300)
}

function openResult(item: ContentSearchItem) {
  const q = keyword.value.trim()
  closeSearch()
  router.push({
    path: `/blog/view/${item.id}`,
    query: {
      q,
      matchIndex: String(item.matchIndex),
    },
  })
}

function activateNavTarget(target: FlatNavTarget) {
  if (target.kind === 'group') {
    toggleGroup(target.group.id)
    nextTick(() => {
      const firstMatchIndex = flatNavTargets.value.findIndex(
        (item) =>
          item.kind === 'match' &&
          item.group.id === target.group.id &&
          item.match.matchIndex === 0,
      )
      if (firstMatchIndex >= 0) {
        activeIndex.value = firstMatchIndex
        scrollActiveIntoView()
      }
    })
    return
  }

  openResult(target.match)
}

function onOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    closeSearch()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!visible.value) return

  if (e.key === 'Escape') {
    e.preventDefault()
    closeSearch()
    return
  }

  const targets = flatNavTargets.value
  if (targets.length === 0) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, targets.length - 1)
    scrollActiveIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
    scrollActiveIntoView()
  } else if (e.key === 'Enter' && activeIndex.value >= 0) {
    e.preventDefault()
    const target = targets[activeIndex.value]
    if (target) activateNavTarget(target)
  }
}

function scrollActiveIntoView() {
  nextTick(() => {
    const el = panelRef.value?.querySelector('.is-active')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function snippetParts(snippet: string) {
  return splitHighlightParts(snippet, keyword.value.trim())
}

watch(visible, (open) => {
  if (open) {
    nextTick(() => inputRef.value?.focus())
  } else {
    keyword.value = ''
    resetResults()
  }
})

watch(keyword, () => {
  scheduleSearch()
})

watch(expandedIds, () => {
  const targets = flatNavTargets.value
  if (targets.length === 0) {
    activeIndex.value = -1
    return
  }
  if (activeIndex.value >= targets.length) {
    activeIndex.value = targets.length - 1
  }
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="search-fade">
      <div
        v-if="visible"
        class="search-overlay"
        @click="onOverlayClick"
      >
        <div ref="panelRef" class="search-panel" @click.stop>
          <div class="search-bar">
            <SearchOutlined class="search-bar-icon" />
            <input
              ref="inputRef"
              v-model="keyword"
              type="search"
              class="search-input"
              placeholder="搜索全部文章内容…"
              autocomplete="off"
              spellcheck="false"
            />
            <button
              type="button"
              class="search-close"
              title="关闭 (Esc)"
              @click="closeSearch"
            >
              <CloseOutlined />
            </button>
          </div>

          <div class="search-body">
            <p v-if="showEmptyHint" class="search-hint">
              输入关键词搜索正文内容，至少 2 个字符
            </p>

            <div v-else-if="loading" class="search-status">
              <span class="search-spinner" />
              检索中…
            </div>

            <p v-else-if="error" class="search-error">{{ error }}</p>

            <p v-else-if="showNoResult" class="search-status">
              未找到包含「{{ keyword.trim() }}」的内容
            </p>

            <template v-else-if="items.length > 0">
              <p v-if="truncated" class="search-truncated">
                结果过多，已显示前 {{ items.length }} 处匹配（共 {{ total }} 处），请缩小关键词
              </p>
              <p v-else class="search-meta">共 {{ total }} 处匹配</p>

              <ul class="result-list">
                <li
                  v-for="group in resultGroups"
                  :key="group.id"
                  class="result-group"
                >
                  <button
                    v-if="group.matches.length === 1"
                    type="button"
                    class="result-item"
                    :class="{ 'is-active': isNavActive(navIndexForMatch(group, group.matches[0])) }"
                    @click="openResult(group.matches[0])"
                    @mouseenter="activeIndex = navIndexForMatch(group, group.matches[0])"
                  >
                    <span class="result-title">{{ group.title }}</span>
                    <span class="result-snippet">
                      <template
                        v-for="(part, partIndex) in snippetParts(group.matches[0].snippet)"
                        :key="partIndex"
                      >
                        <mark v-if="part.highlight" class="snippet-mark">{{
                          part.text
                        }}</mark>
                        <template v-else>{{ part.text }}</template>
                      </template>
                    </span>
                    <span class="result-time">{{
                      formatDateTime(group.updateTime)
                    }}</span>
                  </button>

                  <template v-else>
                    <button
                      type="button"
                      class="result-group-header"
                      :class="{ 'is-active': isNavActive(navIndexForGroup(group)) }"
                      @click="toggleGroup(group.id)"
                      @mouseenter="activeIndex = navIndexForGroup(group)"
                    >
                      <span class="result-group-main">
                        <span class="result-title">{{ group.title }}</span>
                        <span class="result-badge">共 {{ group.matches.length }} 处匹配</span>
                      </span>
                      <span class="result-group-meta">
                        <span class="result-time">{{
                          formatDateTime(group.updateTime)
                        }}</span>
                        <RightOutlined
                          class="result-expand-icon"
                          :class="{ 'is-expanded': isGroupExpanded(group.id) }"
                        />
                      </span>
                    </button>

                    <ul
                      v-if="isGroupExpanded(group.id)"
                      class="result-matches"
                    >
                      <li
                        v-for="match in group.matches"
                        :key="`${match.matchIndex}-${match.offset}`"
                      >
                        <button
                          type="button"
                          class="result-item result-match-item"
                          :class="{ 'is-active': isNavActive(navIndexForMatch(group, match)) }"
                          @click="openResult(match)"
                          @mouseenter="activeIndex = navIndexForMatch(group, match)"
                        >
                          <span class="result-match-index">#{{ match.matchIndex + 1 }}</span>
                          <span class="result-snippet">
                            <template
                              v-for="(part, partIndex) in snippetParts(match.snippet)"
                              :key="partIndex"
                            >
                              <mark v-if="part.highlight" class="snippet-mark">{{
                                part.text
                              }}</mark>
                              <template v-else>{{ part.text }}</template>
                            </template>
                          </span>
                        </button>
                      </li>
                    </ul>
                  </template>
                </li>
              </ul>
            </template>
          </div>

          <div class="search-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
            <span><kbd>Enter</kbd> 展开 / 打开</span>
            <span><kbd>Esc</kbd> 关闭</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 50000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 10vh 16px 24px;
  background: rgba(3, 7, 18, 0.55);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.search-panel {
  width: min(680px, 100%);
  border-radius: 20px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(28px) saturate(160%);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.15),
    0 24px 64px rgba(0, 0, 0, 0.35);
  color: #e2e8f0;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.search-bar-icon {
  font-size: 18px;
  color: #94a3b8;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  font-size: 17px;
  color: #f8fafc;
  background: transparent;
  border: none;
  outline: none;
}

.search-input::placeholder {
  color: rgba(148, 163, 184, 0.75);
}

.search-close {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.search-close:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #f1f5f9;
}

.search-body {
  min-height: 120px;
  max-height: min(52vh, 480px);
  overflow-y: auto;
  padding: 12px 8px;
}

.search-hint,
.search-status,
.search-error,
.search-meta,
.search-truncated {
  margin: 0;
  padding: 20px 14px;
  font-size: 14px;
  text-align: center;
}

.search-hint,
.search-status {
  color: #64748b;
}

.search-error {
  color: #f87171;
}

.search-truncated {
  color: #fbbf24;
  font-size: 13px;
  padding: 8px 14px 4px;
  text-align: left;
}

.search-meta {
  color: #64748b;
  font-size: 13px;
  padding: 8px 14px 4px;
  text-align: left;
}

.search-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 8px;
  border: 2px solid rgba(148, 163, 184, 0.3);
  border-top-color: #818cf8;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  vertical-align: -2px;
}

.result-list,
.result-matches {
  list-style: none;
  margin: 0;
  padding: 0;
}

.result-list {
  padding: 0 6px 8px;
}

.result-group + .result-group {
  margin-top: 4px;
}

.result-item,
.result-group-header {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.result-group-header {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.result-group-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}

.result-group-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.result-item:hover,
.result-group-header:hover,
.result-item.is-active,
.result-group-header.is-active {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
}

.result-item.is-active,
.result-group-header.is-active {
  box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.35);
}

.result-title {
  font-size: 15px;
  font-weight: 600;
  color: #f1f5f9;
}

.result-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: #c4b5fd;
  background: rgba(99, 102, 241, 0.18);
  border: 1px solid rgba(129, 140, 248, 0.22);
}

.result-expand-icon {
  font-size: 12px;
  color: #64748b;
  transition: transform 0.2s ease, color 0.2s;
}

.result-expand-icon.is-expanded {
  transform: rotate(90deg);
  color: #a5b4fc;
}

.result-matches {
  margin: 4px 0 0;
  padding-left: 12px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.result-match-item {
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
}

.result-match-index {
  flex-shrink: 0;
  min-width: 28px;
  font-size: 12px;
  font-weight: 600;
  color: #818cf8;
}

.result-snippet {
  font-size: 13px;
  line-height: 1.55;
  color: #94a3b8;
  word-break: break-word;
}

.snippet-mark {
  padding: 0 2px;
  border-radius: 3px;
  background: rgba(245, 158, 11, 0.55);
  color: #fef3c7;
}

.result-time {
  font-size: 12px;
  color: #475569;
}

.search-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  padding: 10px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  color: #475569;
}

.search-footer kbd {
  display: inline-block;
  margin-right: 4px;
  padding: 1px 6px;
  font-size: 11px;
  font-family: inherit;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #94a3b8;
}

.search-fade-enter-active,
.search-fade-leave-active {
  transition: opacity 0.2s ease;
}

.search-fade-enter-active .search-panel,
.search-fade-leave-active .search-panel {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.search-fade-enter-from,
.search-fade-leave-to {
  opacity: 0;
}

.search-fade-enter-from .search-panel,
.search-fade-leave-to .search-panel {
  transform: translateY(-12px) scale(0.98);
  opacity: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  PlusOutlined,
  FileSearchOutlined,
  TagsOutlined,
  DiffOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons-vue'
import { isAuthenticated } from '../utils/auth'
import { useContentSearch } from '../composables/useContentSearch'

const route = useRoute()
const router = useRouter()
const { openSearch } = useContentSearch()

const showDock = computed(() => isAuthenticated())
const isListPage = computed(() => route.name === 'BlogList')
const isHovering = ref(false)

const isCollapsed = computed(() => !isListPage.value && !isHovering.value)

let leaveTimer: ReturnType<typeof setTimeout> | null = null

function onZoneEnter() {
  if (leaveTimer) {
    clearTimeout(leaveTimer)
    leaveTimer = null
  }
  isHovering.value = true
}

function onZoneLeave() {
  leaveTimer = setTimeout(() => {
    isHovering.value = false
    leaveTimer = null
  }, 150)
}

watch(isListPage, (list) => {
  if (list) isHovering.value = false
})

onUnmounted(() => {
  if (leaveTimer) clearTimeout(leaveTimer)
})

interface DockItem {
  key: string
  title: string
  icon: typeof UnorderedListOutlined
  action: () => void
  active?: boolean
}

const dockItems = computed<DockItem[]>(() => [
  {
    key: 'list',
    title: '文章列表',
    icon: UnorderedListOutlined,
    action: () => router.push('/blog/list'),
    active: route.name === 'BlogList',
  },
  {
    key: 'create',
    title: '新建文章',
    icon: PlusOutlined,
    action: () => router.push('/blog/create'),
    active: route.name === 'BlogCreate',
  },
  {
    key: 'search',
    title: '内容检索',
    icon: FileSearchOutlined,
    action: openSearch,
  },
  {
    key: 'categories',
    title: '分类管理',
    icon: TagsOutlined,
    action: () => router.push('/blog/categories'),
    active: route.name === 'CategoryManage',
  },
  {
    key: 'diff',
    title: '文本对比',
    icon: DiffOutlined,
    action: () => router.push('/blog/diff'),
    active: route.name === 'BlogDiff',
  },
])
</script>

<template>
  <template v-if="showDock">
    <div
      class="app-dock-zone"
      @mouseenter="onZoneEnter"
      @mouseleave="onZoneLeave"
    >
      <nav
        class="app-dock"
        :class="{ 'app-dock--collapsed': isCollapsed }"
        aria-label="主导航"
      >
        <div class="app-dock__glass">
          <div class="app-dock__shine" aria-hidden="true" />
          <a-tooltip
            v-for="item in dockItems"
            :key="item.key"
            :title="item.title"
            placement="top"
          >
            <button
              type="button"
              class="app-dock__item"
              :class="{ 'app-dock__item--active': item.active }"
              @click="item.action"
            >
              <component :is="item.icon" class="app-dock__icon" />
              <span v-if="item.active" class="app-dock__dot" />
            </button>
          </a-tooltip>
        </div>
      </nav>
    </div>
  </template>
</template>

<style scoped>
.app-dock-zone {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 120px;
  z-index: 10000;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  pointer-events: auto;
}

.app-dock {
  position: relative;
  bottom: 12px;
  pointer-events: auto;
}

.app-dock__glass {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 10px 22px;
  border-radius: 999px;
  transform-origin: bottom center;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.68);
  backdrop-filter: blur(22px) saturate(160%);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.78);
  box-shadow:
    0 10px 36px rgba(92, 73, 48, 0.14),
    0 2px 10px rgba(92, 73, 48, 0.07),
    inset 0 1px 0 rgba(255, 255, 255, 0.92),
    inset 0 -1px 0 rgba(255, 255, 255, 0.35);
  transition:
    opacity 0.35s ease,
    transform 0.35s cubic-bezier(0.32, 0.72, 0, 1),
    background 0.35s ease,
    border-color 0.35s ease,
    box-shadow 0.35s ease;
}

.app-dock__shine {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.42) 0%,
    rgba(255, 255, 255, 0.08) 38%,
    transparent 62%
  );
  pointer-events: none;
}

.app-dock--collapsed .app-dock__glass {
  opacity: 0.42;
  transform: scale(0.9);
  background: rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  border-color: rgba(255, 255, 255, 0.32);
  box-shadow:
    0 4px 16px rgba(92, 73, 48, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
}

.app-dock--collapsed .app-dock__shine {
  opacity: 0.35;
}

.app-dock--collapsed .app-dock__item {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.24);
  color: rgba(92, 79, 63, 0.52);
  box-shadow: none;
}

.app-dock--collapsed .app-dock__item--active {
  background: rgba(255, 255, 255, 0.32);
  border-color: rgba(255, 255, 255, 0.38);
  color: rgba(139, 105, 20, 0.72);
  box-shadow: none;
}

.app-dock--collapsed .app-dock__dot {
  opacity: 0.45;
}

.app-dock__item {
  position: relative;
  z-index: 1;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 999px;
  cursor: pointer;
  color: #5c4f3f;
  background: rgba(255, 255, 255, 0.48);
  flex-shrink: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  transition:
    color 0.2s ease,
    background 0.2s ease,
    transform 0.25s cubic-bezier(0.32, 0.72, 0, 1),
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.app-dock__item:hover {
  background: rgba(255, 255, 255, 0.72);
  border-color: rgba(255, 255, 255, 0.82);
  transform: translateY(-2px) scale(1.06);
  box-shadow:
    0 4px 14px rgba(92, 73, 48, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
}

.app-dock__icon {
  font-size: 21px;
  line-height: 1;
}

.app-dock__item--active {
  background: rgba(255, 255, 255, 0.88);
  border-color: rgba(255, 255, 255, 0.9);
  color: #8b6914;
  box-shadow:
    0 4px 16px rgba(139, 105, 20, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

.app-dock__item--active:hover {
  transform: translateY(-2px) scale(1.06);
}

.app-dock__dot {
  position: absolute;
  bottom: 3px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.75;
}

@media (max-width: 640px) {
  .app-dock__glass {
    padding: 8px 14px;
    gap: 4px;
    border-radius: 999px;
  }

  .app-dock__item {
    width: 42px;
    height: 42px;
    border-radius: 999px;
  }

  .app-dock__icon {
    font-size: 18px;
  }
}
</style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { FileSearchOutlined } from '@ant-design/icons-vue'
import { isAuthenticated } from '../utils/auth'
import { useContentSearch } from '../composables/useContentSearch'

const route = useRoute()
const { openSearch } = useContentSearch()

const showTrigger = computed(
  () => isAuthenticated() && route.meta.requiresAuth === true,
)

const shortcutHint = computed(() =>
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
    ? '⌘K'
    : 'Ctrl+K',
)

function onGlobalKeydown(e: KeyboardEvent) {
  if (!showTrigger.value) return
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    openSearch()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <button
    v-if="showTrigger"
    type="button"
    class="content-search-trigger"
    :title="`内容检索 (${shortcutHint})`"
    @click="openSearch"
  >
    <FileSearchOutlined class="trigger-icon" />
    <span class="trigger-label">内容检索</span>
    <kbd class="trigger-kbd">{{ shortcutHint }}</kbd>
  </button>
</template>

<style scoped>
.content-search-trigger {
  position: fixed;
  right: 20px;
  top: 20px;
  z-index: 40000;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 14px 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.03);
  transition: transform 0.2s, box-shadow 0.2s, color 0.2s, border-color 0.2s;
}

.trigger-icon {
  font-size: 16px;
  color: #6366f1;
}

.trigger-label {
  line-height: 1;
}

.trigger-kbd {
  margin-left: 2px;
  padding: 2px 6px;
  font-size: 11px;
  font-family: inherit;
  font-weight: 500;
  line-height: 1.2;
  border-radius: 4px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #64748b;
}

.content-search-trigger:hover {
  transform: translateY(-1px);
  color: #1677ff;
  border-color: rgba(22, 119, 255, 0.25);
  box-shadow: 0 6px 20px rgba(22, 119, 255, 0.15), 0 0 0 1px rgba(22, 119, 255, 0.06);
}

.content-search-trigger:active {
  transform: translateY(0);
}

@media (max-width: 768px) {
  .content-search-trigger {
    right: 12px;
    top: 12px;
    height: 36px;
    padding: 0 10px 0 8px;
    gap: 6px;
    font-size: 13px;
  }

  .trigger-kbd {
    display: none;
  }
}
</style>

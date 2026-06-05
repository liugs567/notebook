import { ref } from 'vue'

const visible = ref(false)

export function useContentSearch() {
  function openSearch() {
    visible.value = true
  }

  function closeSearch() {
    visible.value = false
  }

  function toggleSearch() {
    visible.value = !visible.value
  }

  return {
    visible,
    openSearch,
    closeSearch,
    toggleSearch,
  }
}

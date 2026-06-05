<script setup lang="ts">
import ContentSearchOverlay from './components/ContentSearchOverlay.vue'
// import ContentSearchTrigger from './components/ContentSearchTrigger.vue'
</script>

<template>
  <router-view />
  <!-- <ContentSearchTrigger /> -->
  <ContentSearchOverlay />
</template>

<style>
#app {
  min-height: 100vh;
}
</style>

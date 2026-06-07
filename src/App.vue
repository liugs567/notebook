<script setup lang="ts">
import { computed } from 'vue'
import ContentSearchOverlay from './components/ContentSearchOverlay.vue'
import AppDock from './components/AppDock.vue'
import { isAuthenticated } from './utils/auth'

const showDockPadding = computed(() => isAuthenticated())
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--with-dock': showDockPadding }">
    <div v-if="showDockPadding" class="app-bg" aria-hidden="true">
      <div class="app-bg__base" />
      <div class="app-bg__fiber" />
      <div class="app-bg__weave" />
      <div class="app-bg__grain" />
      <div class="app-bg__speck" />
    </div>
    <div class="app-shell__content">
      <router-view />
    </div>
  </div>
  <AppDock />
  <ContentSearchOverlay />
</template>

<style>
#app {
  min-height: 100vh;
}

.app-shell {
  position: relative;
  min-height: 100vh;
}

.app-shell__content {
  position: relative;
  z-index: 1;
}

.app-shell--with-dock {
  padding-bottom: 0;
  box-sizing: border-box;
}

.app-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.app-bg__base {
  position: absolute;
  inset: 0;
  background-color: #e0cfb4;
}

.app-bg__fiber {
  position: absolute;
  inset: 0;
  opacity: 0.55;
  background:
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 4px,
      rgba(110, 82, 48, 0.035) 4px,
      rgba(110, 82, 48, 0.035) 5px
    ),
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 7px,
      rgba(95, 70, 40, 0.022) 7px,
      rgba(95, 70, 40, 0.022) 8px
    );
}

.app-bg__weave {
  position: absolute;
  inset: 0;
  opacity: 0.18;
  background-image: url("data:image/svg+xml,%3Csvg width='64' height='64' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 32h64M32 0v64' stroke='%236b5030' stroke-width='0.5' opacity='0.35'/%3E%3C/svg%3E");
  background-size: 64px 64px;
}

.app-bg__grain {
  position: absolute;
  inset: 0;
  opacity: 0.07;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 160px 160px;
}

.app-bg__speck {
  position: absolute;
  inset: 0;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.04' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23s)'/%3E%3C/svg%3E");
  background-size: 240px 240px;
}
</style>

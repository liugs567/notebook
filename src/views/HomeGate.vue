<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { LockOutlined, ArrowRightOutlined } from '@ant-design/icons-vue'
import { login, isAuthenticated } from '../utils/auth'

const router = useRouter()

const password = ref('')
const loading = ref(false)
const error = ref('')
const shake = ref(false)
const success = ref(false)
const mounted = ref(false)

async function handleSubmit() {
  if (loading.value || success.value) return
  error.value = ''
  const pwd = password.value.trim()
  if (!pwd) {
    error.value = '请输入访问密码'
    triggerShake()
    return
  }
  loading.value = true
  await new Promise((r) => setTimeout(r, 600))
  if (login(pwd)) {
    success.value = true
    await new Promise((r) => setTimeout(r, 800))
    router.replace('/blog/list')
  } else {
    error.value = '密码错误，无权访问'
    password.value = ''
    triggerShake()
  }
  loading.value = false
}

function triggerShake() {
  shake.value = true
  setTimeout(() => {
    shake.value = false
  }, 500)
}

onMounted(() => {
  if (isAuthenticated()) {
    router.replace('/blog/list')
    return
  }
  requestAnimationFrame(() => {
    mounted.value = true
  })
})
</script>

<template>
  <div class="gate-page">
    <div class="bg-layer">
      <div class="orb orb-1" />
      <div class="orb orb-2" />
      <div class="orb orb-3" />
      <div class="grid-overlay" />
      <div class="scan-line" />
    </div>

    <div class="gate-content" :class="{ visible: mounted }">
      <div class="brand">
        <div class="logo-wrap">
          <img src="/long.svg" alt="LIU BLOG" class="brand-logo" />
        </div>
        <h1 class="brand-title">
          <span class="title-line">LIU</span>
          <span class="title-line accent">BLOG</span>
        </h1>
        <p class="brand-tagline">私人写作空间 · 仅限授权访问</p>
      </div>

      <div class="gate-card" :class="{ shake, success }">
        <div class="card-glow" />
        <div class="card-inner">
          <div class="lock-icon">
            <LockOutlined />
          </div>
          <h2 class="card-title">身份验证</h2>
          <p class="card-desc">输入访问密码以进入系统</p>

          <form class="gate-form" @submit.prevent="handleSubmit">
            <div class="input-wrap">
              <input
                v-model="password"
                type="password"
                class="gate-input"
                placeholder="访问密码"
                autocomplete="off"
                :disabled="loading || success"
              />
              <div class="input-border" />
            </div>

            <p v-if="error" class="error-msg">{{ error }}</p>

            <button
              type="submit"
              class="enter-btn"
              :class="{ loading, success }"
              :disabled="loading || success"
            >
              <span v-if="success" class="btn-text">验证通过</span>
              <span v-else-if="loading" class="btn-text">验证中...</span>
              <span v-else class="btn-text">
                进入系统
                <ArrowRightOutlined class="btn-arrow" />
              </span>
              <span class="btn-shine" />
            </button>
          </form>
        </div>
      </div>

      <p class="footer-note">Protected Workspace</p>
    </div>
  </div>
</template>

<style scoped>
.gate-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #030712;
  color: #e2e8f0;
}

.bg-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.55;
  animation: float 12s ease-in-out infinite;
}

.orb-1 {
  width: 480px;
  height: 480px;
  background: #4f46e5;
  top: -120px;
  left: -80px;
  animation-delay: 0s;
}

.orb-2 {
  width: 400px;
  height: 400px;
  background: #06b6d4;
  bottom: -100px;
  right: -60px;
  animation-delay: -4s;
}

.orb-3 {
  width: 320px;
  height: 320px;
  background: #8b5cf6;
  top: 40%;
  left: 55%;
  animation-delay: -8s;
}

.grid-overlay {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(99, 102, 241, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 102, 241, 0.06) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, black 20%, transparent 100%);
}

.scan-line {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(99, 102, 241, 0.03) 50%,
    transparent 100%
  );
  background-size: 100% 200%;
  animation: scan 6s linear infinite;
}

.gate-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 40px;
  padding: 24px;
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 0.8s ease, transform 0.8s ease;
}

.gate-content.visible {
  opacity: 1;
  transform: translateY(0);
}

.brand {
  text-align: center;
}

.logo-wrap {
  width: 80px;
  height: 80px;
  margin: 0 auto 20px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.6);
  padding: 10px;
  box-shadow:
    0 0 40px rgba(99, 102, 241, 0.35),
    0 0 0 1px rgba(148, 163, 184, 0.15);
  animation: logo-float 4s ease-in-out infinite;
}

.brand-logo {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: invert(1) hue-rotate(180deg);
}

.brand-title {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin: 0 0 8px;
  font-size: 42px;
  font-weight: 800;
  letter-spacing: 0.2em;
  line-height: 1;
}

.title-line {
  display: inline-block;
  animation: glow-text 3s ease-in-out infinite;
}

.title-line.accent {
  background: linear-gradient(90deg, #6366f1, #06b6d4, #a78bfa);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer 4s linear infinite;
}

.brand-tagline {
  margin: 0;
  font-size: 14px;
  color: #64748b;
  letter-spacing: 0.15em;
}

.gate-card {
  position: relative;
  width: min(420px, 92vw);
  border-radius: 20px;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.gate-card.shake {
  animation: shake 0.5s ease;
}

.gate-card.success {
  box-shadow: 0 0 60px rgba(34, 197, 94, 0.3);
}

.card-glow {
  position: absolute;
  inset: -1px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.5), rgba(6, 182, 212, 0.3), rgba(139, 92, 246, 0.5));
  opacity: 0.6;
  filter: blur(1px);
}

.card-inner {
  position: relative;
  padding: 36px 32px 32px;
  border-radius: 20px;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.lock-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
  font-size: 22px;
}

.card-title {
  margin: 0 0 6px;
  text-align: center;
  font-size: 20px;
  font-weight: 600;
  color: #f1f5f9;
}

.card-desc {
  margin: 0 0 28px;
  text-align: center;
  font-size: 13px;
  color: #64748b;
}

.gate-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-wrap {
  position: relative;
}

.gate-input {
  width: 100%;
  padding: 14px 16px;
  font-size: 15px;
  color: #f1f5f9;
  background: rgba(2, 6, 23, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.gate-input::placeholder {
  color: #475569;
}

.gate-input:focus {
  border-color: rgba(99, 102, 241, 0.6);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.gate-input:disabled {
  opacity: 0.6;
}

.error-msg {
  margin: 0;
  font-size: 13px;
  color: #f87171;
  text-align: center;
  animation: fade-in 0.3s ease;
}

.enter-btn {
  position: relative;
  margin-top: 8px;
  width: 100%;
  padding: 14px 20px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s, background 0.3s;
}

.enter-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
}

.enter-btn:disabled {
  cursor: not-allowed;
}

.enter-btn.loading {
  background: linear-gradient(135deg, #475569, #334155);
}

.enter-btn.success {
  background: linear-gradient(135deg, #22c55e, #16a34a);
}

.btn-text {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-arrow {
  font-size: 14px;
  transition: transform 0.2s;
}

.enter-btn:hover:not(:disabled) .btn-arrow {
  transform: translateX(4px);
}

.btn-shine {
  position: absolute;
  top: 0;
  left: -100%;
  width: 60%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  animation: shine 3s ease-in-out infinite;
}

.footer-note {
  margin: 0;
  font-size: 11px;
  color: #334155;
  letter-spacing: 0.3em;
  text-transform: uppercase;
}

@keyframes float {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(30px, -20px) scale(1.05);
  }
  66% {
    transform: translate(-20px, 15px) scale(0.95);
  }
}

@keyframes scan {
  0% {
    background-position: 0 -100%;
  }
  100% {
    background-position: 0 100%;
  }
}

@keyframes logo-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

@keyframes shimmer {
  0% {
    background-position: 0% center;
  }
  100% {
    background-position: 200% center;
  }
}

@keyframes glow-text {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.85;
  }
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20%,
  60% {
    transform: translateX(-8px);
  }
  40%,
  80% {
    transform: translateX(8px);
  }
}

@keyframes shine {
  0% {
    left: -100%;
  }
  50%,
  100% {
    left: 150%;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>

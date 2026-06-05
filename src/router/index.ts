import { createRouter, createWebHistory } from 'vue-router'
import { isAuthenticated } from '../utils/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'HomeGate',
      component: () => import('../views/HomeGate.vue'),
      meta: { title: 'LIU BLOG', public: true },
    },
    {
      path: '/blog/list',
      name: 'BlogList',
      component: () => import('../views/BlogList.vue'),
      meta: { title: '文章列表', requiresAuth: true },
    },
    {
      path: '/blog/categories',
      name: 'CategoryManage',
      component: () => import('../views/CategoryManage.vue'),
      meta: { title: '分类管理', requiresAuth: true },
    },
    {
      path: '/blog/create',
      name: 'BlogCreate',
      component: () => import('../views/BlogEdit.vue'),
      meta: { title: '新建文章', requiresAuth: true },
    },
    {
      path: '/blog/view/:id',
      name: 'BlogView',
      component: () => import('../views/BlogView.vue'),
      meta: { title: '查看文章', requiresAuth: true },
    },
    {
      path: '/blog/edit/:id',
      name: 'BlogEdit',
      component: () => import('../views/BlogEdit.vue'),
      meta: { title: '编辑文章', requiresAuth: true },
    },
    {
      path: '/blog/diff',
      name: 'BlogDiff',
      component: () => import('../views/BlogDiff.vue'),
      meta: { title: '文本对比', requiresAuth: true },
    },
    {
      path: '/blog/diff',
      name: 'BlogDiff',
      component: () => import('../views/BlogDiff.vue'),
      meta: { title: '文本对比', requiresAuth: true },
    },
  ],
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isAuthenticated()) {
    return { path: '/', replace: true }
  }
  if (to.path === '/' && isAuthenticated()) {
    return { path: '/blog/list', replace: true }
  }
})

router.afterEach((to) => {
  const title = (to.meta.title as string) || '博客'
  document.title = title
})

export default router

import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/blog/list' },
    {
      path: '/blog/list',
      name: 'BlogList',
      component: () => import('../views/BlogList.vue'),
      meta: { title: '文章列表' },
    },
    {
      path: '/blog/create',
      name: 'BlogCreate',
      component: () => import('../views/BlogEdit.vue'),
      meta: { title: '新建文章' },
    },
    {
      path: '/blog/view/:id',
      name: 'BlogView',
      component: () => import('../views/BlogView.vue'),
      meta: { title: '查看文章' },
    },
    {
      path: '/blog/edit/:id',
      name: 'BlogEdit',
      component: () => import('../views/BlogEdit.vue'),
      meta: { title: '编辑文章' },
    },
  ],
})

router.afterEach((to) => {
  const title = (to.meta.title as string) || '博客'
  document.title = title
})

export default router

import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/', name: 'landing', component: () => import('./views/Landing.vue') },
  { path: '/create', name: 'create', component: () => import('./views/Create.vue') },
  { path: '/mine', name: 'mine', component: () => import('./views/Mine.vue') },
  { path: '/recover', name: 'recover', component: () => import('./views/Recover.vue') },
  { path: '/r/:code', name: 'recover-auto', component: () => import('./views/Recover.vue') },
  { path: '/join/:code', name: 'join', component: () => import('./views/Join.vue') },
  { path: '/v/:code', name: 'scan', component: () => import('./views/scan/Scan.vue') },
  { path: '/v/:code/manage', name: 'manage', component: () => import('./views/owner/Manage.vue') },
  { path: '/v/:code/sticker', name: 'sticker', component: () => import('./views/owner/Sticker.vue') },
  {
    path: '/v/:code/status/:requestId',
    name: 'scan-status',
    component: () => import('./views/scan/Result.vue'),
  },
  { path: '/:pathMatch(.*)*', name: 'notfound', component: () => import('./views/NotFound.vue') },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    return saved || { top: 0 };
  },
});

export default router;

import { createRouter, createWebHistory } from 'vue-router';
const routes = [

    {
        path: '/',
        name: 'Home',
        component: () => import('../views/Home.vue')
    },
    {
        path: '/login',
        name: 'Login',
        component: () => import('../views/User/Login.vue'),
    },
    {
        path: '/list',
        name: 'VideoList',
        component: () => import('../views/Video/VideoList.vue')
    },
    {
        path: '/list/:category',
        name: 'CategoryList',
        component: () => import('../views/Video/VideoList.vue')
    },
    {
        path: '/library/:guid',
        name: 'LibraryList',
        component: () => import('../views/Video/VideoList.vue')
    },
    {
        path: '/favorite',
        name: 'FavoriteList',
        component: () => import('../views/Video/VideoList.vue')
    },
    {
        path: '/movie/:guid',
        name: 'MovieData',
        component: () => import('../views/Video/VideoData.vue')
    },
    {
        path: '/video',
        name: 'VideoData',
        component: () => import('../views/Video/VideoData.vue')
    },
    {
        path: '/person',
        name: 'PersonData',
        component: () => import('../views/Person/PersonData.vue')
    },
    {
        path: '/player',
        name: 'VideoPlayer',
        component: () => import('../views/Play/VideoPlayer.vue')
    },
    {
        path: '/settings',
        redirect: '/settings/library'
    },
    {
        path: '/settings/account',
        name: 'SettingsAccount',
        component: () => import('../views/Settings/SettingsLibrary.vue')
    },
    {
        path: '/settings/preference',
        name: 'SettingsPreference',
        component: () => import('../views/Settings/SettingsLibrary.vue')
    },
    {
        path: '/settings/library',
        name: 'SettingsLibrary',
        component: () => import('../views/Settings/SettingsLibrary.vue')
    },
    {
        path: '/settings/appearance',
        name: 'SettingsAppearance',
        component: () => import('../views/Settings/SettingsLibrary.vue')
    },
    {
        path: '/settings/users',
        name: 'SettingsUsers',
        component: () => import('../views/Settings/SettingsLibrary.vue')
    },
    {
        path: '/settings/server',
        name: 'SettingsServer',
        component: () => import('../views/Settings/SettingsLibrary.vue')
    },
    {
        path: '/settings/task',
        name: 'SettingsTask',
        component: () => import('../views/Settings/SettingsLibrary.vue')
    },
    {
        path: '/settings/tasks',
        redirect: '/settings/task'
    }
]
const router = createRouter({
    history: createWebHistory(),
    routes,
    // linkActiveClass: 'active',
    scrollBehavior(to, from, savedPosition) {
        return { x: 0, y: 0 }
    }
});

router.afterEach((to, from, next) => {
    window.scrollTo(0, 0);
});

export default router

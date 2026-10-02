
/**
 * router/index.ts
 *
 * Automatic routes for `./src/pages/*.vue`
 */

// Composables
import { createWebHistory } from 'vue-router'
import { createRouter } from 'vue-router/auto'
import { routes } from 'vue-router/auto-routes'

// 해시(#) 없는 주소를 쓴다: 카카오톡은 #이 들어간 링크는 미리보기를 만들지 않는다 (2026-10-02 확인).
// 예전에 공유된 #/?ids=... 링크는 같은 쿼리의 해시 없는 주소로 바꿔서 그대로 동작하게 한다.
if (location.hash.startsWith('#/')) {
  history.replaceState(history.state, '', location.hash.slice(1))
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// Workaround for https://github.com/vitejs/vite/issues/11804
router.onError((err, to) => {
  if (err?.message?.includes?.('Failed to fetch dynamically imported module')) {
    if (!localStorage.getItem('vuetify:dynamic-reload')) {
      console.log('Reloading page to fix dynamic import error')
      localStorage.setItem('vuetify:dynamic-reload', 'true')
      location.assign(to.fullPath)
    } else {
      console.error('Dynamic import error, reloading page did not fix it', err)
    }
  } else {
    console.error(err)
  }
})

router.isReady().then(() => {
  localStorage.removeItem('vuetify:dynamic-reload')
})

export default router

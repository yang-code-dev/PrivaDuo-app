import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { useUserStore } from '@/stores/user'
import { useCoupleStore } from '@/stores/couple'

export function createApp() {
  const app = createSSRApp(App)
  const pinia = createPinia()

  app.use(pinia)

  const userStore = useUserStore(pinia)
  const coupleStore = useCoupleStore(pinia)

  userStore.restore()
  coupleStore.restore()

  return {
    app,
    pinia,
  }
}

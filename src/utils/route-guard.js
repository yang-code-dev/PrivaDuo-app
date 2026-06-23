import { useCoupleStore } from '@/stores/couple'
import { useUserStore } from '@/stores/user'
import { ROUTES, reLaunch } from '@/utils/router'

export function guardPageAccess({ requireLogin = true, requireBound = false } = {}) {
  const userStore = useUserStore()
  const coupleStore = useCoupleStore()

  if (requireLogin && !userStore.isLoggedIn) {
    reLaunch(ROUTES.login)
    return false
  }

  if (requireBound && !coupleStore.isBound) {
    reLaunch(userStore.isLoggedIn ? ROUTES.bindGuide : ROUTES.login)
    return false
  }

  return true
}

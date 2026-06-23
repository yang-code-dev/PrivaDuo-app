import { defineStore } from 'pinia'
import { getStorage, removeStorage, removeStorageByPrefix, setStorage } from '@/utils/storage'

const STORAGE_KEY = 'pair-space:user'

function defaultProfile() {
  return {
    uid: '',
    mobile: '',
    mobileMasked: '',
    nickname: '',
    avatar: '',
    signature: '',
    accessToken: '',
    sessionSecret: '',
    bindingStatus: 'unbound',
    profileCompleted: false,
  }
}

export const useUserStore = defineStore('user', {
  state: () => ({
    profile: defaultProfile(),
  }),
  getters: {
    isLoggedIn(state) {
      return Boolean(state.profile.uid && state.profile.accessToken && state.profile.sessionSecret)
    },
  },
  actions: {
    restore() {
      const cached = getStorage(STORAGE_KEY, null)
      if (cached) {
        this.profile = { ...defaultProfile(), ...cached }
      }
    },
    setSession(payload = {}) {
      this.profile = { ...defaultProfile(), ...payload }
      setStorage(STORAGE_KEY, this.profile)
    },
    syncUser(user = {}, session = {}) {
      this.profile = {
        ...this.profile,
        ...user,
        ...session,
      }
      setStorage(STORAGE_KEY, this.profile)
    },
    logout() {
      this.profile = defaultProfile()
      removeStorage(STORAGE_KEY)
      removeStorageByPrefix('pair-space:')
    },
  },
})

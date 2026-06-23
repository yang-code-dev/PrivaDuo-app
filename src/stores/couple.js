import { defineStore } from 'pinia'
import { getStorage, removeStorage, setStorage } from '@/utils/storage'

const STORAGE_KEY = 'pair-space:couple'

function defaultState() {
  return {
    pairId: '',
    bindingStatus: 'unbound',
    boundAt: '',
    inviteCode: '',
    inviteCodePermanentDisabled: false,
    partnerProfile: {
      uid: '',
      nickname: '',
      avatar: '',
      mobileMasked: '',
    },
  }
}

export const useCoupleStore = defineStore('couple', {
  state: () => defaultState(),
  getters: {
    isBound(state) {
      return state.bindingStatus === 'bound' && Boolean(state.pairId)
    },
    canCreateInvite(state) {
      return !(state.bindingStatus === 'bound' && state.pairId) && !state.inviteCodePermanentDisabled
    },
  },
  actions: {
    restore() {
      const cached = getStorage(STORAGE_KEY, null)
      if (cached) {
        Object.assign(this, defaultState(), cached)
      }
    },
    persist() {
      setStorage(STORAGE_KEY, {
        pairId: this.pairId,
        bindingStatus: this.bindingStatus,
        boundAt: this.boundAt,
        inviteCode: this.inviteCode,
        inviteCodePermanentDisabled: this.inviteCodePermanentDisabled,
        partnerProfile: this.partnerProfile,
      })
    },
    sync(payload = {}) {
      Object.assign(this, defaultState(), payload)
      this.persist()
    },
    setInviteCode(code) {
      if (this.inviteCodePermanentDisabled) return
      this.inviteCode = code
      this.persist()
    },
    completeBinding(payload = {}) {
      this.pairId = payload.pairId || `pair_${Date.now()}`
      this.bindingStatus = 'bound'
      this.boundAt = payload.boundAt || new Date().toISOString()
      this.partnerProfile = {
        uid: payload.partnerUid || 'partner-demo',
        nickname: payload.partnerNickname || 'partner',
        avatar: payload.partnerAvatar || '',
        mobileMasked: payload.partnerMobileMasked || '',
      }
      this.inviteCode = ''
      this.inviteCodePermanentDisabled = true
      this.persist()
    },
    clear() {
      Object.assign(this, defaultState())
      removeStorage(STORAGE_KEY)
    },
  },
})

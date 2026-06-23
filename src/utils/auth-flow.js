import { ROUTES } from '@/utils/router'

export function resolveProfileCompletion(profile = {}) {
  return !Boolean(profile.profileCompleted)
}

export function resolvePostLoginRoute(couple = {}) {
  return ROUTES.home
}

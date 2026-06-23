import { secureRandomDigits } from '@/utils/security'

export function generateInviteCode() {
  return secureRandomDigits(6)
}

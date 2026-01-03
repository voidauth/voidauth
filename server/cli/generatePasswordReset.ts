import type { PasswordReset } from '@shared/db/PasswordReset'
import { createPasswordReset } from '../db/passwordReset'
import { getUserByInput } from '../db/user'
import appConfig from '../util/config'
import { REDIRECT_PATHS } from '@shared/constants'

export async function generatePasswordReset(input: string) {
  input = input.trim()

  const user = await getUserByInput(input)

  if (!user) {
    throw new Error('User with username not found.')
  }

  const passwordReset = await createPasswordReset(user.id)

  return getPasswordResetURL(passwordReset)
}

export function getPasswordResetURL(passwordReset: PasswordReset) {
  const query = `id=${passwordReset.userId}&challenge=${passwordReset.challenge}`
  return `${appConfig.APP_URL}/${REDIRECT_PATHS.RESET_PASSWORD}?${query}`
}

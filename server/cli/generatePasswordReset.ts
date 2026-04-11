import { createPasswordReset, getPasswordResetURL } from '../db/passwordReset'
import { getUserByInput } from '../db/user'

export async function generatePasswordReset(input: string) {
  input = input.trim()

  const user = await getUserByInput(input)

  if (!user) {
    throw new Error('User with username not found.')
  }

  const passwordReset = await createPasswordReset(user.id)

  return getPasswordResetURL(passwordReset)
}

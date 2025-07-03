import type { EmailVerification } from '../db/EmailVerification.js'

export type VerifyUserEmail = Pick<EmailVerification, 'challenge' | 'userId'>

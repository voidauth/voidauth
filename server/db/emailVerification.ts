import type { EmailVerification } from '@shared/db/EmailVerification'
import { db } from './db'

export async function getEmailVerification(userId: string) {
  const emailVerification = await db().select()
    .table<EmailVerification>('email_verification')
    .where({ userId }).andWhere('expiresAt', '>=', new Date()).first()

  if (emailVerification) {
    return emailVerification
  }
}

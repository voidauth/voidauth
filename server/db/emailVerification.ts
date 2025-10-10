import type { EmailVerification } from '@shared/db/EmailVerification'
import { db } from './db'
import { TABLES } from '@shared/constants'

export async function getEmailVerification(userId: string) {
  const emailVerification = await db().select()
    .table<EmailVerification>(TABLES.EMAIL_VERIFICATION)
    .where({ userId }).andWhere('expiresAt', '>=', new Date()).first()

  if (emailVerification) {
    return emailVerification
  }
}

import type { EmailVerification } from '@shared/db/EmailVerification'
import { db } from './db'
import { TABLES } from '@shared/constants'

export async function getEmailVerification(userId: string, challenge?: string) {
  const emailVerification = await db().select()
    .table<EmailVerification>(TABLES.EMAIL_VERIFICATION)
    .where((w) => {
      w.where({ userId })
      if (challenge) {
        w.andWhere({ challenge })
      }
    }).andWhere('expiresAt', '>=', new Date()).first()

  if (emailVerification) {
    return emailVerification
  }
}

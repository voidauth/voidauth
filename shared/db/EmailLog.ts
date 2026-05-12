import type { DBColumnTypesCheck } from '@shared/db'
import type { Audit } from './Audit'

export type EmailLog = Pick<Audit, 'createdAt'> & {
  id: string
  type: 'email_verification' | 'password_reset' | 'invitation' | 'admin_notification' | 'approved' | 'test_notification'
  toUser?: string | null
  reasons?: string | null

  to: string
  cc?: string | null
  bcc?: string | null
  subject: string
  body?: string | null
}

const _typeCheck: DBColumnTypesCheck<EmailLog> = true

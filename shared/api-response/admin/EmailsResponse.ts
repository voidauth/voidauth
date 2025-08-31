import type { EmailLog } from '@shared/db/EmailLog'
import type { Paginated } from '../Paginated'

export type EmailsResponse = Paginated & {
  emails: EmailLog[]
}

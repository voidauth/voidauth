import type { Passkey } from '@shared/db/Passkey'

export type PasskeyResponse = Pick<Passkey, 'id' | 'createdAt' | 'lastUsed'>

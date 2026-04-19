import type { Redirect } from './Redirect'

export type PasskeyRegisterResponse = Partial<Redirect> & {
  passkeyId: string
}

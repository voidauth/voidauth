import type { Adapter, AdapterPayload, ClientMetadata } from 'oidc-provider'
import { db } from '../db/db'
import type { OIDCPayload, PayloadType } from '@shared/db/OIDCPayload'
import appConfig from '../util/config'
import { TABLES } from '@shared/constants'
import { decryptString, encryptString } from '../db/util'
import { logger } from '../util/logger'

function getExpireAt(expiresIn: number) {
  return expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : undefined
}

function parsePayload(payload: string, pt: PayloadType) {
  const parsed = JSON.parse(payload) as AdapterPayload
  if (isClientPayload(pt, parsed) && parsed.client_secret != null) {
    const client_secret = decryptString(parsed.client_secret, [appConfig.STORAGE_KEY, appConfig.STORAGE_KEY_SECONDARY])
    if (client_secret == null) {
      throw new Error('Cannot decrypt client_secret')
    }
    parsed.client_secret = client_secret
  }
  return parsed
}

function stringifyPayload(payload: AdapterPayload, pt: PayloadType) {
  if (isClientPayload(pt, payload) && payload.client_secret != null) {
    const client_secret = encryptString(payload.client_secret)
    return JSON.stringify({ ...payload, client_secret })
  }
  return JSON.stringify(payload)
}

export class KnexAdapter implements Adapter {
  payloadType: PayloadType
  constructor(pt: string) {
    this.payloadType = pt as PayloadType
  }

  get _table() {
    return db()
      .table<OIDCPayload>(TABLES.OIDC_PAYLOADS)
      .where('type', this.payloadType)
      .andWhere((w) => {
        w.where({ expiresAt: null })
          .orWhere('expiresAt', '>=', new Date())
      })
  }

  _rows(obj: Partial<OIDCPayload>) {
    return this._table.where(obj)
  }

  _findBy(obj: Partial<OIDCPayload>): Promise<AdapterPayload | undefined> {
    if (obj.id != undefined && this.payloadType === 'Client' && appConfig.DECLARED_CLIENTS.has(obj.id)) {
      return Promise.resolve(appConfig.DECLARED_CLIENTS.get(obj.id) as ClientMetadata)
    }

    return this._rows(obj).then((r) => {
      try {
        const first = r[0]
        return first
          ? {
              ...parsePayload(first.payload, this.payloadType),
              ...(first.consumedAt ? { consumed: true } : undefined),
            }
          : undefined
      } catch (e) {
        logger.error(e)
        return undefined
      }
    })
  }

  async upsert(id: string, payload: AdapterPayload, expiresIn: number) {
    if (this.payloadType === 'Client' && appConfig.DECLARED_CLIENTS.has(id)) {
      return
    }

    const expiresAt = getExpireAt(expiresIn)
    await db()
      .table<OIDCPayload>(TABLES.OIDC_PAYLOADS)
      .insert({
        id,
        type: this.payloadType,
        payload: stringifyPayload(payload, this.payloadType),
        grantId: payload.grantId,
        userCode: payload.userCode,
        uid: payload.uid,
        expiresAt,
        accountId: payload.accountId,
      })
      .onConflict(['id', 'type'])
      .merge()
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    return this._findBy({ id })
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    return this._findBy({ userCode })
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    return this._findBy({ uid })
  }

  async destroy(id: string) {
    if (!(this.payloadType === 'Client' && appConfig.DECLARED_CLIENTS.has(id))) {
      await this._rows({ id }).delete()
    }
    return
  }

  async revokeByGrantId(grantId: string) {
    await this._rows({ grantId }).delete()
    return
  }

  async consume(id: string) {
    await this._rows({ id }).update({ consumedAt: new Date() })
    return
  }
};

// type gates
function isClientPayload(pt: PayloadType, payload: unknown): payload is ClientMetadata {
  return pt === 'Client'
}

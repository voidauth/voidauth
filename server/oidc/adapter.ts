/* eslint-disable */
import type { Adapter, ClientMetadata } from 'oidc-provider'
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

function parsePayload(payload: string, pt: string) {
  let parsed = JSON.parse(payload)
  if (pt === 'Client' && parsed.client_secret != null) {
    const client_secret = decryptString(parsed.client_secret, [appConfig.STORAGE_KEY, appConfig.STORAGE_KEY_SECONDARY])
    if (client_secret == null) {
      throw new Error("Cannot decrypt client_secret")
    }
    (parsed as ClientMetadata).client_secret = client_secret
  }
  return parsed
}

function stringifyPayload(payload: any, pt: string) {
  if (pt === 'Client' && payload.client_secret != null) {
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

  _rows(obj: any) {
    return this._table.where(obj)
  }

  _findBy(obj: any) {
    return this._rows(obj).then((r: any) => {
      try {
        return r.length > 0
          ? {
            ...parsePayload(r[0].payload, this.payloadType),
            ...(r[0].consumedAt ? { consumed: true } : undefined),
          }
          : undefined
      } catch (e) {
        logger.error(e)
        return undefined
      }
    })
  }

  async upsert(id: string, payload: any, expiresIn: number) {
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

  async find(id: string) {
    return this._findBy({ id })
  }

  async findByUserCode(userCode: string) {
    return this._findBy({ userCode })
  }

  async findByUid(uid: string) {
    return this._findBy({ uid })
  }

  async destroy(id: string) {
    await this._rows({ id }).delete()
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

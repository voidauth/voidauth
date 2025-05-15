/* eslint-disable */
import type { Adapter } from 'oidc-provider'
import { db } from '../db/db'
import { decryptClient } from '../db/client'
import { encryptString } from '../db/key'
import type { OIDCPayload } from '@shared/db/OIDCPayload'

const tableName = 'oidc_payloads'

function getExpireAt(expiresIn: number) {
  return expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : undefined
}

function parsePayload(payload: string, pt: string) {
  if (pt === 'Client') {
    return decryptClient(payload)
  }
  return JSON.parse(payload)
}

function stringifyPayload(payload: any, pt: string) {
  if (pt === 'Client') {
    const enc_client_secret = encryptString(payload.client_secret)
    return JSON.stringify({ ...payload, client_secret: enc_client_secret })
  }
  return JSON.stringify(payload)
}

export class KnexAdapter implements Adapter {
  payloadType: string
  constructor(pt: string) {
    this.payloadType = pt
  }

  get _table() {
    return db()
      .table<OIDCPayload>(tableName)
      .where('type', this.payloadType)
  }

  _rows(obj: any) {
    return this._table.where(obj)
  }

  _findBy(obj: any) {
    return this._rows(obj).then((r: any) => {
      return r.length > 0
        ? {
          ...parsePayload(r[0].payload, this.payloadType),
          ...(r[0].consumedAt ? { consumed: true } : undefined),
        }
        : undefined
    })
  }

  async upsert(id: string, payload: any, expiresIn: number) {
    const expiresAt = getExpireAt(expiresIn)
    await db()
      .table(tableName)
      .insert({
        id,
        type: this.payloadType,
        payload: stringifyPayload(payload, this.payloadType),
        grantId: payload.grantId,
        userCode: payload.userCode,
        uid: payload.uid,
        expiresAt,
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
    await this._rows({ id }).update({ consumedAt: Date() })
    return
  }
};

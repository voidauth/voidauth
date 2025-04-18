import type { Adapter } from "oidc-provider";
import { db } from "../db/db";

const tableName = 'oidc_payloads';

export type PayloadTypes = 'Session' |
  'AccessToken' |
  'AuthorizationCode' |
  'RefreshToken' |
  'DeviceCode' |
  'ClientCredentials' |
  'Client' |
  'InitialAccessToken' |
  'RegistrationAccessToken' |
  'Interaction' |
  'ReplayDetection' |
  'PushedAuthorizationRequest' |
  'Grant' |
  'BackchannelAuthenticationRequest'

function getExpireAt(expiresIn: number) {
  return expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : undefined;
}

export class KnexAdapter implements Adapter {
  payloadType: string
  constructor(pt: string) {
    // this.name = name;
    this.payloadType = pt;
  }

  get _table() {
    return db
      .table(tableName)
      .where('type', this.payloadType);
  }

  _rows(obj: any) {
    return this._table.where(obj);
  }

  _result(r: any) {
    return r.length > 0
      ? {
        ...JSON.parse(r[0].payload),
        ...(r[0].consumedAt ? { consumed: true } : undefined),
      }
      : undefined;
  }

  _findBy(obj: any) {
    return this._rows(obj).then(this._result);
  }

  async upsert(id: string, payload: any, expiresIn: number) {
    const expiresAt = getExpireAt(expiresIn);
    await db
      .table(tableName)
      .insert({
        id,
        type: this.payloadType,
        payload: JSON.stringify(payload),
        grantId: payload.grantId,
        userCode: payload.userCode,
        uid: payload.uid,
        expiresAt,
      })
      .onConflict(['id', 'type'])
      .merge();
  }

  async find(id: string) {
    return this._findBy({ id });
  }

  async findByUserCode(userCode: string) {
    return this._findBy({ userCode });
  }

  async findByUid(uid: string) {
    return this._findBy({ uid });
  }

  async destroy(id: string) {
    await this._rows({ id }).delete();
    return
  }

  async revokeByGrantId(grantId: string) {
    await this._rows({ grantId }).delete();
    return
  }

  async consume(id: string) {
    await this._rows({ id }).update({ consumedAt: new Date() });
    return
  }
};
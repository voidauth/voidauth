import type { Consent } from "@shared/db/Consent";
import { db } from "./db"
import { createAudit, createExpiration, mergeKeys } from "./util";
import { TTLs } from "@shared/constants";

export async function getExistingConsent(redirectUri?: string, userId?: string) {
  return (await db.select().table<Consent>('consent').where({ redirectUri, userId }).first())
}

export async function addConsent(redirectUri: string, userId: string) {
  const consent: Consent = { userId, redirectUri, expiresAt: createExpiration(TTLs.CONSENT), ...createAudit(userId) }
  await db
    .table<Consent>('consent')
    .insert(consent)
    .onConflict(['userId', 'redirectUri'])
    .merge(mergeKeys(consent));
}
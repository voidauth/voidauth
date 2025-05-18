import type { Consent } from "@shared/db/Consent"
import { db } from "./db"
import { createExpiration, mergeKeys } from "./util"
import { TTLs } from "@shared/constants"

export async function getExistingConsent(userId: string, redirectUri: string) {
  return await db().select().table<Consent>("consent").where({ userId, redirectUri }).first()
}

export async function addConsent(redirectUri: string, userId: string, scope: string) {
  const consent: Consent = {
    userId,
    redirectUri,
    scope,
    expiresAt: createExpiration(TTLs.CONSENT),
    createdAt: new Date(),
  }
  await db()
    .table<Consent>("consent")
    .insert(consent)
    .onConflict(["userId", "redirectUri"])
    .merge(mergeKeys(consent))
}

export function getConsentScopes(consent: Consent) {
  return consent.scope.split(",").map(s => s.trim())
}

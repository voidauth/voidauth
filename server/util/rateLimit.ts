import { rateLimit } from 'express-rate-limit'

// Standard Rate Limit, 100 per second over 10 minute window
//  very permissive as this will also apply to all downstream ProxyAuth Domains
const rateWindowS = 10 * 60 // 10 minutes
export const standardRateLimit = rateLimit({
  windowMs: rateWindowS * 1000,
  max: rateWindowS * 100, // max 100 requests per second
  validate: { trustProxy: false },
  legacyHeaders: false,
})

// Sensitive Rate Limit, 1 per second over 1 minute window
//  for sensitive endpoints to limit exposure to DDOS vulnerable endpoints
//  especially those that modify the database or are hardware intensive
const sensitiveRateWindowS = 1 * 60 // 1 minute
export const sensitiveRateLimit = rateLimit({
  windowMs: sensitiveRateWindowS * 1000,
  max: rateWindowS * 1, // max 1 requests per second
  validate: { trustProxy: false },
  legacyHeaders: false,
})

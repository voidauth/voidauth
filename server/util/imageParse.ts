import type { SharpConstructor } from 'sharp'
import { logger } from './logger'

let sharp: SharpConstructor | undefined
export async function getSharp(): Promise<SharpConstructor> {
  try {
    if (!sharp) {
      sharp = (await import('sharp')).default
    }
    return sharp
  } catch (e) {
    logger({
      level: 'error',
      message: 'Failed to load sharp module.',
      errors: [e instanceof Error ? e : new Error(String(e))],
    })
    throw e
  }
}

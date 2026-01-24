import zod from 'zod'

export const userChallengeValidator = {
  userId: zod.uuidv4(),
  challenge: zod.string(),
} as const

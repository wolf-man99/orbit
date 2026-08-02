/** Auth contracts. (PRD SEC-01, SEC-02) */
import { z } from 'zod'

export const signInSchema = z.object({
  email: z.email().max(320),
})

export const verifyOtpSchema = z.object({
  email: z.email().max(320),
  // Six digits, as a string: leading zeros are significant and a number type
  // would silently drop them.
  token: z.string().regex(/^\d{6}$/, 'must be a six-digit code'),
})

export type SignInCommand = z.infer<typeof signInSchema>
export type VerifyOtpCommand = z.infer<typeof verifyOtpSchema>

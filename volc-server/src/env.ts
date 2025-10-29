import { z } from 'zod'

const envSchema = z.object({
  VOLC_ACCESS_KEY_ID: z.string().min(1, 'VOLC_ACCESS_KEY_ID is required'),
  VOLC_SECRET_KEY: z.string().min(1, 'VOLC_SECRET_KEY is required'),
  VOLC_RTC_APP_ID: z.string().min(1, 'VOLC_RTC_APP_ID is required'),
  VOLC_RTC_APP_KEY: z.string().min(1, 'VOLC_RTC_APP_KEY is required'),
  VOLC_SCENE_DEFAULT: z.string().min(1).default('Custom'),
  VOLC_API_REGION: z.string().min(1).default('cn-north-1'),
  VOLC_API_VERSION: z.string().min(1).default('2024-12-01'),
})

export type RuntimeEnv = z.infer<typeof envSchema>

export const getEnv = (): RuntimeEnv => {
  const result = envSchema.safeParse(Bun.env)
  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message).filter(Boolean)
    throw new Error(messages.length ? messages.join('; ') : 'Environment variables validation failed')
  }
  return result.data
}

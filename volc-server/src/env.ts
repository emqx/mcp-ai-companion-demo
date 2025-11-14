const requireEnv = (key: string) => {
  const value = Bun.env[key]
  if (!value) {
    throw new Error(`${key} is required`)
  }
  return value
}

const optionalEnv = (key: string) => {
  const value = Bun.env[key]
  return value && value.length ? value : undefined
}

export interface RuntimeEnv {
  VOLC_ACCESS_KEY_ID: string
  VOLC_SECRET_KEY: string
  VOLC_RTC_APP_ID: string
  VOLC_RTC_APP_KEY: string
  VOLC_ASR_APP_ID?: string
  VOLC_TTS_APP_ID?: string
  VOLC_TTS_APP_TOKEN?: string
  VOLC_TTS_RESOURCE_ID?: string
  VOLC_LLM_URL?: string
  VOLC_LLM_API_KEY?: string
}

export const getEnv = (): RuntimeEnv => ({
  VOLC_ACCESS_KEY_ID: requireEnv('VOLC_ACCESS_KEY_ID'),
  VOLC_SECRET_KEY: requireEnv('VOLC_SECRET_KEY'),
  VOLC_RTC_APP_ID: requireEnv('VOLC_RTC_APP_ID'),
  VOLC_RTC_APP_KEY: requireEnv('VOLC_RTC_APP_KEY'),
  VOLC_ASR_APP_ID: optionalEnv('VOLC_ASR_APP_ID'),
  VOLC_TTS_APP_ID: optionalEnv('VOLC_TTS_APP_ID'),
  VOLC_TTS_APP_TOKEN: optionalEnv('VOLC_TTS_APP_TOKEN'),
  VOLC_TTS_RESOURCE_ID: optionalEnv('VOLC_TTS_RESOURCE_ID'),
  VOLC_LLM_URL: optionalEnv('VOLC_LLM_URL'),
  VOLC_LLM_API_KEY: optionalEnv('VOLC_LLM_API_KEY'),
})

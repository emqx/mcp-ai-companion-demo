type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const COLOR_RESET = '\x1b[0m'
const COLOR_PREFIX = '\x1b[35m'

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
}

const levelFromEnv = (): LogLevel => {
  const raw = Bun.env?.VOLC_LOG_LEVEL ?? 'info'
  const value = raw.toLowerCase()
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') {
    return value
  }
  return 'info'
}

const activeLevel = levelFromEnv()

const shouldLog = (level: LogLevel) => LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[activeLevel]

const serializeMeta = (meta: unknown) => {
  if (meta === undefined || meta === null) return ''
  if (typeof meta === 'string') return meta
  if (meta instanceof Error) {
    return JSON.stringify(
      {
        name: meta.name,
        message: meta.message,
        stack: meta.stack ? meta.stack.split('\n').slice(0, 3).join(' | ') : undefined,
      },
      null,
      0,
    )
  }
  try {
    const json = JSON.stringify(meta)
    if (json.length > 400) {
      return `${json.slice(0, 397)}...`
    }
    return json
  } catch {
    return String(meta)
  }
}

const log = (level: LogLevel, message: string, meta?: unknown) => {
  if (!shouldLog(level)) return
  const levelColor = LEVEL_COLORS[level]
  const prefix = `${COLOR_PREFIX}[volc-server]${COLOR_RESET}`
  const tag = `${levelColor}${level.toUpperCase()}${COLOR_RESET}`
  const metaStr = serializeMeta(meta)
  const formatted = metaStr ? `${message} ${metaStr}` : message

  const output = `${prefix} ${tag} ${formatted}`

  switch (level) {
    case 'error':
      console.error(output)
      break
    case 'warn':
      console.warn(output)
      break
    case 'debug':
      console.debug(output)
      break
    default:
      console.log(output)
  }
}

export const serverLogger = {
  debug: (message: string, meta?: unknown) => log('debug', message, meta),
  info: (message: string, meta?: unknown) => log('info', message, meta),
  warn: (message: string, meta?: unknown) => log('warn', message, meta),
  error: (message: string, meta?: unknown) => log('error', message, meta),
}

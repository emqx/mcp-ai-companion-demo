export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LoggerConfig {
  prefix: string
  color: string
  backgroundColor?: string
}

const loggerConfigs: Record<string, LoggerConfig> = {
  mcp: {
    prefix: '[MCP/MQTT]',
    color: '#00B4D8',
    backgroundColor: 'transparent',
  },
  webrtc: {
    prefix: '[WebRTC/MQTT]',
    color: '#28A745',
    backgroundColor: 'transparent',
  },
  mqtt: {
    prefix: '[MQTT]',
    color: '#8E44AD',
    backgroundColor: 'transparent',
  },
  app: {
    prefix: '[App]',
    color: '#F77F00',
    backgroundColor: 'transparent',
  },
}

export class Logger {
  private config: LoggerConfig
  private enabled: boolean = true
  private includeTimestamp: boolean

  constructor(type: keyof typeof loggerConfigs) {
    this.config = loggerConfigs[type] || loggerConfigs.app
    this.includeTimestamp = false
  }

  setTimestamp(enabled: boolean): void {
    this.includeTimestamp = enabled
  }

  private formatMessage(level: LogLevel, ...args: any[]): void {
    if (!this.enabled) return

    const styles = [
      `color: ${this.config.color}`,
      `background: ${this.config.backgroundColor || 'transparent'}`,
      'padding: 2px 6px',
      'border-radius: 3px',
      'font-weight: bold',
    ].join(';')

    const prefix = `%c${this.config.prefix}`
    const parts: any[] = [prefix, styles]
    if (this.includeTimestamp) {
      const now = new Date()
      const ts = now.toLocaleTimeString('en-US', { hour12: false }) + `.${now.getMilliseconds().toString().padStart(3, '0')}`
      parts.push(`[${ts}]`)
    }

    switch (level) {
      case 'debug':
        console.debug(...parts, ...args)
        break
      case 'info':
        console.log(...parts, ...args)
        break
      case 'warn':
        console.warn(...parts, ...args)
        break
      case 'error':
        console.error(...parts, ...args)
        break
    }
  }

  debug(...args: any[]): void {
    this.formatMessage('debug', ...args)
  }

  info(...args: any[]): void {
    this.formatMessage('info', ...args)
  }

  log(...args: any[]): void {
    this.formatMessage('info', ...args)
  }

  warn(...args: any[]): void {
    this.formatMessage('warn', ...args)
  }

  error(...args: any[]): void {
    this.formatMessage('error', ...args)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }
}

export const mcpLogger = new Logger('mcp')
export const webrtcLogger = new Logger('webrtc')
export const mqttLogger = new Logger('mqtt')
export const appLogger = new Logger('app')

type ConversationSpeaker = 'user' | 'assistant'

const speakerStyles: Record<ConversationSpeaker, { label: string; style: string }> = {
  user: {
    label: '[User]',
    style: 'color: #1D3557; font-weight: 600;',
  },
  assistant: {
    label: '[Assistant]',
    style: 'color: #E63946; font-weight: 600;',
  },
}

const secondaryStyle = 'color: #4C566A;'

export const conversationLogger = {
  log(speaker: ConversationSpeaker, message?: string | null) {
    if (!message) return
    const trimmed = message.trim()
    if (!trimmed) return

    const { label, style } = speakerStyles[speaker]
    console.log(`%c${label}%c ${trimmed}`, style, secondaryStyle)
  },
  user(message?: string | null) {
    conversationLogger.log('user', message)
  },
  assistant(message?: string | null) {
    conversationLogger.log('assistant', message)
  },
}

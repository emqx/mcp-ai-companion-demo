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

  constructor(type: keyof typeof loggerConfigs) {
    this.config = loggerConfigs[type] || loggerConfigs.app
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

    switch (level) {
      case 'debug':
        console.debug(prefix, styles, ...args)
        break
      case 'info':
        console.log(prefix, styles, ...args)
        break
      case 'warn':
        console.warn(prefix, styles, ...args)
        break
      case 'error':
        console.error(prefix, styles, ...args)
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

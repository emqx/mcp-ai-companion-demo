import type { IceServersConfig } from './storage'

export function buildIceServers(config?: IceServersConfig | null): RTCIceServer[] {
  const iceServers: RTCIceServer[] = []

  // Add custom STUN server if configured (at the beginning)
  if (config?.stunUrl) {
    iceServers.push({ urls: config.stunUrl })
  }

  // Always add Google STUN server
  iceServers.push({ urls: 'stun:stun.l.google.com:19302' })

  // Add TURN server if username and password are provided
  if (config?.turnUrl && config?.turnUsername && config?.turnPassword) {
    iceServers.push({
      urls: config.turnUrl,
      username: config.turnUsername,
      credential: config.turnPassword,
    })
  }

  return iceServers
}

export function getDefaultTurnUrl(): string {
  const currentHost = window.location.hostname || 'localhost'
  return `turn:${currentHost}:13478`
}

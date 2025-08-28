import type { WebRTCConfig, MediaConstraints } from '@/types/webrtc'

export const defaultWebRTCConfig: WebRTCConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ],
  signalingUrl: 'ws://localhost:4000/signaling',
  signalingId: undefined
}

export const defaultMediaConstraints: MediaConstraints = {
  video: true,
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    sampleSize: 16,
    channelCount: 2
  }
}

export const voiceTypes = [
  { id: 'default', name: '默认', icon: '🎤' },
  { id: 'male', name: '男声', icon: '👨' },
  { id: 'female', name: '女声', icon: '👩' },
  { id: 'child', name: '童声', icon: '👶' },
  { id: 'elder', name: '长者', icon: '👴' }
]
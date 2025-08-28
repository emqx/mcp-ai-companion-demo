export interface WebRTCConfig {
  iceServers: RTCIceServer[]
  signalingUrl: string
  signalingId?: string
}

export interface MediaConstraints {
  video: boolean | MediaTrackConstraints
  audio: boolean | MediaTrackConstraints
}

// Phoenix signaling message formats
export interface SDPData {
  type: string
  sdp: string
}

export interface ICECandidateData {
  candidate: string
  sdpMLineIndex: number | null
  sdpMid: string | null
}

export interface SignalingMessage {
  type: 'sdp_offer' | 'sdp_answer' | 'ice_candidate'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: SDPData | ICECandidateData | any // Phoenix signaling expects specific JSON format
}

export interface PhoenixChannelPayload {
  type: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
}

export interface VoiceType {
  id: string
  name: string
  icon: string
}

export type ConnectionState = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'closed'

export interface WebRTCCallbacks {
  onConnectionStateChange?: (state: ConnectionState) => void
  onLocalStream?: (stream: MediaStream) => void
  onRemoteStream?: (stream: MediaStream) => void
  onError?: (error: Error) => void
}
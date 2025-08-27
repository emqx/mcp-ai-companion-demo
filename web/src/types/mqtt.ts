import type { IClientOptions } from 'mqtt'

type MqttQoS = 0 | 1 | 2

export interface MqttConnectionOptions extends IClientOptions {
  brokerUrl?: string
  clientId?: string
}

export interface MqttMessage {
  topic: string
  payload: string
  qos: MqttQoS
  retain: boolean
}

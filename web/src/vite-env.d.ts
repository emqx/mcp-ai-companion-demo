/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AIGC_PROXY_HOST?: string
  readonly VITE_MQTT_BROKER_URL?: string
  readonly VITE_MQTT_USERNAME?: string
  readonly VITE_MQTT_PASSWORD?: string
  readonly VITE_MQTT_CONNECT_TIMEOUT?: string
  readonly VITE_MQTT_RECONNECT_PERIOD?: string
  readonly VITE_MQTT_PROTOCOL_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

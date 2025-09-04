/**
 * Get the current host URL (origin)
 * In development, this returns the Vite dev server URL
 * In production, this returns the actual host URL
 * @returns The current host URL (e.g., 'http://localhost:5173' or 'https://example.com')
 */
export function getCurrentHost(): string {
  return window.location.origin
}

/**
 * Get the WebSocket protocol based on current protocol
 * @returns 'ws:' for http, 'wss:' for https
 */
export function getWebSocketProtocol(): string {
  return window.location.protocol === 'https:' ? 'wss:' : 'ws:'
}

/**
 * Get the API base URL
 * This handles the proxy configuration in development
 * @returns The API base URL
 */
export function getApiBaseUrl(): string {
  // In development, Vite proxy handles /api routes
  // In production, API is served from the same origin
  return getCurrentHost()
}

/**
 * Build an API URL with the current host
 * @param path - The API path (e.g., '/api/download/123')
 * @returns The full API URL
 */
export function buildApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl()
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${normalizedPath}`
}

/**
 * Build a WebSocket URL with the current host
 * @param path - The WebSocket path (e.g., '/signaling')
 * @param port - Optional port number (defaults to 4000 for backend API)
 * @returns The full WebSocket URL
 */
export function buildWebSocketUrl(path: string, port: number = 4000): string {
  const protocol = getWebSocketProtocol()
  const hostname = window.location.hostname
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${protocol}//${hostname}:${port}${normalizedPath}`
}

/**
 * Build a MQTT over WebSocket URL with the current host
 * @param path - The MQTT path (e.g., '/mqtt')
 * @param port - MQTT WebSocket port (defaults to 8083 for EMQX)
 * @returns The full MQTT WebSocket URL
 */
export function buildMqttWebSocketUrl(path: string = '/mqtt', port: number = 8083): string {
  return buildWebSocketUrl(path, port)
}

import type { ApiResponse, ApiResponseMetadata, ApiResult } from '@/types/aigc'

const DEFAULT_HOST = (import.meta.env.VITE_AIGC_PROXY_HOST || 'http://localhost:3001').replace(/\/+$/, '')

export interface RequestOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
}

export class ApiError<T = unknown> extends Error {
  public readonly metadata: ApiResponseMetadata
  public readonly status: number
  public readonly payload: ApiResponse<T>

  constructor(message: string, metadata: ApiResponseMetadata, status: number, payload: ApiResponse<T>) {
    super(message)
    this.name = 'ApiError'
    this.metadata = metadata
    this.status = status
    this.payload = payload
  }
}

const buildUrl = (path: string, query?: RequestOptions['query']) => {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, `${DEFAULT_HOST}/`)
  if (query) {
    Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== null)
      .forEach(([key, value]) => url.searchParams.append(key, String(value)))
  }
  return url
}

export const request = async <T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> => {
  const { method = 'POST', body, headers = {}, query } = options
  const url = buildUrl(path, query)

  const response = await fetch(url.toString(), {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  let payload: ApiResponse<T>
  try {
    payload = (await response.json()) as ApiResponse<T>
  } catch {
    throw new ApiError(
      'Invalid JSON response',
      {
        Action: 'Unknown',
      },
      response.status,
      { ResponseMetadata: { Action: 'Unknown' } }
    )
  }

  const metadata = payload.ResponseMetadata ?? { Action: 'Unknown' }

  if (!response.ok) {
    throw new ApiError('Request failed', metadata, response.status, payload)
  }

  if (metadata.Error) {
    throw new ApiError(metadata.Error.Message || 'API error', metadata, response.status, payload)
  }

  return {
    metadata,
    result: (payload.Result ?? (undefined as unknown as T)) as T,
    raw: payload,
  }
}

export const getProxyHost = () => DEFAULT_HOST

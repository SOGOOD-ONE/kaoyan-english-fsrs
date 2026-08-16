const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'

let accessToken = sessionStorage.getItem('access_token') || ''

export function setAccessToken(token: string) {
  accessToken = token
  sessionStorage.setItem('access_token', token)
}

export function clearAccessToken() {
  accessToken = ''
  sessionStorage.removeItem('access_token')
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || '请求失败')
  return data as T
}

// API client — 统一的后端 API 调用封装。
// 替换原来的 github-client.ts，所有数据操作通过此后端 API 完成。

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api'

// ---- Token 管理 ----

let _authToken: string | null = null

if (typeof sessionStorage !== 'undefined') {
	_authToken = sessionStorage.getItem('api_token')
}

function _getToken(): string | null {
	if (_authToken) return _authToken
	// Fallback: re-read from sessionStorage (survives HMR module re-init)
	if (typeof sessionStorage !== 'undefined') {
		return sessionStorage.getItem('api_token')
	}
	return null
}

function _setToken(token: string | null): void {
	_authToken = token
	if (typeof sessionStorage === 'undefined') return
	try {
		if (token) {
			sessionStorage.setItem('api_token', token)
		} else {
			sessionStorage.removeItem('api_token')
		}
	} catch {
		// ignore storage errors
	}
}

export function hasCachedToken(): boolean {
	return !!_getToken()
}

// ---- Types ----

interface ApiErrorBody {
	code: string
	message: string
	details?: Record<string, unknown>
}

export class ApiError extends Error {
	code: string
	details?: Record<string, unknown>
	status: number

	constructor(status: number, body: ApiErrorBody) {
		super(body.message)
		this.name = 'ApiError'
		this.code = body.code
		this.details = body.details
		this.status = status
	}
}

// ---- Core fetch wrapper ----

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
	const url = `${API_BASE}${path}`
	const headers: Record<string, string> = {
		...(options.headers as Record<string, string>),
	}

	// Attach auth token if available.
	const token = _getToken()
	if (token) {
		headers['Authorization'] = `Bearer ${token}`
	}

	// Don't set Content-Type for FormData (browser sets it with boundary).
	const res = await fetch(url, { ...options, headers })

	if (!res.ok) {
		let errorBody: ApiErrorBody = { code: 'UNKNOWN', message: `HTTP ${res.status}` }
		try {
			const json = await res.json()
			if (json.error) {
				errorBody = json.error
			}
		} catch {
			// If response is not JSON, use the text as message.
			try {
				const text = await res.text()
				if (text) errorBody.message = text
			} catch {
				// keep default
			}
		}

		if (res.status === 401) {
			_setToken(null)
		}

		throw new ApiError(res.status, errorBody)
	}

	// Handle 204 No Content.
	if (res.status === 204) {
		return undefined as unknown as T
	}

	return res.json().then((d) => (d.data !== undefined ? d.data : d))
}

// ---- Public API functions ----

export async function apiGet<T>(path: string): Promise<T> {
	return apiFetch<T>(path, { method: 'GET' })
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
	return apiFetch<T>(path, {
		method: 'POST',
		headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
		body: body instanceof FormData ? body : JSON.stringify(body),
	})
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
	return apiFetch<T>(path, {
		method: 'PUT',
		headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
		body: body instanceof FormData ? body : JSON.stringify(body),
	})
}

export async function apiDelete<T>(path: string): Promise<T> {
	return apiFetch<T>(path, { method: 'DELETE' })
}

// ---- Auth-specific functions ----

export async function login(password: string): Promise<string> {
	const data: { token: string } = await apiPost('/auth/login', { password })
	_setToken(data.token)
	return data.token
}

export function logout(): void {
	_setToken(null)
}

export function getAuthToken(): string | null {
	return _getToken()
}

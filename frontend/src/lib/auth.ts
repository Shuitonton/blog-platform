// 认证层 —— 纯函数模块，不依赖任何 store 或 hooks。
// Token 持久化在 sessionStorage，通过 api-client 模块读写。

import { login as apiLogin, getAuthToken as getToken, hasCachedToken, logout as apiLogout } from './api-client'

export async function authenticate(password: string): Promise<string> {
	return apiLogin(password)
}

export function getAuthToken(): string | null {
	return getToken()
}

export function hasAuthSync(): boolean {
	return hasCachedToken()
}

export function clearAllAuthCache(): void {
	apiLogout()
}

import { create } from 'zustand'
import { clearAllAuthCache, getAuthToken as getToken, hasAuthSync } from '@/lib/auth'

interface AuthStore {
	isAuth: boolean
	setAuth: (token: string) => void
	clearAuth: () => void
	refreshAuthState: () => void
	getAuthToken: () => string | null
}

export const useAuthStore = create<AuthStore>((set, get) => ({
	isAuth: hasAuthSync(),

	setAuth: (_token: string) => {
		set({ isAuth: true })
	},

	clearAuth: () => {
		clearAllAuthCache()
		set({ isAuth: false })
	},

	refreshAuthState: () => {
		set({ isAuth: hasAuthSync() })
	},

	getAuthToken: () => {
		const token = getToken()
		if (!token) {
			get().clearAuth()
			return null
		}
		return token
	},
}))

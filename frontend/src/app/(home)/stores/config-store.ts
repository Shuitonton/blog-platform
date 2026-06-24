import { create } from 'zustand'
import { apiGet } from '@/lib/api-client'
import siteContentDefault from '@/config/site-content.json'
import cardStylesDefault from '@/config/card-styles.json'

export type SiteContent = typeof siteContentDefault
export type CardStyles = typeof cardStylesDefault

// 深度合并：backend 中有值的字段覆盖 def，空对象/null 则保留默认值。
// backend 中新增的字段也会保留（如 favicon, avatar）。
function deepMerge<T extends Record<string, any>>(def: T, backend: any): T {
	if (!backend || typeof backend !== 'object' || Object.keys(backend).length === 0) {
		return { ...def }
	}
	const result = { ...def } as Record<string, any>
	// 覆盖 default 中已有的 key
	for (const key of Object.keys(result)) {
		if (backend[key] !== undefined && backend[key] !== null) {
			if (typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
				result[key] = { ...result[key], ...backend[key] }
			} else if (Array.isArray(result[key]) && Array.isArray(backend[key])) {
				result[key] = backend[key].length > 0 ? backend[key] : result[key]
			} else {
				result[key] = backend[key]
			}
		}
	}
	// 保留 backend 中有但 default 中没有的新字段
	for (const key of Object.keys(backend)) {
		if (!(key in result) && backend[key] !== undefined && backend[key] !== null) {
			result[key] = backend[key]
		}
	}
	return result as T
}

interface ConfigStore {
	siteContent: SiteContent
	cardStyles: CardStyles
	regenerateKey: number
	configDialogOpen: boolean
	loaded: boolean
	loadConfig: () => Promise<void>
	setSiteContent: (content: SiteContent) => void
	setCardStyles: (styles: CardStyles) => void
	resetSiteContent: () => void
	resetCardStyles: () => void
	regenerateBubbles: () => void
	setConfigDialogOpen: (open: boolean) => void
}

export const useConfigStore = create<ConfigStore>((set) => ({
	siteContent: { ...siteContentDefault },
	cardStyles: { ...cardStylesDefault },
	regenerateKey: 0,
	configDialogOpen: false,
	loaded: false,

	loadConfig: async () => {
		try {
			const [backendSite, backendStyles] = await Promise.all([
				apiGet<any>('/site-config').catch(() => null),
				apiGet<any>('/card-styles').catch(() => null),
			])

			const siteContent = deepMerge(siteContentDefault, backendSite)
			const cardStyles = deepMerge(cardStylesDefault as any, backendStyles) as CardStyles

			set({ siteContent, cardStyles, loaded: true })
		} catch {
			set({ loaded: true })
		}
	},

	setSiteContent: (content: SiteContent) => {
		set({ siteContent: content })
	},
	setCardStyles: (styles: CardStyles) => {
		set({ cardStyles: styles })
	},
	resetSiteContent: () => {
		set({ siteContent: { ...siteContentDefault } })
	},
	resetCardStyles: () => {
		set({ cardStyles: { ...cardStylesDefault } })
	},
	regenerateBubbles: () => {
		set((state) => ({ regenerateKey: state.regenerateKey + 1 }))
	},
	setConfigDialogOpen: (open: boolean) => {
		set({ configDialogOpen: open })
	},
}))

// 在客户端自动从后端拉取配置
if (typeof window !== 'undefined') {
	useConfigStore.getState().loadConfig()
}

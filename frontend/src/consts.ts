export const INIT_DELAY = 0.3
export const ANIMATION_DELAY = 0.1
export const CARD_SPACING = 36
export const CARD_SPACING_SM = 24
export const BLOG_SLUG_KEY = process.env.BLOG_SLUG_KEY || ''

/**
 * API 配置 —— 指向后端 API 服务地址
 */
export const API_CONFIG = {
	BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api',
	UPLOADS_URL: process.env.NEXT_PUBLIC_UPLOADS_URL || 'http://localhost:8080/uploads',
} as const

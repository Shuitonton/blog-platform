import type { BlogConfig } from '@/app/blog/types'
import { apiGet } from '@/lib/api-client'

export type { BlogConfig } from '@/app/blog/types'

export type LoadedBlog = {
	slug: string
	config: BlogConfig
	markdown: string
	cover?: string
}

/**
 * 从后端 API 加载博客全文数据。
 * 原实现从 public/blogs/{slug}/config.json + index.md 加载，
 * 现在统一通过 GET /api/blogs/{slug} 获取。
 */
export async function loadBlog(slug: string): Promise<LoadedBlog> {
	if (!slug) {
		throw new Error('Slug is required')
	}

	interface BlogDetail {
		slug: string
		title: string
		tags: string[]
		date: string
		summary: string
		cover: string
		hidden: boolean
		category: string
		content: string
		images: string[]
	}

	const detail = await apiGet<BlogDetail>(`/blogs/${encodeURIComponent(slug)}`)

	const config: BlogConfig = {
		title: detail.title,
		tags: detail.tags,
		date: detail.date,
		summary: detail.summary,
		cover: detail.cover,
		hidden: detail.hidden,
		category: detail.category,
	}

	return {
		slug: detail.slug,
		config,
		markdown: detail.content,
		cover: detail.cover,
	}
}

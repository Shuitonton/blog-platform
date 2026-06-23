'use client'

import type { BlogIndexItem } from '@/app/blog/types'

export type { BlogIndexItem } from '@/app/blog/types'

/**
 * 博客索引操作 —— 原 GitHub 文件操作全部替换为后端 API 调用。
 * 之前的 prepareBlogsIndex / removeBlogsFromIndex 等辅助函数已不需要，
 * 因为后端在 POST/PUT/DELETE 博客时自动维护索引。
 */

export async function prepareBlogsIndex(_token: string, _owner: string, _repo: string, item: BlogIndexItem, _branch: string): Promise<string> {
	// 向后兼容接口 — 新架构下不再单独维护索引，
	// 后端创建/更新博客时自动更新 blogs 表。
	console.warn('prepareBlogsIndex is deprecated — index is maintained server-side')
	return JSON.stringify([item], null, 2)
}

export async function removeBlogsFromIndex(_token: string, _owner: string, _repo: string, _slugs: string[], _branch: string): Promise<string> {
	console.warn('removeBlogsFromIndex is deprecated — use DELETE /api/blogs instead')
	return '[]'
}

export async function removeBlogFromIndex(_token: string, _owner: string, _repo: string, _slug: string, _branch: string): Promise<string> {
	console.warn('removeBlogFromIndex is deprecated — use DELETE /api/blogs/{slug} instead')
	return '[]'
}

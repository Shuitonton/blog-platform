import { toast } from 'sonner'
import { apiDelete, apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import type { BlogIndexItem } from '@/lib/blog-index'

export async function saveBlogEdits(originalItems: BlogIndexItem[], nextItems: BlogIndexItem[], categories: string[]): Promise<void> {
	const removedSlugs = originalItems
		.filter(item => !nextItems.some(next => next.slug === item.slug))
		.map(item => item.slug)
	const uniqueRemoved = Array.from(new Set(removedSlugs.filter(Boolean)))

	const token = getAuthToken()
	if (!token) throw new Error('请先认证（输入密码）')

	// 删除已移除的博客
	for (const slug of uniqueRemoved) {
		toast.info(`正在删除 ${slug}...`)
		await apiDelete(`/blogs/${encodeURIComponent(slug)}`)
	}

	// 更新分类
	toast.info('正在更新分类...')
	const uniqueCategories = Array.from(new Set(categories.map(c => c.trim()).filter(Boolean)))
	await apiPut('/categories', uniqueCategories)

	toast.success('保存成功！')
}

import { toast } from 'sonner'
import { apiDelete } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'

export async function batchDeleteBlogs(slugs: string[]): Promise<void> {
	const uniqueSlugs = Array.from(new Set(slugs.filter(Boolean)))
	if (uniqueSlugs.length === 0) {
		throw new Error('需要至少选择一篇文章')
	}

	const token = getAuthToken()
	if (!token) throw new Error('请先认证（输入密码）')

	toast.info('正在批量删除...')
	// 逐个删除（后端目前 DELETE 只支持单个 slug）
	for (const slug of uniqueSlugs) {
		await apiDelete(`/blogs/${encodeURIComponent(slug)}`)
	}
	toast.success('删除成功！')
}

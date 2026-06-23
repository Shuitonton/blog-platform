import { toast } from 'sonner'
import { apiDelete } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'

export async function deleteBlog(slug: string): Promise<void> {
	if (!slug) throw new Error('需要 slug')

	const token = getAuthToken()
	if (!token) throw new Error('请先认证（输入密码）')

	toast.info('正在删除文章...')
	await apiDelete(`/blogs/${encodeURIComponent(slug)}`)
	toast.success('删除成功！')
}

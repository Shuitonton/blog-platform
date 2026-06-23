import { apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import { toast } from 'sonner'
import type { Blogger } from '../grid-view'

export type PushBloggersParams = {
	bloggers: Blogger[]
	avatarItems?: Map<string, any>
}

export async function pushBloggers(params: PushBloggersParams): Promise<void> {
	const { bloggers } = params
	const token = getAuthToken()
	if (!token) throw new Error('请先认证')

	toast.info('正在保存友链...')
	await apiPut('/bloggers', bloggers)
	toast.success('保存成功！')
}

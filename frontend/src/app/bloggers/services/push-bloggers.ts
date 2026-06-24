import { apiPost, apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import { toast } from 'sonner'
import type { Blogger } from '../grid-view'

export type PushBloggersParams = {
	bloggers: Blogger[]
	avatarItems?: Map<string, any>
}

export async function pushBloggers(params: PushBloggersParams): Promise<void> {
	const { bloggers, avatarItems } = params
	const token = getAuthToken()
	if (!token) throw new Error('请先认证')

	// Upload any local avatar files and replace blob URLs with real paths
	if (avatarItems) {
		for (const [bloggerUrl, item] of avatarItems.entries()) {
			if (item && (item as any).type === 'file') {
				const formData = new FormData()
				formData.append('file', (item as any).file)
				toast.info('正在上传头像...')
				const result = await apiPost<{ url: string }>('/upload', formData)
				// Replace the blob URL in the blogger data with the real path
				for (const b of bloggers) {
					if (b.url === bloggerUrl) {
						b.avatar = result.url
					}
				}
			}
		}
	}

	toast.info('正在保存友链...')
	await apiPut('/bloggers', bloggers)
	toast.success('保存成功！')
}

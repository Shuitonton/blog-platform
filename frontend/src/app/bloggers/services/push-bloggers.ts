import { apiPost, apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import { toast } from 'sonner'
import type { Blogger } from '../grid-view'
import type { AvatarItem } from '../components/avatar-upload-dialog'

export type PushBloggersParams = {
	bloggers: Blogger[]
	avatarItems?: Map<string, AvatarItem>
}
function assertNoBlobUrls(items: Blogger[]): void {
	const invalidItem = items.find(item => item.avatar.startsWith('blob:'))
	if (invalidItem) {
		throw new Error('博主头像仍是浏览器临时地址，请重新选择图片并等待上传完成后再保存')
	}
}

export async function pushBloggers(params: PushBloggersParams): Promise<Blogger[]> {
	const { bloggers, avatarItems } = params
	let savedBloggers = bloggers.map(blogger => ({ ...blogger }))
	const token = getAuthToken()
	if (!token) throw new Error('请先认证')

	// Upload any local avatar files and replace blob URLs with real paths
	if (avatarItems) {
		for (const [bloggerUrl, item] of avatarItems.entries()) {
			if (item.type === 'file') {
				const formData = new FormData()
				formData.append('file', item.file)
				toast.info('正在上传头像...')
				const result = await apiPost<{ url: string }>('/upload', formData)
				// Replace the blob URL in the blogger data with the real path
				savedBloggers = savedBloggers.map(b => (b.url === bloggerUrl ? { ...b, avatar: result.url } : b))
			}
		}
	}

	toast.info('正在保存友链...')
	assertNoBlobUrls(savedBloggers)
	await apiPut('/bloggers', savedBloggers)
	toast.success('保存成功！')
	return savedBloggers
}

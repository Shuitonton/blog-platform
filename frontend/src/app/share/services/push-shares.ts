import { apiPost, apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import { toast } from 'sonner'
import type { Share } from '../components/share-card'
import type { LogoItem } from '../components/logo-upload-dialog'

export type PushSharesParams = {
	shares: Share[]
	logoItems?: Map<string, LogoItem>
}
function assertNoBlobUrls(items: Share[]): void {
	const invalidItem = items.find(item => item.logo.startsWith('blob:'))
	if (invalidItem) {
		throw new Error('推荐图标仍是浏览器临时地址，请重新选择图片并等待上传完成后再保存')
	}
}

export async function pushShares(params: PushSharesParams): Promise<Share[]> {
	const { shares, logoItems } = params
	let savedShares = shares.map(share => ({ ...share }))
	const token = getAuthToken()
	if (!token) throw new Error('请先认证')

	// Upload any local logo files and replace blob URLs with real paths
	if (logoItems) {
		for (const [shareUrl, item] of logoItems.entries()) {
			if (item.type === 'file') {
				const formData = new FormData()
				formData.append('file', item.file)
				toast.info('正在上传图片...')
				const result = await apiPost<{ url: string }>('/upload', formData)
				// Replace the blob URL in the share data with the real path
				savedShares = savedShares.map(s => (s.url === shareUrl ? { ...s, logo: result.url } : s))
			}
		}
	}

	toast.info('正在保存分享列表...')
	assertNoBlobUrls(savedShares)
	await apiPut('/shares', savedShares)
	toast.success('保存成功！')
	return savedShares
}

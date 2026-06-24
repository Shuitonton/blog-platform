import { apiPost, apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import { toast } from 'sonner'
import type { Share } from '../components/share-card'

export type PushSharesParams = {
	shares: Share[]
	logoItems?: Map<string, any>
}

export async function pushShares(params: PushSharesParams): Promise<void> {
	const { shares, logoItems } = params
	const token = getAuthToken()
	if (!token) throw new Error('请先认证')

	// Upload any local logo files and replace blob URLs with real paths
	if (logoItems) {
		for (const [shareUrl, item] of logoItems.entries()) {
			if (item && (item as any).type === 'file') {
				const formData = new FormData()
				formData.append('file', (item as any).file)
				toast.info('正在上传图片...')
				const result = await apiPost<{ url: string }>('/upload', formData)
				// Replace the blob URL in the share data with the real path
				for (const s of shares) {
					if (s.url === shareUrl) {
						s.logo = result.url
					}
				}
			}
		}
	}

	toast.info('正在保存分享列表...')
	await apiPut('/shares', shares)
	toast.success('保存成功！')
}

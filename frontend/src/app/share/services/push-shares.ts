import { apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import { toast } from 'sonner'
import type { Share } from '../components/share-card'

export type PushSharesParams = {
	shares: Share[]
	logoItems?: Map<string, any>
}

export async function pushShares(params: PushSharesParams): Promise<void> {
	const { shares } = params
	const token = getAuthToken()
	if (!token) throw new Error('请先认证')

	toast.info('正在保存分享列表...')
	await apiPut('/shares', shares)
	toast.success('保存成功！')
}

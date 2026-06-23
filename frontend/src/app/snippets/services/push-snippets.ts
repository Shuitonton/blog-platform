import { apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import { toast } from 'sonner'

export type PushSnippetsParams = {
	snippets: string[]
}

export async function pushSnippets(params: PushSnippetsParams): Promise<void> {
	const { snippets } = params
	const token = getAuthToken()
	if (!token) throw new Error('请先认证')

	toast.info('正在保存句子列表...')
	await apiPut('/snippets', snippets)
	toast.success('保存成功！')
}

import { apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import { toast } from 'sonner'

export type AboutData = {
	title: string
	description: string
	content: string
}

export async function pushAbout(data: AboutData): Promise<void> {
	const token = getAuthToken()
	if (!token) throw new Error('请先认证')

	toast.info('正在保存关于页面...')
	await apiPut('/about', data)
	toast.success('保存成功！')
}

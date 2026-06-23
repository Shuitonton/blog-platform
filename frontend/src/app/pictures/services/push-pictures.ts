import { apiPost, apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import { toast } from 'sonner'
import type { Picture } from '../page'

export type PushPicturesParams = {
	pictures: Picture[]
	imageItems?: Map<string, any>
}

export async function pushPictures(params: PushPicturesParams): Promise<void> {
	const { pictures } = params
	const token = getAuthToken()
	if (!token) throw new Error('请先认证')

	toast.info('正在保存图床...')
	await apiPut('/pictures', pictures)
	toast.success('保存成功！')
}

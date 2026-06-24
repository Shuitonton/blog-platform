import { apiPost, apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import { toast } from 'sonner'
import type { Project } from '../components/project-card'

export type PushProjectsParams = {
	projects: Project[]
	imageItems?: Map<string, any>
}

export async function pushProjects(params: PushProjectsParams): Promise<void> {
	const { projects, imageItems } = params
	const token = getAuthToken()
	if (!token) throw new Error('请先认证')

	// Upload any local image files and replace blob URLs with real paths
	if (imageItems) {
		for (const [projectUrl, item] of imageItems.entries()) {
			if (item && (item as any).type === 'file') {
				const formData = new FormData()
				formData.append('file', (item as any).file)
				toast.info('正在上传图片...')
				const result = await apiPost<{ url: string }>('/upload', formData)
				// Replace the blob URL in the project data with the real path
				for (const p of projects) {
					if (p.url === projectUrl) {
						p.image = result.url
					}
				}
			}
		}
	}

	toast.info('正在保存项目列表...')
	await apiPut('/projects', projects)
	toast.success('保存成功！')
}

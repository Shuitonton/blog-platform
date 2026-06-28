import { apiPost, apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import { toast } from 'sonner'
import type { Project } from '../components/project-card'
import type { ImageItem } from '../components/image-upload-dialog'

export type PushProjectsParams = {
	projects: Project[]
	imageItems?: Map<string, ImageItem>
}

export async function pushProjects(params: PushProjectsParams): Promise<Project[]> {
	const { projects, imageItems } = params
	let savedProjects = projects.map(project => ({ ...project }))
	const token = getAuthToken()
	if (!token) throw new Error('请先认证')

	// Upload any local image files and replace blob URLs with real paths
	if (imageItems) {
		for (const [projectUrl, item] of imageItems.entries()) {
			if (item.type === 'file') {
				const formData = new FormData()
				formData.append('file', item.file)
				toast.info('正在上传图片...')
				const result = await apiPost<{ url: string }>('/upload', formData)
				// Replace the blob URL in the project data with the real path
				savedProjects = savedProjects.map(p => (p.url === projectUrl ? { ...p, image: result.url } : p))
			}
		}
	}

	toast.info('正在保存项目列表...')
	await apiPut('/projects', savedProjects)
	toast.success('保存成功！')
	return savedProjects
}

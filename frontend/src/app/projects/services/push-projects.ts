import { apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import { toast } from 'sonner'
import type { Project } from '../components/project-card'

export type PushProjectsParams = {
	projects: Project[]
	imageItems?: Map<string, any>
}

export async function pushProjects(params: PushProjectsParams): Promise<void> {
	const { projects } = params
	const token = getAuthToken()
	if (!token) throw new Error('请先认证')

	toast.info('正在保存项目列表...')
	await apiPut('/projects', projects)
	toast.success('保存成功！')
}

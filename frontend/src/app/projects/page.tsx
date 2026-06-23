'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { ProjectCard, type Project } from './components/project-card'
import CreateDialog from './components/create-dialog'
import { pushProjects } from './services/push-projects'
import { getAuthToken } from '@/lib/auth'
import { useAuthStore } from '@/hooks/use-auth'
import { useConfigStore } from '@/app/(home)/stores/config-store'
import { apiGet } from '@/lib/api-client'
import type { ImageItem } from './components/image-upload-dialog'

export default function Page() {
	const [projects, setProjects] = useState<Project[]>([])
	const [originalProjects, setOriginalProjects] = useState<Project[]>([])
	const [isEditMode, setIsEditMode] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [editingProject, setEditingProject] = useState<Project | null>(null)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
	const [imageItems, setImageItems] = useState<Map<string, ImageItem>>(new Map())

	const { isAuth } = useAuthStore()
	const { siteContent } = useConfigStore()
	const hideEditButton = siteContent.hideEditButton ?? false

	useEffect(() => {
		apiGet<Project[]>('/projects').then(data => {
			if (Array.isArray(data) && data.length > 0) {
				setProjects(data); setOriginalProjects(data)
			}
		}).catch(() => {})
	}, [])

	const handleUpdate = (updated: Project, old: Project, imageItem?: ImageItem) => {
		setProjects(prev => prev.map(p => (p.url === old.url ? updated : p)))
		if (imageItem) {
			setImageItems(prev => { const m = new Map(prev); m.set(updated.url, imageItem); return m })
		}
	}
	const handleAdd = () => { setEditingProject(null); setIsCreateDialogOpen(true) }
	const handleSaveProject = (p: Project) => {
		if (editingProject) setProjects(prev => prev.map(x => (x.url === editingProject.url ? p : x)))
		else setProjects(prev => [...prev, p])
	}
	const handleDelete = (project: Project) => {
		if (confirm(`删除 ${project.title || project.url}？`)) setProjects(prev => prev.filter(p => p.url !== project.url))
	}

	const handleSave = async () => {
		setIsSaving(true)
		try {
			const token = getAuthToken()
			if (!token) { toast.error('请先登录'); return }
			await pushProjects({ projects, imageItems })
			setOriginalProjects(projects)
			setImageItems(new Map())
			setIsEditMode(false)
			toast.success('保存成功！')
		} catch (error: any) {
			console.error(error)
			toast.error(`保存失败: ${error?.message || '未知错误'}`)
		} finally { setIsSaving(false) }
	}

	const handleCancel = () => { setProjects(originalProjects); setImageItems(new Map()); setIsEditMode(false) }

	useEffect(() => {
		const h = (e: KeyboardEvent) => { if (!isEditMode && (e.ctrlKey||e.metaKey) && e.key===',') { e.preventDefault(); setIsEditMode(true) } }
		window.addEventListener('keydown', h)
		return () => window.removeEventListener('keydown', h)
	}, [isEditMode])

	return (
		<>
			<div className='flex flex-col items-center justify-center px-6 pt-32 pb-12'>
				<div className='grid w-full max-w-[1200px] grid-cols-2 gap-6 max-md:grid-cols-1'>
					{projects.map((project) => (
						<ProjectCard key={project.url} project={project} isEditMode={isEditMode} onUpdate={handleUpdate} onDelete={() => handleDelete(project)} />
					))}
				</div>
			</div>
			<motion.div initial={{ opacity:0,scale:0.6 }} animate={{ opacity:1,scale:1 }} className='absolute top-4 right-6 flex gap-3 max-sm:hidden'>
				{isEditMode ? (<>
					<motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }} onClick={handleCancel} disabled={isSaving} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>取消</motion.button>
					<motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }} onClick={handleAdd} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>添加</motion.button>
					<motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }} onClick={handleSave} disabled={isSaving} className='brand-btn px-6'>{isSaving?'保存中...':'保存'}</motion.button>
				</>) : (<>{!hideEditButton && <motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }} onClick={()=>setIsEditMode(true)} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>编辑</motion.button>}</>)}
			</motion.div>
			{isCreateDialogOpen && <CreateDialog onClose={()=>setIsCreateDialogOpen(false)} onSave={handleSaveProject} />}
		</>
	)
}

'use client'

import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import GridView, { type Blogger } from './grid-view'
import CreateDialog from './components/create-dialog'
import { pushBloggers } from './services/push-bloggers'
import { getAuthToken } from '@/lib/auth'
import { useAuthStore } from '@/hooks/use-auth'
import { useConfigStore } from '@/app/(home)/stores/config-store'
import { apiGet } from '@/lib/api-client'
import type { AvatarItem } from './components/avatar-upload-dialog'
import seedBloggers from './list.json'

export default function Page() {
	const [bloggers, setBloggers] = useState<Blogger[]>([])
	const [originalBloggers, setOriginalBloggers] = useState<Blogger[]>([])
	const [isEditMode, setIsEditMode] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [editingBlogger, setEditingBlogger] = useState<Blogger | null>(null)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
	const [avatarItems, setAvatarItems] = useState<Map<string, AvatarItem>>(new Map())

	const { isAuth } = useAuthStore()
	const { siteContent } = useConfigStore()
	const hideEditButton = siteContent.hideEditButton ?? false

	useEffect(() => {
		apiGet<Blogger[]>('/bloggers').then(data => {
			if (Array.isArray(data) && data.length > 0) { setBloggers(data); setOriginalBloggers(data) }
			else { setBloggers(seedBloggers as Blogger[]); setOriginalBloggers(seedBloggers as Blogger[]) }
		}).catch(() => { setBloggers(seedBloggers as Blogger[]); setOriginalBloggers(seedBloggers as Blogger[]) })
	}, [])

	const handleUpdate = (updated: Blogger, old: Blogger, avatarItem?: AvatarItem) => {
		setBloggers(prev => prev.map(b => (b.url === old.url ? updated : b)))
		if (avatarItem) { const m = new Map(avatarItems); m.set(updated.url, avatarItem); setAvatarItems(m) }
	}
	const handleAdd = () => { setEditingBlogger(null); setIsCreateDialogOpen(true) }
	const handleSaveBlogger = (b: Blogger) => {
		if (editingBlogger) setBloggers(prev => prev.map(x => (x.url === editingBlogger.url ? b : x)))
		else setBloggers(prev => [...prev, b])
	}
	const handleDelete = (b: Blogger) => {
		if (confirm(`删除 ${b.name}？`)) setBloggers(prev => prev.filter(x => x.url !== b.url))
	}

	const handleSave = async () => {
		setIsSaving(true)
		try {
			const token = getAuthToken()
			if (!token) { toast.error('请先登录'); return }
			await pushBloggers({ bloggers, avatarItems })
			setOriginalBloggers(bloggers); setAvatarItems(new Map()); setIsEditMode(false)
			toast.success('保存成功！')
		} catch (error: any) { toast.error(`保存失败: ${error?.message||'未知错误'}`) }
		finally { setIsSaving(false) }
	}
	const handleCancel = () => { setBloggers(originalBloggers); setAvatarItems(new Map()); setIsEditMode(false) }

	useEffect(() => {
		const h = (e: KeyboardEvent) => { if (!isEditMode && (e.ctrlKey||e.metaKey) && e.key===',') { e.preventDefault(); setIsEditMode(true) } }
		window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
	}, [isEditMode])

	return (<>
		<GridView bloggers={bloggers} isEditMode={isEditMode} onUpdate={handleUpdate} onDelete={handleDelete} />
		<motion.div initial={{opacity:0,scale:0.6}} animate={{opacity:1,scale:1}} className='absolute top-4 right-6 flex gap-3 max-sm:hidden'>
			{isEditMode ? (<>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleCancel} disabled={isSaving} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>取消</motion.button>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleAdd} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>添加</motion.button>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleSave} disabled={isSaving} className='brand-btn px-6'>{isSaving?'保存中...':'保存'}</motion.button>
			</>) : (<>{!hideEditButton && <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={()=>setIsEditMode(true)} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>编辑</motion.button>}</>)}
		</motion.div>
		{isCreateDialogOpen && <CreateDialog onClose={()=>setIsCreateDialogOpen(false)} onSave={handleSaveBlogger} />}
	</>)
}

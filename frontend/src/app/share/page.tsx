'use client'

import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import GridView from './grid-view'
import type { Share } from './components/share-card'
import CreateDialog from './components/create-dialog'
import { pushShares } from './services/push-shares'
import { getAuthToken } from '@/lib/auth'
import { useAuthStore } from '@/hooks/use-auth'
import { useConfigStore } from '@/app/(home)/stores/config-store'
import { apiGet } from '@/lib/api-client'
import type { LogoItem } from './components/logo-upload-dialog'
import seedShares from './list.json'

export default function Page() {
	const [shares, setShares] = useState<Share[]>([])
	const [originalShares, setOriginalShares] = useState<Share[]>([])
	const [isEditMode, setIsEditMode] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [editingShare, setEditingShare] = useState<Share | null>(null)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
	const [logoItems, setLogoItems] = useState<Map<string, LogoItem>>(new Map())

	const { isAuth } = useAuthStore()
	const { siteContent } = useConfigStore()
	const hideEditButton = siteContent.hideEditButton ?? false

	useEffect(() => {
		apiGet<Share[]>('/shares').then(data => {
			if (Array.isArray(data) && data.length > 0) { setShares(data); setOriginalShares(data) }
			else { setShares(seedShares as Share[]); setOriginalShares(seedShares as Share[]) }
		}).catch(() => { setShares(seedShares as Share[]); setOriginalShares(seedShares as Share[]) })
	}, [])

	const handleUpdate = (updated: Share, old: Share, logoItem?: LogoItem) => {
		setShares(prev => prev.map(s => (s.url === old.url ? updated : s)))
		if (logoItem) { const m = new Map(logoItems); m.set(updated.url, logoItem); setLogoItems(m) }
	}
	const handleAdd = () => { setEditingShare(null); setIsCreateDialogOpen(true) }
	const handleSaveShare = (s: Share) => {
		if (editingShare) setShares(prev => prev.map(x => (x.url === editingShare.url ? s : x)))
		else setShares(prev => [...prev, s])
	}
	const handleDelete = (s: Share) => {
		if (confirm(`删除 ${s.name}？`)) setShares(prev => prev.filter(x => x.url !== s.url))
	}

	const handleSave = async () => {
		setIsSaving(true)
		try {
			const token = getAuthToken()
			if (!token) { toast.error('请先登录'); return }
			await pushShares({ shares, logoItems })
			setOriginalShares(shares); setLogoItems(new Map()); setIsEditMode(false)
			toast.success('保存成功！')
		} catch (error: any) { toast.error(`保存失败: ${error?.message||'未知错误'}`) }
		finally { setIsSaving(false) }
	}
	const handleCancel = () => { setShares(originalShares); setLogoItems(new Map()); setIsEditMode(false) }

	useEffect(() => {
		const h = (e: KeyboardEvent) => { if (!isEditMode && (e.ctrlKey||e.metaKey) && e.key===',') { e.preventDefault(); setIsEditMode(true) } }
		window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
	}, [isEditMode])

	return (<>
		<GridView shares={shares} isEditMode={isEditMode} onUpdate={handleUpdate} onDelete={handleDelete} />
		<motion.div initial={{opacity:0,scale:0.6}} animate={{opacity:1,scale:1}} className='absolute top-4 right-6 flex gap-3 max-sm:hidden'>
			{isEditMode ? (<>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleCancel} disabled={isSaving} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>取消</motion.button>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleAdd} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>添加</motion.button>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleSave} disabled={isSaving} className='brand-btn px-6'>{isSaving?'保存中...':'保存'}</motion.button>
			</>) : (<>{!hideEditButton && <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={()=>setIsEditMode(true)} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>编辑</motion.button>}</>)}
		</motion.div>
		{isCreateDialogOpen && <CreateDialog share={editingShare} onClose={()=>setIsCreateDialogOpen(false)} onSave={handleSaveShare} />}
	</>)
}

'use client'

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { DialogModal } from '@/components/dialog-modal'
import { getAuthToken } from '@/lib/auth'
import { useAuthStore } from '@/hooks/use-auth'
import { useConfigStore } from '@/app/(home)/stores/config-store'
import { pushSnippets } from './services/push-snippets'
import { apiGet } from '@/lib/api-client'
import seedSnippets from './list.json'

export default function Page() {
	const [snippets, setSnippets] = useState<string[]>([])
	const [originalSnippets, setOriginalSnippets] = useState<string[]>([])
	const [currentIndex, setCurrentIndex] = useState(0)
	const [isEditMode, setIsEditMode] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [isManageOpen, setIsManageOpen] = useState(false)
	const [draftSnippets, setDraftSnippets] = useState<string[]>([])
	const [newSnippet, setNewSnippet] = useState('')

	const { isAuth } = useAuthStore()
	const { siteContent } = useConfigStore()
	const hideEditButton = siteContent.hideEditButton ?? false

	useEffect(() => {
		apiGet<string[]>('/snippets').then(data => {
			if (Array.isArray(data) && data.length > 0) { setSnippets(data); setOriginalSnippets(data) }
			else { setSnippets(seedSnippets); setOriginalSnippets(seedSnippets) }
		}).catch(() => { setSnippets(seedSnippets); setOriginalSnippets(seedSnippets) })
	}, [])

	const currentSnippet = snippets.length > 0 ? snippets[currentIndex % snippets.length] : null

	const handleSave = async () => {
		setIsSaving(true)
		try {
			const token = getAuthToken()
			if (!token) { toast.error('请先登录'); return }
			await pushSnippets({ snippets })
			setOriginalSnippets(snippets); setIsEditMode(false)
			toast.success('保存成功！')
		} catch (error: any) { toast.error(`保存失败: ${error?.message || '未知错误'}`) }
		finally { setIsSaving(false) }
	}
	const handleCancel = () => { setSnippets(originalSnippets); setIsEditMode(false) }

	const openManageDialog = () => { setDraftSnippets(snippets); setNewSnippet(''); setIsManageOpen(true) }
	const handleAddDraft = () => {
		if (!newSnippet.trim()) { toast.error('请输入内容'); return }
		setDraftSnippets(prev => [...prev, newSnippet.trim()]); setNewSnippet('')
	}
	const handleRemoveDraft = (i: number) => { setDraftSnippets(prev => prev.filter((_,idx)=>idx!==i)) }
	const applyManageChanges = () => {
		const cleaned = draftSnippets.map(s=>s.trim()).filter(Boolean)
		setSnippets(cleaned); setIsManageOpen(false)
		toast.success('已更新列表')
	}
	const cancelManageChanges = () => { setIsManageOpen(false); setDraftSnippets([]); setNewSnippet('') }

	return (<>
		<div className='flex min-h-[70vh] flex-col items-center justify-center px-6 py-24'>
			<div className='w-full max-w-3xl text-center'>
				<p className='text-2xl leading-relaxed font-semibold'>{currentSnippet || '～'}</p>
			</div>
		</div>
		<motion.div initial={{opacity:0,scale:0.6}} animate={{opacity:1,scale:1}} className='absolute top-4 right-6 flex gap-3 max-sm:hidden'>
			{isEditMode ? (<>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleCancel} disabled={isSaving} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>取消</motion.button>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={openManageDialog} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>管理</motion.button>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleSave} disabled={isSaving} className='brand-btn px-6'>{isSaving?'保存中...':'保存'}</motion.button>
			</>) : (<>{!hideEditButton && <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={()=>setIsEditMode(true)} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>编辑</motion.button>}</>)}
		</motion.div>
		{isManageOpen && (
			<DialogModal open={isManageOpen} onClose={cancelManageChanges} className='max-h-[80vh] w-[480px] overflow-y-auto'>
				<h3 className='mb-4 text-lg font-semibold'>管理句子</h3>
				<div className='mb-4 flex gap-2'>
					<input type='text' value={newSnippet} onChange={e=>setNewSnippet(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleAddDraft()} placeholder='输入新句子...' className='flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400' />
					<button onClick={handleAddDraft} className='rounded-lg border px-3 py-2 text-sm hover:bg-gray-50'><Plus className='h-4 w-4'/></button>
				</div>
				<div className='mb-4 max-h-[40vh] space-y-2 overflow-y-auto'>
					{draftSnippets.map((s,i)=>(
						<div key={i} className='flex items-center gap-2 rounded-lg border bg-gray-50 px-3 py-2'>
							<span className='flex-1 text-sm'>{s}</span>
							<button onClick={()=>handleRemoveDraft(i)} className='text-red-400 hover:text-red-600'><X className='h-4 w-4'/></button>
						</div>
					))}
					{draftSnippets.length===0 && <p className='text-secondary text-center text-sm'>还没有句子</p>}
				</div>
				<div className='flex justify-end gap-2'>
					<button onClick={cancelManageChanges} className='rounded-lg border px-4 py-2 text-sm'>取消</button>
					<button onClick={applyManageChanges} className='brand-btn px-4 py-2 text-sm'>应用</button>
				</div>
			</DialogModal>
		)}
	</>)
}

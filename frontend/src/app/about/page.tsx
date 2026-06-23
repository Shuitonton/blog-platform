'use client'

import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { useMarkdownRender } from '@/hooks/use-markdown-render'
import { pushAbout, type AboutData } from './services/push-about'
import { getAuthToken } from '@/lib/auth'
import { useAuthStore } from '@/hooks/use-auth'
import { useConfigStore } from '@/app/(home)/stores/config-store'
import { apiGet } from '@/lib/api-client'
import LikeButton from '@/components/like-button'
import GithubSVG from '@/svgs/github.svg'

export default function Page() {
	const [data, setData] = useState<AboutData>({ title: '', description: '', content: '' })
	const [originalData, setOriginalData] = useState<AboutData>({ title: '', description: '', content: '' })
	const [isEditMode, setIsEditMode] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [isPreviewMode, setIsPreviewMode] = useState(false)

	const { isAuth } = useAuthStore()
	const { siteContent } = useConfigStore()
	const { content, loading } = useMarkdownRender(data.content)
	const hideEditButton = siteContent.hideEditButton ?? false

	useEffect(() => {
		apiGet<AboutData>('/about').then(d => {
			if (d) { setData(d); setOriginalData(d) }
		}).catch(() => {})
	}, [])

	const handleSave = async () => {
		setIsSaving(true)
		try {
			const token = getAuthToken()
			if (!token) { toast.error('请先登录'); return }
			await pushAbout(data)
			setOriginalData(data); setIsEditMode(false); setIsPreviewMode(false)
			toast.success('保存成功！')
		} catch (error: any) { toast.error(`保存失败: ${error?.message || '未知错误'}`) }
		finally { setIsSaving(false) }
	}

	const handleCancel = () => { setData(originalData); setIsEditMode(false); setIsPreviewMode(false) }
	const handleEnterEditMode = () => { setIsEditMode(true); setIsPreviewMode(false) }

	useEffect(() => {
		const h = (e: KeyboardEvent) => { if (!isEditMode && (e.ctrlKey||e.metaKey) && e.key===',') { e.preventDefault(); setIsEditMode(true) } }
		window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
	}, [isEditMode])

	return (<>
		<div className='flex flex-col items-center justify-center px-6 pt-32 pb-12 max-sm:px-0'>
			<div className='w-full max-w-[800px]'>
				{isEditMode ? (
					isPreviewMode ? (
						<div className='space-y-6'>
							<div className='text-center'><h1 className='mb-4 text-4xl font-bold'>{data.title||'标题预览'}</h1><p className='text-secondary text-lg'>{data.description||'描述预览'}</p></div>
							{loading ? <div className='text-secondary text-center'>预览中...</div> : <div className='card relative p-6'><div className='prose prose-sm max-w-none'>{content}</div></div>}
						</div>
					) : (
						<div className='space-y-6'>
							<div className='space-y-4'>
								<input type='text' placeholder='标题' className='w-full px-4 py-3 text-center text-2xl font-bold' value={data.title} onChange={e=>setData({...data,title:e.target.value})} />
								<input type='text' placeholder='描述' className='w-full px-4 py-3 text-center text-lg text-secondary' value={data.description} onChange={e=>setData({...data,description:e.target.value})} />
							</div>
							<div className='rounded-lg border'><textarea className='w-full min-h-[300px] p-4 resize-y bg-transparent outline-none font-mono text-sm' value={data.content} onChange={e=>setData({...data,content:e.target.value})} placeholder='Markdown content...' /></div>
						</div>
					)
				) : (<>
					<div className='text-center mb-8'><h1 className='mb-4 text-4xl font-bold'>{data.title}</h1><p className='text-secondary text-lg'>{data.description}</p></div>
					{loading ? <div className='text-secondary text-center'>加载中...</div> : <div className='card relative p-6'><div className='prose prose-sm max-w-none'>{content}</div></div>}
				</>)}
			</div>
		</div>
		<motion.div initial={{opacity:0,scale:0.6}} animate={{opacity:1,scale:1}} className='absolute top-4 right-6 flex gap-3 max-sm:hidden'>
			{isEditMode ? (<>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleCancel} disabled={isSaving} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>取消</motion.button>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={()=>setIsPreviewMode(!isPreviewMode)} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>{isPreviewMode?'编辑':'预览'}</motion.button>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleSave} disabled={isSaving} className='brand-btn px-6'>{isSaving?'保存中...':'保存'}</motion.button>
			</>) : (<>{!hideEditButton && <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleEnterEditMode} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>编辑</motion.button>}</>)}
		</motion.div>
	</>)
}

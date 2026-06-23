'use client'

import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { DialogModal } from '@/components/dialog-modal'
import { getAuthToken } from '@/lib/auth'
import { pushPictures } from './services/push-pictures'
import { useAuthStore } from '@/hooks/use-auth'
import { useConfigStore } from '@/app/(home)/stores/config-store'
import { RandomLayout } from './components/random-layout'
import UploadDialog from './components/upload-dialog'
import { apiGet } from '@/lib/api-client'
import type { ImageItem } from '../projects/components/image-upload-dialog'
import { useRouter } from 'next/navigation'
import seedPictures from './list.json'

export interface Picture {
	id: string
	uploadedAt: string
	description?: string
	image?: string
	images?: string[]
}

export default function Page() {
	const [pictures, setPictures] = useState<Picture[]>([])
	const [originalPictures, setOriginalPictures] = useState<Picture[]>([])
	const [isEditMode, setIsEditMode] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
	const [imageItems, setImageItems] = useState<Map<string, ImageItem>>(new Map())
	const router = useRouter()

	const { isAuth } = useAuthStore()
	const { siteContent } = useConfigStore()
	const hideEditButton = siteContent.hideEditButton ?? false

	// 从后端加载图床数据
	useEffect(() => {
		apiGet<Picture[]>('/pictures').then(data => {
			if (Array.isArray(data) && data.length > 0) {
				setPictures(data)
				setOriginalPictures(data)
			} else {
				setPictures(seedPictures as Picture[])
				setOriginalPictures(seedPictures as Picture[])
			}
		}).catch(() => {
			setPictures(seedPictures as Picture[])
			setOriginalPictures(seedPictures as Picture[])
		})
	}, [])

	const handleUploadSubmit = ({ images, description }: { images: ImageItem[]; description: string }) => {
		const now = new Date().toISOString()
		if (images.length === 0) { toast.error('请至少选择一张图片'); return }
		const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
		const desc = description.trim() || undefined
		const imageUrls = images.map(imageItem => (imageItem.type === 'url' ? imageItem.url : imageItem.previewUrl))
		setPictures(prev => [...prev, { id, uploadedAt: now, description: desc, images: imageUrls }])
		const newMap = new Map(imageItems)
		images.forEach((imageItem, index) => {
			if (imageItem.type === 'file') newMap.set(`${id}::${index}`, imageItem)
		})
		setImageItems(newMap)
		setIsUploadDialogOpen(false)
	}

	const handleDeleteSingleImage = (pictureId: string, imageIndex: number | 'single') => {
		setPictures(prev => prev.map(p => {
			if (p.id !== pictureId) return p
			if (imageIndex === 'single' || !p.images || p.images.length <= 1) return null
			return { ...p, images: p.images.filter((_, i) => i !== imageIndex) }
		}).filter(Boolean) as Picture[])
	}

	const handleDeleteGroup = (pictureId: string) => {
		setPictures(prev => prev.filter(p => p.id !== pictureId))
	}

	const handleSave = async () => {
		setIsSaving(true)
		try {
			const token = getAuthToken()
			if (!token) { toast.error('请先登录'); return }
			await pushPictures({ pictures, imageItems })
			setOriginalPictures(pictures)
			setImageItems(new Map())
			setIsEditMode(false)
			toast.success('保存成功！')
		} catch (error: any) {
			console.error('Failed to save:', error)
			toast.error(`保存失败: ${error?.message || '未知错误'}`)
		} finally {
			setIsSaving(false)
		}
	}

	const handleCancel = () => {
		setPictures(originalPictures)
		setImageItems(new Map())
		setIsEditMode(false)
	}

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isEditMode && (e.ctrlKey || e.metaKey) && e.key === ',') {
				e.preventDefault()
				setIsEditMode(true)
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [isEditMode])

	return (
		<>
			<RandomLayout pictures={pictures} isEditMode={isEditMode} onDeleteSingle={handleDeleteSingleImage} onDeleteGroup={handleDeleteGroup} />
			{pictures.length === 0 && (
				<div className='text-secondary flex min-h-screen items-center justify-center text-center text-sm'>
					还没有上传图片，点击右上角「编辑」后即可开始上传。
				</div>
			)}
			<motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} className='absolute top-4 right-6 flex gap-3 max-sm:hidden'>
				{isEditMode ? (
					<>
						<motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => router.push('/image-toolbox')} className='rounded-xl border bg-blue-50 px-4 py-2 text-sm text-blue-700'>
							压缩工具
						</motion.button>
						<motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleCancel} disabled={isSaving} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>
							取消
						</motion.button>
						<motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setIsUploadDialogOpen(true)} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>
							上传
						</motion.button>
						<motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleSave} disabled={isSaving} className='brand-btn px-6'>
							{isSaving ? '保存中...' : '保存'}
						</motion.button>
					</>
				) : (
					<>{!hideEditButton && (
						<motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setIsEditMode(true)} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>
							编辑
						</motion.button>
					)}</>
				)}
			</motion.div>
			{isUploadDialogOpen && <UploadDialog onClose={() => setIsUploadDialogOpen(false)} onSubmit={handleUploadSubmit} />}
		</>
	)
}

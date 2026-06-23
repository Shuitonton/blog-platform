'use client'

import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { DialogModal } from '@/components/dialog-modal'
import { useAuthStore } from '@/hooks/use-auth'
import { useConfigStore } from '../stores/config-store'
import { pushSiteContent } from '../services/push-site-content'
import { authenticate } from '@/lib/auth'
import type { SiteContent, CardStyles } from '../stores/config-store'
import { SiteSettings, type FileItem, type ArtImageUploads, type BackgroundImageUploads, type SocialButtonImageUploads } from './site-settings'
import { ColorConfig } from './color-config'
import { HomeLayout } from './home-layout'

interface ConfigDialogProps {
	open: boolean
	onClose: () => void
}

type TabType = 'site' | 'color' | 'layout'

export default function ConfigDialog({ open, onClose }: ConfigDialogProps) {
	const { isAuth, setAuth } = useAuthStore()
	const { siteContent, setSiteContent, cardStyles, setCardStyles, regenerateBubbles } = useConfigStore()
	const [formData, setFormData] = useState<SiteContent>(siteContent)
	const [cardStylesData, setCardStylesData] = useState<CardStyles>(cardStyles)
	const [originalData, setOriginalData] = useState<SiteContent>(siteContent)
	const [originalCardStyles, setOriginalCardStyles] = useState<CardStyles>(cardStyles)
	const [isSaving, setIsSaving] = useState(false)
	const [activeTab, setActiveTab] = useState<TabType>('site')
	const [showPwdDialog, setShowPwdDialog] = useState(false)
	const [pwdInput, setPwdInput] = useState('')
	const [faviconItem, setFaviconItem] = useState<FileItem | null>(null)
	const [avatarItem, setAvatarItem] = useState<FileItem | null>(null)
	const [artImageUploads, setArtImageUploads] = useState<ArtImageUploads>({})
	const [backgroundImageUploads, setBackgroundImageUploads] = useState<BackgroundImageUploads>({})
	const [socialButtonImageUploads, setSocialButtonImageUploads] = useState<SocialButtonImageUploads>({})

	useEffect(() => {
		if (open) {
			const current = { ...siteContent }
			const currentCardStyles = { ...cardStyles }
			setFormData(current)
			setCardStylesData(currentCardStyles)
			setOriginalData(current)
			setOriginalCardStyles(currentCardStyles)
			setFaviconItem(null)
			setAvatarItem(null)
			setArtImageUploads({})
			setBackgroundImageUploads({})
			setSocialButtonImageUploads({})
			setActiveTab('site')
			setShowPwdDialog(false)
			setPwdInput('')
		}
	}, [open, siteContent, cardStyles])

	useEffect(() => {
		return () => {
			if (faviconItem?.type === 'file') URL.revokeObjectURL(faviconItem.previewUrl)
			if (avatarItem?.type === 'file') URL.revokeObjectURL(avatarItem.previewUrl)
			for (const item of Object.values(artImageUploads)) {
				if (item.type === 'file') URL.revokeObjectURL(item.previewUrl)
			}
			for (const item of Object.values(backgroundImageUploads)) {
				if (item.type === 'file') URL.revokeObjectURL(item.previewUrl)
			}
			for (const item of Object.values(socialButtonImageUploads)) {
				if (item.type === 'file') URL.revokeObjectURL(item.previewUrl)
			}
		}
	}, [faviconItem, avatarItem, artImageUploads, backgroundImageUploads, socialButtonImageUploads])

	// Password dialog — login first, THEN save.
	// The login doesn't call handleSave directly because we want
	// isAuth to update via zustand, then user clicks "保存" again.
	const handlePwdSubmit = async () => {
		if (!pwdInput.trim()) return
		try {
			setIsSaving(true)
			const token = await authenticate(pwdInput.trim())
			setAuth(token)
			setShowPwdDialog(false)
			setPwdInput('')
			toast.success('登录成功！请再次点击保存')
		} catch (err: any) {
			toast.error(err?.message || '密码错误')
		} finally {
			setIsSaving(false)
		}
	}

	const handleSaveClick = () => {
		if (!isAuth) {
			setShowPwdDialog(true)
		} else {
			handleSave()
		}
	}

	const handleSave = async () => {
		setIsSaving(true)
		try {
			const originalArtImages = originalData.artImages ?? []
			const currentArtImages = formData.artImages ?? []
			const removedArtImages = originalArtImages.filter(orig => !currentArtImages.some(current => current.id === orig.id))

			const originalBackgroundImages = originalData.backgroundImages ?? []
			const currentBackgroundImages = formData.backgroundImages ?? []
			const removedBackgroundImages = originalBackgroundImages.filter(orig => !currentBackgroundImages.some(current => current.id === orig.id))

			await pushSiteContent(
				formData, cardStylesData,
				faviconItem, avatarItem,
				artImageUploads, removedArtImages,
				backgroundImageUploads, removedBackgroundImages,
				socialButtonImageUploads,
			)
			setSiteContent(formData)
			setCardStyles(cardStylesData)
			updateThemeVariables(formData.theme)
			setFaviconItem(null)
			setAvatarItem(null)
			setArtImageUploads({})
			setBackgroundImageUploads({})
			setSocialButtonImageUploads({})
			onClose()
		} catch (error: any) {
			console.error('Failed to save:', error)
			toast.error(`保存失败: ${error?.message || '未知错误'}`)
		} finally {
			setIsSaving(false)
		}
	}

	const handleCancel = () => {
		if (faviconItem?.type === 'file') URL.revokeObjectURL(faviconItem.previewUrl)
		if (avatarItem?.type === 'file') URL.revokeObjectURL(avatarItem.previewUrl)
		for (const item of Object.values(artImageUploads)) {
			if (item.type === 'file') URL.revokeObjectURL(item.previewUrl)
		}
		for (const item of Object.values(backgroundImageUploads)) {
			if (item.type === 'file') URL.revokeObjectURL(item.previewUrl)
		}
		for (const item of Object.values(socialButtonImageUploads)) {
			if (item.type === 'file') URL.revokeObjectURL(item.previewUrl)
		}
		setSiteContent(originalData)
		setCardStyles(originalCardStyles)
		regenerateBubbles()
		if (typeof document !== 'undefined') {
			document.title = originalData.meta.title
			const metaDescription = document.querySelector('meta[name="description"]')
			if (metaDescription) metaDescription.setAttribute('content', originalData.meta.description)
		}
		updateThemeVariables(originalData.theme)
		setFaviconItem(null)
		setAvatarItem(null)
		setArtImageUploads({})
		setBackgroundImageUploads({})
		setSocialButtonImageUploads({})
		onClose()
	}

	const updateThemeVariables = (theme?: SiteContent['theme']) => {
		if (typeof document === 'undefined' || !theme) return
		const root = document.documentElement
		const vars: Record<string, string | undefined> = {
			'--color-brand': theme.colorBrand,
			'--color-brand-secondary': theme.colorBrandSecondary,
			'--color-primary': theme.colorPrimary,
			'--color-secondary': theme.colorSecondary,
			'--color-bg': theme.colorBg,
			'--color-border': theme.colorBorder,
			'--color-card': theme.colorCard,
			'--color-article': theme.colorArticle,
		}
		for (const [key, val] of Object.entries(vars)) {
			if (val) root.style.setProperty(key, val)
		}
	}

	const handlePreview = () => {
		setSiteContent(formData)
		setCardStyles(cardStylesData)
		regenerateBubbles()
		if (typeof document !== 'undefined') {
			document.title = formData.meta.title
			const metaDescription = document.querySelector('meta[name="description"]')
			if (metaDescription) metaDescription.setAttribute('content', formData.meta.description)
		}
		updateThemeVariables(formData.theme)
		onClose()
	}

	const buttonText = isAuth ? '保存' : '登录保存'

	const tabs: { id: TabType; label: string }[] = [
		{ id: 'site', label: '网站设置' },
		{ id: 'color', label: '色彩配置' },
		{ id: 'layout', label: '首页布局' },
	]

	return (
		<>
			{showPwdDialog && (
				<div className='fixed inset-0 z-[60] flex items-center justify-center bg-black/40' onClick={() => setShowPwdDialog(false)}>
					<div className='bg-card rounded-2xl border p-6 shadow-xl' onClick={e => e.stopPropagation()}>
						<h3 className='mb-3 text-lg font-semibold'>请输入管理密码</h3>
						<input
							type='password'
							value={pwdInput}
							onChange={e => setPwdInput(e.target.value)}
							onKeyDown={e => e.key === 'Enter' && handlePwdSubmit()}
							placeholder='输入密码...'
							autoFocus
							className='mb-3 w-full rounded-lg border bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400'
						/>
						<div className='flex justify-end gap-2'>
							<button onClick={() => setShowPwdDialog(false)} className='rounded-lg border px-4 py-2 text-sm'>取消</button>
							<button onClick={handlePwdSubmit} disabled={isSaving || !pwdInput.trim()} className='brand-btn rounded-lg px-4 py-2 text-sm'>
								{isSaving ? '验证中...' : '确认'}
							</button>
						</div>
					</div>
				</div>
			)}

			<DialogModal open={open} onClose={handleCancel} className='card scrollbar-none max-h-[90vh] min-h-[600px] w-[640px] overflow-y-auto'>
				<div className='mb-6 flex items-center justify-between'>
					<div className='flex gap-1'>
						{tabs.map(tab => (
							<button key={tab.id} onClick={() => setActiveTab(tab.id)}
								className={`relative px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab.id ? 'text-brand' : 'text-secondary hover:text-primary'}`}>
								{tab.label}
								{activeTab === tab.id && <div className='bg-brand absolute right-0 bottom-0 left-0 h-0.5' />}
							</button>
						))}
					</div>
					<div className='flex gap-3'>
						<motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handlePreview} className='bg-card rounded-xl border px-6 py-2 text-sm'>预览</motion.button>
						<motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleCancel} disabled={isSaving} className='bg-card rounded-xl border px-6 py-2 text-sm'>取消</motion.button>
						<motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleSaveClick} disabled={isSaving} className='brand-btn px-6'>
							{isSaving ? '保存中...' : buttonText}
						</motion.button>
					</div>
				</div>

				<div className='min-h-[200px]'>
					{activeTab === 'site' && (
						<SiteSettings
							formData={formData} setFormData={setFormData}
							faviconItem={faviconItem} setFaviconItem={setFaviconItem}
							avatarItem={avatarItem} setAvatarItem={setAvatarItem}
							artImageUploads={artImageUploads} setArtImageUploads={setArtImageUploads}
							backgroundImageUploads={backgroundImageUploads} setBackgroundImageUploads={setBackgroundImageUploads}
							socialButtonImageUploads={socialButtonImageUploads} setSocialButtonImageUploads={setSocialButtonImageUploads}
						/>
					)}
					{activeTab === 'color' && <ColorConfig formData={formData} setFormData={setFormData} />}
					{activeTab === 'layout' && <HomeLayout cardStylesData={cardStylesData} setCardStylesData={setCardStylesData} onClose={onClose} />}
				</div>
			</DialogModal>
		</>
	)
}

import { apiPost, apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import { toast } from 'sonner'
import type { SiteContent, CardStyles } from '../stores/config-store'
import type { FileItem, ArtImageUploads, SocialButtonImageUploads, BackgroundImageUploads } from '../config-dialog/site-settings'

type ArtImageConfig = SiteContent['artImages'][number]
type BackgroundImageConfig = SiteContent['backgroundImages'][number]

/**
 * 保存站点配置 —— 逐项上传文件和写入 JSON 配置。
 */
export async function pushSiteContent(
	siteContent: SiteContent,
	cardStyles: CardStyles,
	faviconItem?: FileItem | null,
	avatarItem?: FileItem | null,
	artImageUploads?: ArtImageUploads,
	removedArtImages?: ArtImageConfig[],
	backgroundImageUploads?: BackgroundImageUploads,
	removedBackgroundImages?: BackgroundImageConfig[],
	socialButtonImageUploads?: SocialButtonImageUploads
): Promise<void> {
	const token = getAuthToken()
	if (!token) throw new Error('请先认证')

	// 上传各类图片
	const uploadFile = async (fieldName: string, file: File): Promise<string | null> => {
		const formData = new FormData()
		formData.append('file', file)
		toast.info(`正在上传 ${fieldName}...`)
		const result = await apiPost<{ url: string }>('/upload', formData)
		return result.url
	}

	// Favicon — upload and apply URL to siteContent
	if (faviconItem?.type === 'file') {
		const url = await uploadFile('Favicon', faviconItem.file)
		if (url) {
			;(siteContent as any).favicon = url
		}
	}

	// Avatar — upload and apply URL to siteContent
	if (avatarItem?.type === 'file') {
		const url = await uploadFile('Avatar', avatarItem.file)
		if (url) {
			;(siteContent as any).avatar = url
		}
	}

	// Art images
	if (artImageUploads) {
		for (const [id, item] of Object.entries(artImageUploads)) {
			if (item.type === 'file') {
				const url = await uploadFile(`Art 图片 ${id}`, item.file)
				const artConfig = siteContent.artImages?.find(art => art.id === id)
				if (artConfig && url) {
					artConfig.url = url
				}
			}
		}
	}

	// Background images
	if (backgroundImageUploads) {
		for (const [id, item] of Object.entries(backgroundImageUploads)) {
			if (item.type === 'file') {
				const bgConfig = siteContent.backgroundImages?.find(bg => bg.id === id)
				if (bgConfig && bgConfig.url.startsWith('/images/background/')) {
					const url = await uploadFile(`背景图片 ${id}`, item.file)
					if (url) bgConfig.url = url
				}
			}
		}
	}

	// Social button images
	if (socialButtonImageUploads) {
		for (const [buttonId, item] of Object.entries(socialButtonImageUploads)) {
			if (item.type === 'file') {
				const button = siteContent.socialButtons?.find(btn => btn.id === buttonId)
				if (button && button.value.startsWith('/images/social-buttons/')) {
					const url = await uploadFile(`社交图标 ${buttonId}`, item.file)
					if (url) button.value = url
				}
			}
		}
	}

	// 保存 JSON 配置
	toast.info('正在保存站点配置...')
	await apiPut('/site-config', siteContent)
	await apiPut('/card-styles', cardStyles)

	toast.success('保存成功！')
}

import { apiPost, apiPut } from '@/lib/api-client'
import { getAuthToken } from '@/lib/auth'
import { toast } from 'sonner'
import { formatDateTimeLocal } from '../stores/write-store'
import type { ImageItem } from '../types'

export type PushBlogParams = {
	form: {
		slug: string
		title: string
		md: string
		tags: string[]
		date?: string
		summary?: string
		hidden?: boolean
		category?: string
	}
	cover?: ImageItem | null
	images?: ImageItem[]
	mode?: 'create' | 'edit'
	originalSlug?: string | null
}

export async function pushBlog(params: PushBlogParams): Promise<void> {
	const { form, cover, images, mode = 'create', originalSlug } = params

	if (!form?.slug) throw new Error('需要 slug')
	if (mode === 'edit' && originalSlug && originalSlug !== form.slug) {
		throw new Error('编辑模式下不支持修改 slug，请保持原 slug 不变')
	}

	const token = getAuthToken()
	if (!token) throw new Error('请先认证（输入密码）')

	// Step 1: 上传图片（逐个上传，获取 URL）
	let mdToUpload = form.md
	const uploadedURLs = new Map<string, string>() // id → public URL

	const collectFileImages = (): Array<{ id: string; file: File }> => {
		const result: Array<{ id: string; file: File }> = []
		if (images) {
			for (const img of images) {
				if (img.type === 'file') result.push({ id: img.id, file: img.file })
			}
		}
		if (cover?.type === 'file') result.push({ id: cover.id, file: cover.file })
		return result
	}

	const localImages = collectFileImages()
	if (localImages.length > 0) {
		toast.info(`正在上传 ${localImages.length} 张图片...`)
		for (const { id, file } of localImages) {
			try {
				const uploadForm = new FormData()
				uploadForm.append('file', file)
				const result = await apiPost<{ url: string; hash: string }>('/upload', uploadForm)
				uploadedURLs.set(id, result.url)
			} catch (err: any) {
				throw new Error(`图片上传失败 (${file.name}): ${err?.message || err}`)
			}
		}

		// 替换 markdown 中的 local-image 占位符
		for (const [id, publicPath] of uploadedURLs) {
			const placeholder = `local-image:${id}`
			mdToUpload = mdToUpload.split(`(${placeholder})`).join(`(${publicPath})`)
		}
	}

	// Step 2: 发送博客内容到后端
	const formData = new FormData()
	formData.append('slug', form.slug)
	formData.append('title', form.title)
	formData.append('content', mdToUpload)
	formData.append('date', form.date || formatDateTimeLocal())
	formData.append('summary', form.summary || '')
	formData.append('hidden', String(!!form.hidden))
	formData.append('category', form.category || '')
	formData.append('tags', (form.tags || []).join(','))

	// 封面图 URL
	if (cover?.type === 'url') {
		formData.append('cover_url', cover.url)
	} else if (cover?.type === 'file') {
		formData.append('cover_url', uploadedURLs.get(cover.id) || '')
	}

	toast.info(mode === 'edit' ? '正在更新文章...' : '正在发布文章...')

	if (mode === 'edit') {
		await apiPut(`/blogs/${encodeURIComponent(form.slug)}`, formData)
	} else {
		await apiPost('/blogs', formData)
	}

	toast.success('发布成功！')
}

import { apiPost, apiPut } from '@/lib/api-client'
import { hashFileSHA256 } from '@/lib/file-utils'
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

	// 构建 FormData
	const formData = new FormData()
	formData.append('slug', form.slug)
	formData.append('title', form.title)
	formData.append('content', form.md)
	formData.append('date', form.date || formatDateTimeLocal())
	formData.append('summary', form.summary || '')
	formData.append('hidden', String(!!form.hidden))
	formData.append('category', form.category || '')
	formData.append('tags', (form.tags || []).join(','))

	// 封面图
	if (cover?.type === 'file') {
		formData.append('cover', cover.file)
	} else if (cover?.type === 'url') {
		formData.append('cover_url', cover.url)
	}

	// 正文图片
	if (images && images.length > 0) {
		const pending: Promise<void>[] = []

		for (const img of images) {
			if (img.type === 'file') {
				// 先上传图片到后端
				pending.push(
					(async () => {
						const uploadForm = new FormData()
						uploadForm.append('file', img.file)
						const result = await apiPost<{ url: string; hash: string }>('/upload', uploadForm)
						const publicPath = result.url
						// 替换 markdown 中的 local-image 占位符
						const placeholder = `local-image:${img.id}`
						formData.set('content', formData.get('content')!.toString().split(`(${placeholder})`).join(`(${publicPath})`))
					})()
				)
			} else if (img.type === 'url') {
				// 外部 URL 不需要上传
			}
		}

		await Promise.all(pending)
	}

	toast.info(mode === 'edit' ? '正在更新文章...' : '正在发布文章...')

	if (mode === 'edit') {
		await apiPut(`/blogs/${encodeURIComponent(form.slug)}`, formData)
	} else {
		await apiPost('/blogs', formData)
	}

	toast.success('发布成功！')
}

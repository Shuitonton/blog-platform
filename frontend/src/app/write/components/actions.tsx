import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useWriteStore } from '../stores/write-store'
import { usePreviewStore } from '../stores/preview-store'
import { usePublish } from '../hooks/use-publish'
import { useAuthStore } from '@/hooks/use-auth'
import { authenticate } from '@/lib/auth'

export function WriteActions() {
	const { loading, mode, form, loadBlogForEdit, originalSlug, updateForm } = useWriteStore()
	const { openPreview } = usePreviewStore()
	const { isAuth, onPublish, onDelete } = usePublish()
	const { setAuth } = useAuthStore()
	const [saving, setSaving] = useState(false)
	const [showPwdDialog, setShowPwdDialog] = useState(false)
	const [pwdInput, setPwdInput] = useState('')
	const mdInputRef = useRef<HTMLInputElement>(null)
	const router = useRouter()

	const handleImportOrPublish = () => {
		if (!isAuth) {
			setShowPwdDialog(true)
		} else {
			onPublish()
		}
	}

	const handlePwdSubmit = async () => {
		if (!pwdInput.trim()) return
		try {
			setSaving(true)
			const token = await authenticate(pwdInput.trim())
			setAuth(token)
			setShowPwdDialog(false)
			setPwdInput('')
			toast.success('认证成功')
		} catch (err: any) {
			toast.error(err?.message || '密码错误')
		} finally {
			setSaving(false)
		}
	}

	const handleCancel = () => {
		if (!window.confirm('放弃本次修改吗？')) {
			return
		}
		if (mode === 'edit' && originalSlug) {
			router.push(`/blog/${originalSlug}`)
		} else {
			router.push('/')
		}
	}

	const buttonText = isAuth ? (mode === 'edit' ? '更新' : '发布') : '登录发布'

	const handleDelete = () => {
		if (!isAuth) {
			toast.info('请先登录')
			return
		}
		const confirmMsg = form?.title ? `确定删除《${form.title}》吗？该操作不可恢复。` : '确定删除当前文章吗？该操作不可恢复。'
		if (window.confirm(confirmMsg)) {
			onDelete()
		}
	}

	const handleImportMd = () => {
		mdInputRef.current?.click()
	}

	const handleMdFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		try {
			const text = await file.text()
			updateForm({ md: text })
			toast.success('已导入 Markdown 文件')
		} catch (error) {
			toast.error('导入失败，请重试')
		} finally {
			if (e.currentTarget) e.currentTarget.value = ''
		}
	}

	return (
		<>
			{/* 密码登录对话框 */}
			{showPwdDialog && (
				<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40' onClick={() => setShowPwdDialog(false)}>
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
							<button
								onClick={() => setShowPwdDialog(false)}
								className='rounded-lg border px-4 py-2 text-sm'>
								取消
							</button>
							<button
								onClick={handlePwdSubmit}
								disabled={saving || !pwdInput.trim()}
								className='brand-btn rounded-lg px-4 py-2 text-sm'>
								{saving ? '验证中...' : '确认'}
							</button>
						</div>
					</div>
				</div>
			)}

			<input ref={mdInputRef} type='file' accept='.md' className='hidden' onChange={handleMdFileChange} />

			<ul className='absolute top-4 right-6 flex items-center gap-2'>
				{mode === 'edit' && (
					<>
						<motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} className='flex items-center gap-2'>
							<div className='rounded-lg border bg-blue-50 px-4 py-2 text-sm text-blue-700'>编辑模式</div>
						</motion.div>

						<motion.button
							initial={{ opacity: 0, scale: 0.6 }}
							animate={{ opacity: 1, scale: 1 }}
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							className='rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-100'
							disabled={loading}
							onClick={handleDelete}>
							删除
						</motion.button>

						<motion.button
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							onClick={handleCancel}
							disabled={saving}
							className='bg-card rounded-xl border px-4 py-2 text-sm'>
							取消
						</motion.button>
					</>
				)}

				<motion.button
					initial={{ opacity: 0, scale: 0.6 }}
					animate={{ opacity: 1, scale: 1 }}
					whileHover={{ scale: 1.05 }}
					whileTap={{ scale: 0.95 }}
					className='bg-card rounded-xl border px-4 py-2 text-sm'
					disabled={loading}
					onClick={handleImportMd}>
					导入 MD
				</motion.button>
				<motion.button
					initial={{ opacity: 0, scale: 0.6 }}
					animate={{ opacity: 1, scale: 1 }}
					whileHover={{ scale: 1.05 }}
					whileTap={{ scale: 0.95 }}
					className='bg-card rounded-xl border px-6 py-2 text-sm'
					disabled={loading}
					onClick={openPreview}>
					预览
				</motion.button>
				<motion.button
					initial={{ opacity: 0, scale: 0.6 }}
					animate={{ opacity: 1, scale: 1 }}
					whileHover={{ scale: 1.05 }}
					whileTap={{ scale: 0.95 }}
					className='brand-btn px-6'
					disabled={loading}
					onClick={handleImportOrPublish}>
					{buttonText}
				</motion.button>
			</ul>
		</>
	)
}

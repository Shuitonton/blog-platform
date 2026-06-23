'use client'

import Link from 'next/link'
import dayjs from 'dayjs'
import weekOfYear from 'dayjs/plugin/weekOfYear'
import { motion } from 'motion/react'

dayjs.extend(weekOfYear)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { INIT_DELAY } from '@/consts'
import ShortLineSVG from '@/svgs/short-line.svg'
import { useBlogIndex, type BlogIndexItem } from '@/hooks/use-blog-index'
import { useCategories } from '@/hooks/use-categories'
import { getAuthToken } from '@/lib/auth'
import { useReadArticles } from '@/hooks/use-read-articles'
import { useAuthStore } from '@/hooks/use-auth'
import { useConfigStore } from '@/app/(home)/stores/config-store'
import { saveBlogEdits } from './services/save-blog-edits'
import { batchDeleteBlogs } from './services/batch-delete-blogs'
import { CategoryModal } from './components/category-modal'
import { BlogCoverHoverPreview, useBlogCoverHover } from './components/blog-cover-hover'
import { cn } from '@/lib/utils'
import JuejinSVG from '@/svgs/juejin.svg'
import { Check } from 'lucide-react'

type DisplayMode = 'day' | 'week' | 'month' | 'year' | 'category'

export default function BlogPage() {
	const { items, loading } = useBlogIndex()
	const { categories: categoriesFromServer } = useCategories()
	const { isRead } = useReadArticles()
	const { isAuth } = useAuthStore()
	const { siteContent } = useConfigStore()
	const hideEditButton = siteContent.hideEditButton ?? false
	const enableCategories = siteContent.enableCategories ?? false

	const [editMode, setEditMode] = useState(false)
	const [editableItems, setEditableItems] = useState<BlogIndexItem[]>([])
	const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())
	const [saving, setSaving] = useState(false)
	const [displayMode, setDisplayMode] = useState<DisplayMode>('year')
	const [categoryModalOpen, setCategoryModalOpen] = useState(false)
	const [categoryList, setCategoryList] = useState<string[]>([])
	const [newCategory, setNewCategory] = useState('')

	const { cancelCoverPreview, onCoverLinkMouseEnter, hoverCoverPreview, mousePosition } = useBlogCoverHover(editMode)

	useEffect(() => { if (!editMode) setEditableItems(items) }, [items, editMode])
	useEffect(() => { setCategoryList(categoriesFromServer || []) }, [categoriesFromServer])

	const displayItems = editMode ? editableItems : items

	const { groupedItems, groupKeys } = useMemo(() => {
		const sorted = [...displayItems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
		const grouped: Record<string, { items: BlogIndexItem[] }> = {}
		for (const item of sorted) {
			let key: string
			const d = dayjs(item.date)
			switch (displayMode) {
				case 'category': key = item.category || '未分类'; break
				case 'day': key = d.format('YYYY-MM-DD'); break
				case 'week': key = `${d.year()}-W${String(d.week()).padStart(2,'0')}`; break
				case 'month': key = d.format('YYYY-MM'); break
				default: key = d.format('YYYY')
			}
			if (!grouped[key]) grouped[key] = { items: [] }
			grouped[key].items.push(item)
		}
		const keys = Object.keys(grouped).sort((a,b) => b.localeCompare(a))
		return { groupedItems: grouped, groupKeys: keys }
	}, [displayItems, displayMode])

	const selectedCount = selectedSlugs.size

	const toggleEditMode = useCallback(() => {
		if (!editMode) { setEditableItems(items); setSelectedSlugs(new Set()) }
		setEditMode(v => !v)
	}, [editMode, items])

	const handleItemClick = useCallback((e: React.MouseEvent, slug: string) => {
		if (!editMode) return
		e.preventDefault()
		setSelectedSlugs(prev => { const s = new Set(prev); if (s.has(slug)) s.delete(slug); else s.add(slug); return s })
	}, [editMode])

	const handleSelectAll = () => setSelectedSlugs(new Set(editableItems.map(i => i.slug)))
	const handleDeselectAll = () => setSelectedSlugs(new Set())

	const handleDeleteSelected = useCallback(async () => {
		if (selectedCount === 0) return
		if (!confirm(`删除 ${selectedCount} 篇文章？`)) return
		setSaving(true)
		try {
			const token = getAuthToken()
			if (!token) { toast.error('请先登录'); return }
			const slugs = Array.from(selectedSlugs)
			await batchDeleteBlogs(slugs)
			setEditMode(false); setSelectedSlugs(new Set())
			toast.success(`已删除 ${slugs.length} 篇`)
		} catch (err: any) { toast.error(err?.message || '删除失败') }
		finally { setSaving(false) }
	}, [selectedCount, selectedSlugs, editableItems])

	const handleSave = useCallback(async () => {
		setSaving(true)
		try {
			const token = getAuthToken()
			if (!token) { toast.error('请先登录'); return }
			await saveBlogEdits(items, editableItems, categoryList)
			setEditMode(false); setSelectedSlugs(new Set())
		} catch (err: any) { toast.error(err?.message || '保存失败') }
		finally { setSaving(false) }
	}, [items, editableItems, categoryList])

	const handleSaveClick = useCallback(() => {
		if (!isAuth) { toast.info('请先在写文章页面登录'); return }
		void handleSave()
	}, [handleSave, isAuth])

	const handleCancel = useCallback(() => {
		setEditableItems(items); setSelectedSlugs(new Set()); setEditMode(false)
		setCategoryList(categoriesFromServer || [])
	}, [items, categoriesFromServer])

	useEffect(() => {
		const h = (e: KeyboardEvent) => { if (!editMode && (e.ctrlKey||e.metaKey) && e.key===',') { e.preventDefault(); toggleEditMode() } }
		window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
	}, [editMode, toggleEditMode])

	const handleAddCategory = useCallback(() => {
		const c = newCategory.trim()
		if (!c) { toast.info('请输入分类名'); return }
		if (categoryList.includes(c)) { toast.info('分类名已存在'); return }
		setCategoryList(prev => [...prev, c]); setNewCategory('')
	}, [newCategory, categoryList])
	const handleRemoveCategory = useCallback((cat: string) => {
		setCategoryList(prev => prev.filter(c => c !== cat))
		setEditableItems(prev => prev.map(it => it.category === cat ? { ...it, category: '' } : it))
	}, [])
	const handleReorderCategories = useCallback((next: string[]) => { setCategoryList(next) }, [])
	const handleAssignCategory = useCallback((slug: string, cat?: string) => {
		setEditableItems(prev => prev.map(it => it.slug === slug ? { ...it, category: cat || '' } : it))
	}, [])

	const buttonText = '保存'

	return (<>
		<div className='flex flex-col items-center justify-center gap-6 px-6 pt-24 max-sm:pt-24'>
			{items.length > 0 && (
				<motion.div initial={{opacity:0,scale:0.6}} animate={{opacity:1,scale:1}} className='card btn-rounded relative mx-auto flex items-center gap-1 p-1 max-sm:hidden'>
					{['day','week','month','year',...(enableCategories?['category']:[])].map(option => (
						<motion.button key={option} whileHover={{scale:1.05}} whileTap={{scale:0.95}}
							onClick={()=>setDisplayMode(option as DisplayMode)}
							className={cn('btn-rounded px-3 py-1.5 text-xs font-medium transition-all', displayMode===option?'bg-brand text-white shadow-sm':'text-secondary hover:text-brand hover:bg-white/60')}>
							{option==='day'?'日':option==='week'?'周':option==='month'?'月':option==='year'?'年':'分类'}
						</motion.button>
					))}
				</motion.div>
			)}

			{groupKeys.map(groupKey => {
				const group = groupedItems[groupKey]
				if (!group) return null
				return (
					<motion.div key={groupKey} onMouseLeave={cancelCoverPreview} className='w-full max-w-[800px]' initial={{opacity:0,y:20}} animate={{opacity:1,y:0}}>
						<div className='mb-4 flex items-center gap-3'><span className='text-lg font-semibold'>{groupKey}</span><span className='text-secondary text-sm'>{group.items.length} 篇</span></div>
						<div>
							{group.items.map(it => {
								const hasRead = isRead(it.slug)
								const isSelected = selectedSlugs.has(it.slug)
								return (
									<Link onMouseEnter={()=>onCoverLinkMouseEnter(it.cover)} onMouseLeave={cancelCoverPreview} href={`/blog/${it.slug}`} key={it.slug}
										onClick={e=>handleItemClick(e,it.slug)}
										className={cn('group flex min-h-10 items-center gap-3 py-3 transition-all',editMode?cn('rounded-lg border px-3',isSelected?'border-brand/60 bg-brand/5':'hover:border-brand/40 border-transparent hover:bg-white/60'):'cursor-pointer')}>
										{editMode&&<span className={cn('flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold',isSelected?'border-brand bg-brand text-white':'border-[#D9D9D9] text-transparent')}><Check/></span>}
										<span className='text-secondary w-[44px] shrink-0 text-sm font-medium'>{dayjs(it.date).format('MM-DD')}</span>
										<div className='relative flex h-2 w-2 items-center justify-center'><div className='bg-secondary group-hover:bg-brand h-[5px] w-[5px] rounded-full transition-all group-hover:h-4'/><ShortLineSVG className='absolute bottom-4'/></div>
										<div className={cn('flex-1 truncate text-sm font-medium transition-all',editMode?null:'group-hover:text-brand group-hover:translate-x-2')}>{it.title||it.slug}{hasRead&&<span className='text-secondary ml-2 text-xs'>[已阅读]</span>}</div>
										<div className='flex flex-wrap items-center gap-2 max-sm:hidden'>{(it.tags||[]).map(t=><span key={t} className='text-secondary text-sm'>#{t}</span>)}</div>
									</Link>
								)
							})}
						</div>
					</motion.div>
				)
			})}
			{items.length>0&&<div className='text-center'><motion.a initial={{opacity:0,scale:0.6}} animate={{opacity:1,scale:1}} whileHover={{scale:1.05}} whileTap={{scale:0.95}} href='https://juejin.cn/user/2427311675422382/posts' target='_blank' className='card text-secondary static inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs'><JuejinSVG className='h-4 w-4'/>更多</motion.a></div>}
		</div>
		<div className='pt-12'>
			{!loading&&items.length===0&&<div className='text-secondary py-6 text-center text-sm'>暂无文章</div>}
			{loading&&<div className='text-secondary py-6 text-center text-sm'>加载中...</div>}
		</div>
		<motion.div initial={{opacity:0,scale:0.6}} animate={{opacity:1,scale:1}} className='absolute top-4 right-6 flex items-center gap-3 max-sm:hidden'>
			{editMode?(<>
				{enableCategories&&<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={()=>setCategoryModalOpen(true)} disabled={saving} className='rounded-xl border bg-white/60 px-4 py-2 text-sm hover:bg-white/80'>分类</motion.button>}
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleCancel} disabled={saving} className='rounded-xl border bg-white/60 px-6 py-2 text-sm'>取消</motion.button>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={selectedCount===editableItems.length?handleDeselectAll:handleSelectAll} className='rounded-xl border bg-white/60 px-4 py-2 text-sm hover:bg-white/80'>{selectedCount===editableItems.length?'取消全选':'全选'}</motion.button>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleDeleteSelected} disabled={selectedCount===0} className='rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 disabled:opacity-60'>删除(已选:{selectedCount}篇)</motion.button>
				<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={handleSaveClick} disabled={saving} className='brand-btn px-6'>{saving?'保存中...':buttonText}</motion.button>
			</>):(!hideEditButton&&<motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={toggleEditMode} className='bg-card rounded-xl border px-6 py-2 text-sm backdrop-blur-sm hover:bg-white/80'>编辑</motion.button>)}
		</motion.div>
		<BlogCoverHoverPreview preview={hoverCoverPreview} position={mousePosition}/>
		<CategoryModal open={categoryModalOpen} onClose={()=>setCategoryModalOpen(false)}
			categoryList={categoryList}
			newCategory={newCategory}
			onNewCategoryChange={setNewCategory}
			onAddCategory={handleAddCategory}
			onRemoveCategory={handleRemoveCategory}
			onReorderCategories={handleReorderCategories}
			editableItems={editableItems}
			onAssignCategory={handleAssignCategory}
		/>
	</>)
}

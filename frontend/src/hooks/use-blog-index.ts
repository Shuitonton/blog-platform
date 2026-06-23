import useSWR from 'swr'
import { useAuthStore } from '@/hooks/use-auth'
import type { BlogIndexItem } from '@/app/blog/types'
import { apiGet } from '@/lib/api-client'

export type { BlogIndexItem } from '@/app/blog/types'

const fetcher = async (): Promise<BlogIndexItem[]> => {
	try {
		return await apiGet<BlogIndexItem[]>('/blogs')
	} catch {
		return []
	}
}

export function useBlogIndex() {
	const { isAuth } = useAuthStore()
	const { data, error, isLoading } = useSWR<BlogIndexItem[]>('/api/blogs', fetcher, {
		revalidateOnFocus: false,
		revalidateOnReconnect: true,
	})

	let result = data || []
	if (!isAuth) {
		result = result.filter(item => !item.hidden)
	}

	return {
		items: result,
		loading: isLoading,
		error,
	}
}

export function useLatestBlog() {
	const { items, loading, error } = useBlogIndex()

	const latestBlog =
		items.length > 0
			? items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
			: null

	return {
		blog: latestBlog,
		loading,
		error,
	}
}

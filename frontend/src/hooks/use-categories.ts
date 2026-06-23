'use client'

import useSWR from 'swr'
import { apiGet } from '@/lib/api-client'

export type CategoriesConfig = {
	categories: string[]
}

const fetcher = async (): Promise<CategoriesConfig> => {
	try {
		const data = await apiGet<string[]>('/categories')
		return { categories: Array.isArray(data) ? data : [] }
	} catch {
		return { categories: [] }
	}
}

export function useCategories() {
	const { data, error, isLoading } = useSWR<CategoriesConfig>('/api/categories', fetcher, {
		revalidateOnFocus: false,
		revalidateOnReconnect: true,
	})

	return {
		categories: data?.categories ?? [],
		loading: isLoading,
		error,
	}
}

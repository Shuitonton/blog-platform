'use client'

import { useEffect, useState, useCallback } from 'react'
import Turnstile from 'react-turnstile'

const STORAGE_KEY = '_ts_verified'
const EXPIRE_MS = 24 * 60 * 60 * 1000 // 24小时免验

interface TurnstileGateProps {
	children: React.ReactNode
}

export function TurnstileGate({ children }: TurnstileGateProps) {
	const [verified, setVerified] = useState<boolean | null>(null)

	const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

	useEffect(() => {
		if (!siteKey) {
			// 未配置 siteKey 时跳过门禁（本地开发环境）
			setVerified(true)
			return
		}

		const stored = sessionStorage.getItem(STORAGE_KEY)
		if (stored) {
			try {
				const ts = parseInt(stored, 10)
				if (Date.now() - ts < EXPIRE_MS) {
					setVerified(true)
					return
				}
			} catch {
				// 存储异常，重新验证
			}
		}
		setVerified(false)
	}, [siteKey])

	const handleVerify = useCallback((token: string) => {
		const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api'
		fetch(`${apiBase}/verify-turnstile`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token })
		})
			.then(res => {
				if (res.ok) {
					sessionStorage.setItem(STORAGE_KEY, String(Date.now()))
					setVerified(true)
				} else {
					setVerified(false)
				}
			})
			.catch(() => setVerified(false))
	}, [])

	// 未配置 siteKey 或验证中
	if (verified === null) return null

	// 已验证
	if (verified) return <>{children}</>

	// 门禁页
	return (
		<div className='fixed inset-0 z-[9999] flex items-center justify-center bg-white'>
			<div className='space-y-6 p-8 text-center'>
				<h1 className='text-2xl font-semibold'>人机验证</h1>
				<p className='text-sm text-gray-500'>请完成验证以访问本站</p>
				<Turnstile sitekey={siteKey!} onVerify={handleVerify} theme='light' />
			</div>
		</div>
	)
}

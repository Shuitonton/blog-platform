'use client'

import { TurnstileGate } from '@/components/turnstile-gate'

export default function LayoutClient({ children }: { children: React.ReactNode }) {
	return <TurnstileGate>{children}</TurnstileGate>
}

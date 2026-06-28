import { NextConfig } from 'next'

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api'
const uploadsUrl = process.env.NEXT_PUBLIC_UPLOADS_URL || 'http://localhost:3326/uploads'

function originOf(raw: string): string | null {
	try {
		return new URL(raw).origin
	} catch {
		return null
	}
}

const connectOrigins = Array.from(new Set(["'self'", originOf(apiUrl)].filter(Boolean))).join(' ')
const imageOrigins = Array.from(new Set(["'self'", 'data:', 'https:', originOf(uploadsUrl)].filter(Boolean))).join(' ')

const contentSecurityPolicy = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.googletagmanager.com",
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.cn",
	`img-src ${imageOrigins}`,
	"font-src 'self' https://fonts.gstatic.cn",
	`connect-src ${connectOrigins}`,
	'frame-src https://challenges.cloudflare.com',
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'"
].join('; ')

const nextConfig: NextConfig = {
	devIndicators: false,
	reactStrictMode: false,
	reactCompiler: true,
	pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
	typescript: {
		ignoreBuildErrors: true
	},
	experimental: {
		scrollRestoration: false,
		serverActions: {
			bodySizeLimit: '100mb'
		}
	},
	turbopack: {
		rules: {
			'*.svg': {
				loaders: ['@svgr/webpack'],
				as: '*.js'
			}
		},

		resolveExtensions: ['.mdx', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json', 'css']
	},
	webpack: config => {
		config.module.rules.push({
			test: /\.svg$/i,
			use: [{ loader: '@svgr/webpack', options: { svgo: false } }]
		})

		return config
	},

	async redirects() {
		return [
			{
				source: '/zh',
				destination: '/',
				permanent: true
			},
			{
				source: '/en',
				destination: '/',
				permanent: true
			}
		]
	},

	async headers() {
		return [
			{
				source: '/:path*',
				headers: [
					{ key: 'Content-Security-Policy', value: contentSecurityPolicy },
					{ key: 'X-Content-Type-Options', value: 'nosniff' },
					{ key: 'X-Frame-Options', value: 'DENY' },
					{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
					{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
				]
			}
		]
	},

	async rewrites() {
		return [
			{
				source: '/uploads/:path*',
				destination: `${process.env.NEXT_PUBLIC_UPLOADS_URL || 'http://localhost:3326/uploads'}/:path*`
			}
		]
	}
}

export default nextConfig

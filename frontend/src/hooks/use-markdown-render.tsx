import { useEffect, useState, type ReactElement, Fragment, createElement } from 'react'
import parse, { attributesToProps, domToReact, type HTMLReactParserOptions, Element, type DOMNode } from 'html-react-parser'
import { renderMarkdown, type TocItem } from '@/lib/markdown-renderer'
import { MarkdownImage } from '@/components/markdown-image'
import { CodeBlock } from '@/components/code-block'

type MarkdownRenderResult = {
	content: ReactElement | null
	toc: TocItem[]
	loading: boolean
}

const blockedTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'button', 'textarea', 'select', 'svg'])
const allowedTags = new Set([
	'a',
	'abbr',
	'blockquote',
	'br',
	'caption',
	'code',
	'del',
	'details',
	'div',
	'em',
	'figcaption',
	'figure',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'input',
	'kbd',
	'li',
	'mark',
	'ol',
	'p',
	'pre',
	's',
	'span',
	'strong',
	'sub',
	'summary',
	'sup',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'tr',
	'ul',
	'math',
	'semantics',
	'annotation',
	'mrow',
	'mi',
	'mo',
	'mn',
	'ms',
	'mtext',
	'msup',
	'msub',
	'msubsup',
	'mfrac',
	'msqrt',
	'mroot',
	'mtable',
	'mtr',
	'mtd',
	'munderover',
	'munder',
	'mover'
])
const globalAttrs = new Set(['class', 'id', 'title', 'role', 'style'])

function isSafeUrl(value?: string): boolean {
	if (!value) return false
	const trimmed = value.trim()
	if (trimmed.startsWith('/') || trimmed.startsWith('#')) return true
	try {
		const url = new URL(trimmed, window.location.origin)
		return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:'
	} catch {
		return false
	}
}

function isSafeImageUrl(value?: string): boolean {
	if (!value) return false
	const trimmed = value.trim()
	if (trimmed.startsWith('/')) return true
	try {
		const url = new URL(trimmed, window.location.origin)
		return url.protocol === 'http:' || url.protocol === 'https:'
	} catch {
		return false
	}
}

function sanitizeAttributes(tagName: string, attrs: Record<string, string> = {}): Record<string, string> {
	const safe: Record<string, string> = {}
	for (const [key, value] of Object.entries(attrs)) {
		const lowerKey = key.toLowerCase()
		if (lowerKey.startsWith('on')) continue
		if (lowerKey === 'href') {
			if (tagName === 'a' && isSafeUrl(value)) safe.href = value
			continue
		}
		if (lowerKey === 'src') {
			if (tagName === 'img' && isSafeImageUrl(value)) safe.src = value
			continue
		}
		if (lowerKey === 'target') {
			if (tagName === 'a' && (value === '_blank' || value === '_self')) safe.target = value
			continue
		}
		if (lowerKey === 'rel') {
			if (tagName === 'a') safe.rel = value
			continue
		}
		if (lowerKey === 'type') {
			if (tagName === 'input' && value === 'checkbox') safe.type = value
			continue
		}
		if (lowerKey === 'checked' || lowerKey === 'disabled') {
			if (tagName === 'input') safe[lowerKey] = value
			continue
		}
		if (globalAttrs.has(lowerKey) || lowerKey.startsWith('aria-') || lowerKey.startsWith('data-')) {
			safe[key] = value
		}
	}
	if (tagName === 'a' && safe.target === '_blank') {
		safe.rel = 'noopener noreferrer'
	}
	return safe
}

export function useMarkdownRender(markdown: string): MarkdownRenderResult {
	const [content, setContent] = useState<ReactElement | null>(null)
	const [toc, setToc] = useState<TocItem[]>([])
	const [loading, setLoading] = useState<boolean>(true)

	useEffect(() => {
		let cancelled = false

		async function render() {
			setLoading(true)
			try {
				const { html, toc } = await renderMarkdown(markdown)
				if (!cancelled) {
					// Extract pre elements and replace with placeholders before parsing
					const codeBlocks: Array<{ placeholder: string; code: string; preHtml: string }> = []
					let processedHtml = html.replace(/<pre\s+data-code="([^"]*)"([^>]*)>([\s\S]*?)<\/pre>/g, (match, codeAttr, attrs, content) => {
						const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`
						// Decode HTML entities in code attribute
						const code = codeAttr
							.replace(/&quot;/g, '"')
							.replace(/&#39;/g, "'")
							.replace(/&lt;/g, '<')
							.replace(/&gt;/g, '>')
							.replace(/&amp;/g, '&')
						codeBlocks.push({
							placeholder,
							code,
							preHtml: `${content}`
						})
						return placeholder
					})

					// Parse HTML and replace img elements and code block placeholders
					const options: HTMLReactParserOptions = {
						replace(domNode: DOMNode) {
							if (domNode instanceof Element && domNode.name === 'img') {
								const { src, alt, title } = domNode.attribs
								if (!isSafeImageUrl(src)) return <></>
								return <MarkdownImage src={src} alt={alt} title={title} />
							}
							if (domNode instanceof Element) {
								const tagName = domNode.name.toLowerCase()
								if (blockedTags.has(tagName)) return <></>
								if (!allowedTags.has(tagName)) {
									return <>{domToReact(domNode.children as DOMNode[], options)}</>
								}
								const props = attributesToProps(sanitizeAttributes(tagName, domNode.attribs), tagName)
								return createElement(tagName, props, domToReact(domNode.children as DOMNode[], options))
							}
							// Handle code block placeholders in text nodes
							if (domNode.type === 'text' && domNode.data && domNode.data.includes('__CODE_BLOCK_')) {
								const text = domNode.data
								const result = text.split(/(__CODE_BLOCK_\d+__)/).filter(Boolean)

								return (
									<>
										{result.map((item, index) => {
											if (item.startsWith('__CODE_BLOCK_')) {
												const block = codeBlocks.find(b => b.placeholder === item)
												if (block) {
													const preElement = parse(block.preHtml, options) as ReactElement
													return (
														<CodeBlock key={block.placeholder} code={block.code}>
															{preElement}
														</CodeBlock>
													)
												}
											} else {
												return item ? <Fragment key={index}>{item}</Fragment> : null
											}
										})}
									</>
								)
							}
						}
					}
					const reactContent = parse(processedHtml, options) as ReactElement
					setContent(reactContent)
					setToc(toc)
				}
			} catch (error) {
				console.error('Markdown render error:', error)
				if (!cancelled) {
					setContent(null)
					setToc([])
				}
			} finally {
				if (!cancelled) {
					setLoading(false)
				}
			}
		}

		render()

		return () => {
			cancelled = true
		}
	}, [markdown])

	return { content, toc, loading }
}

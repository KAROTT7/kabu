import type { RewriteRule } from './types.js'

function normalizePathPrefix(value: unknown): string {
  const normalized = String(value || '').trim().replace(/\/+$/g, '')
  return normalized || '/'
}

function createRewriteRule(fromRaw: unknown, toRaw: unknown, source: string = `${fromRaw}=${toRaw}`): RewriteRule {
  const from = normalizePathPrefix(fromRaw)
  const to = normalizePathPrefix(toRaw)

  if (!from.startsWith('/') || !to.startsWith('/')) {
    throw new Error(`无效的 --rewrite-prefix 参数: ${source}，from/to 都需要以 / 开头`)
  }

  return { from, to }
}

function pathStartsWithPrefix(url: string, prefix: string): boolean {
  if (prefix === '/') return url.startsWith('/')
  return url === prefix || url.startsWith(`${prefix}/`)
}

export function parseRewriteRule(raw: unknown): RewriteRule {
  const value = String(raw || '').trim()
  const splitIndex = value.indexOf('=')
  if (!value || splitIndex <= 0 || splitIndex === value.length - 1) {
    throw new Error(`无效的 --rewrite-prefix 参数: ${raw}，期望格式 <from=to>`)
  }

  const from = value.slice(0, splitIndex).trim()
  const to = value.slice(splitIndex + 1).trim()

  return createRewriteRule(from, to, String(raw))
}

export function normalizeRewriteRules(rules: unknown): RewriteRule[] {
  if (!rules) return []

  const list = Array.isArray(rules) ? rules : [rules]
  return list
    .filter(Boolean)
    .map(rule => {
      if (typeof rule === 'string') {
        return parseRewriteRule(rule)
      }

      if (Array.isArray(rule)) {
        return createRewriteRule(rule[0], rule[1], rule.join('='))
      }

      if (typeof rule === 'object') {
        return createRewriteRule(rule.from, rule.to, JSON.stringify(rule))
      }

      throw new Error(`无效的 rewritePrefix 配置: ${String(rule)}`)
    })
}

export function rewritePath(url: string, pathRewrites: RewriteRule[]): string {
  if (!Array.isArray(pathRewrites) || pathRewrites.length === 0) return url

  for (const rule of pathRewrites) {
    if (pathStartsWithPrefix(url, rule.from)) {
      return `${rule.to}${url.slice(rule.from.length)}`
    }
  }

  return url
}

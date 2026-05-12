import { describe, expect, it } from 'vitest'
import { normalizeRewriteRules, parseRewriteRule, rewritePath } from '../src/rewrite-rules.js'

describe('rewrite-rules', () => {
  it('normalizes string and object rewrite inputs', () => {
    expect(normalizeRewriteRules(['/product/=/api/product/', { from: '/member', to: '/api/member/' }])).toEqual([
      { from: '/product', to: '/api/product' },
      { from: '/member', to: '/api/member' }
    ])
  })

  it('applies only the first matched rewrite rule', () => {
    const rules = normalizeRewriteRules(['/a/b=/c/a/c', '/a=/c/a/b'])

    expect(rewritePath('/a/b/user', rules)).toBe('/c/a/c/user')
    expect(rewritePath('/a/user', rules)).toBe('/c/a/b/user')
    expect(rewritePath('/abc/user', rules)).toBe('/abc/user')
  })

  it('reports invalid CLI rules with the new rewrite option name', () => {
    expect(() => parseRewriteRule('product=/api/product')).toThrowError(
      '无效的 --rewrite 参数: product=/api/product，from/to 都需要以 / 开头'
    )
  })
})

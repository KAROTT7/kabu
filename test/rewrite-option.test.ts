import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateServices } from '../src/generate-services.js'
import { generateFromSpec } from '../src/render-ts.js'

const tempDirs: string[] = []

const fileHeader = "import type { AxiosRequestConfig } from 'axios'\nimport request from '../request'"

const spec = {
  openapi: '3.1.0',
  info: {
    title: '测试商品服务',
    version: '1.0.0'
  },
  paths: {
    '/product/item/{id}': {
      get: {
        summary: '查询商品详情',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'integer'
            }
          }
        ],
        responses: {
          '200': {
            description: '成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'string'
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kabu-vitest-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('rewrite option', () => {
  it('rewrites generated request urls when using rewrite', () => {
    const code = generateFromSpec(spec, 'product', {
      fileHeader,
      rewrite: '/product=/api/product'
    })

    expect(code).toContain('GET /api/product/item/{id}')
    expect(code).toContain('`/api/product/item/${id}`')
    expect(code).toContain('): Promise<GetProductItemByIdResponse | undefined> {')
    expect(code).toContain('request.get<GetProductItemByIdResponse, { data?: string }>')
  })

  it('keeps rewritePrefix compatibility in render output', () => {
    const code = generateFromSpec(spec, 'product', {
      fileHeader,
      rewritePrefix: '/product=/legacy/product'
    })

    expect(code).toContain('GET /legacy/product/item/{id}')
    expect(code).toContain('`/legacy/product/item/${id}`')
  })

  it('writes rewritten urls to generated files when using rewrite', () => {
    const root = createTempDir()
    const inputDir = path.join(root, 'openapi')
    const outputDir = path.join(root, 'services')

    fs.mkdirSync(inputDir, { recursive: true })
    fs.writeFileSync(path.join(inputDir, 'product.openapi.json'), JSON.stringify(spec, null, 2), 'utf8')

    const result = generateServices({
      root,
      inputDir: './openapi',
      outputDir: './services',
      fileHeader,
      rewrite: '/product=/api/product',
      logger: false
    })

    expect(result.files).toHaveLength(1)
    expect(fs.readFileSync(path.join(outputDir, 'product.ts'), 'utf8')).toContain('`/api/product/item/${id}`')
  })

  it('keeps rewritePrefix compatibility in generateServices', () => {
    const root = createTempDir()
    const inputDir = path.join(root, 'openapi')
    const outputDir = path.join(root, 'services')

    fs.mkdirSync(inputDir, { recursive: true })
    fs.writeFileSync(path.join(inputDir, 'product.openapi.json'), JSON.stringify(spec, null, 2), 'utf8')

    generateServices({
      root,
      inputDir: './openapi',
      outputDir: './services',
      fileHeader,
      rewritePrefix: '/product=/legacy/product',
      logger: false
    })

    expect(fs.readFileSync(path.join(outputDir, 'product.ts'), 'utf8')).toContain('`/legacy/product/item/${id}`')
  })
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateServices } from '../src/generate-services.js'
import { generateFromSpec, generateFromSpecWithMeta, generateSharedTypes } from '../src/render-ts.js'

const apiResultSpec = {
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
                  $ref: '#/components/schemas/ApiResultProductDetail'
                }
              }
            }
          }
        }
      }
    },
    '/product/item/page': {
      get: {
        summary: '分页查询商品',
        responses: {
          '200': {
            description: '成功',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ApiResultProductPage'
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      ApiResultProductDetail: {
        type: 'object',
        required: ['code', 'message', 'data'],
        properties: {
          code: { type: 'integer' },
          message: { type: 'string' },
          data: { $ref: '#/components/schemas/ProductDetail' }
        }
      },
      ApiResultProductPage: {
        type: 'object',
        required: ['code', 'message', 'data'],
        properties: {
          code: { type: 'integer' },
          message: { type: 'string' },
          data: { $ref: '#/components/schemas/ProductPage' }
        }
      },
      ProductDetail: {
        type: 'object',
        properties: {
          id: { type: 'integer' }
        }
      },
      ProductPage: {
        type: 'object',
        properties: {
          total: { type: 'integer' }
        }
      }
    }
  }
}

const fileHeader = "import type { AxiosRequestConfig } from 'axios'\nimport request from '../request'"
const tempDirs: string[] = []

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kabu-response-wrapper-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('response wrapper', () => {
  it('collapses repeated ApiResult wrappers into a shared generic type', () => {
    const code = generateFromSpec(apiResultSpec, 'product', { fileHeader })

    expect(code).toContain('export interface ApiResult<T> {')
    expect(code).not.toContain('export interface ApiResultProductDetail {')
    expect(code).not.toContain('export interface ApiResultProductPage {')
    expect(code).toContain('request.get<GetProductItemByIdResponse, ApiResult<GetProductItemByIdResponse>>')
    expect(code).toContain('request.get<GetProductItemPageResponse, ApiResult<GetProductItemPageResponse>>')
  })

  it('can import ApiResult from a shared interface file', () => {
    const rendered = generateFromSpecWithMeta(apiResultSpec, 'product', {
      fileHeader,
      sharedTypeNames: ['ApiResult'],
      sharedTypeImportPath: './interface'
    })
    const sharedTypes = generateSharedTypes(
      new Map([...rendered.helperSchemas].map(([name, schema]) => [name, { schema, schemaMap: rendered.schemaMap }]))
    )

    expect(rendered.code).toContain("import type { ApiResult } from './interface'")
    expect(rendered.code).not.toContain('export interface ApiResult<T> {')
    expect(rendered.code).toContain('request.get<GetProductItemByIdResponse, ApiResult<GetProductItemByIdResponse>>')
    expect(sharedTypes).toContain('export interface ApiResult<T> {')
  })

  it('writes detected ApiResult into interface.ts when generating services', () => {
    const root = createTempDir()
    const inputDir = path.join(root, 'openapi')
    fs.mkdirSync(inputDir, { recursive: true })
    fs.writeFileSync(path.join(inputDir, 'product.openapi.json'), `${JSON.stringify(apiResultSpec, null, 2)}\n`, 'utf8')

    generateServices({
      root,
      inputDir: './openapi',
      baselineDir: './baseline',
      outputDir: './services',
      fileHeader,
      logger: false
    })

    const serviceCode = fs.readFileSync(path.join(root, 'services/product.ts'), 'utf8')
    const interfaceCode = fs.readFileSync(path.join(root, 'services/interface.ts'), 'utf8')

    expect(serviceCode).toContain("import type { ApiResult } from './interface'")
    expect(serviceCode).not.toContain('export interface ApiResult<T> {')
    expect(interfaceCode).toContain('export interface ApiResult<T> {')
  })
})

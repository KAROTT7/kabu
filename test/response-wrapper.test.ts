import { describe, expect, it } from 'vitest'
import { generateFromSpec } from '../src/render-ts.js'

const fileHeader = "import type { AxiosRequestConfig } from 'axios'\nimport request from '../request'"

describe('response wrapper', () => {
  it('collapses repeated ApiResult wrappers into a shared generic type', () => {
    const code = generateFromSpec(
      {
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
      },
      'product',
      { fileHeader }
    )

    expect(code).toContain('export interface ApiResult<T> {')
    expect(code).not.toContain('export interface ApiResultProductDetail {')
    expect(code).not.toContain('export interface ApiResultProductPage {')
    expect(code).toContain('request.get<GetProductItemByIdResponse, ApiResult<GetProductItemByIdResponse>>')
    expect(code).toContain('request.get<GetProductItemPageResponse, ApiResult<GetProductItemPageResponse>>')
  })
})

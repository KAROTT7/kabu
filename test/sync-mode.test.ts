import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_BASELINE_DIR, generateServices } from '../src/index.js'

const tempDirs: string[] = []

const fileHeader = "import type { AxiosRequestConfig } from 'axios'\nimport request from '../request'"
const baselineDir = './baseline'

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kabu-sync-'))
  tempDirs.push(dir)
  return dir
}

function writeSpec(root: string, fileName: string, spec: any): void {
  const inputDir = path.join(root, 'openapi')
  fs.mkdirSync(inputDir, { recursive: true })
  fs.writeFileSync(path.join(inputDir, fileName), `${JSON.stringify(spec, null, 2)}\n`, 'utf8')
}

function readFile(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function buildResponseSchema(type: string = 'string'): any {
  return {
    '200': {
      description: '成功',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              data: {
                type
              }
            }
          }
        }
      }
    }
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('mode', () => {
  it('splits imported specs by the first path segment into module baseline files', () => {
    const root = createTempDir()
    writeSpec(root, 'mixed.openapi.json', {
      openapi: '3.1.0',
      info: {
        title: 'mixed',
        version: '1.0.0'
      },
      paths: {
        '/product/item/page': {
          get: {
            summary: '商品列表',
            responses: buildResponseSchema()
          }
        },
        '/member/user/detail': {
          get: {
            summary: '用户详情',
            responses: buildResponseSchema()
          }
        }
      }
    })

    const result = generateServices({
      root,
      inputDir: './openapi',
      baselineDir,
      outputDir: './services',
      fileHeader,
      logger: false
    })

    expect(result.mode).toBe('update')
    expect(result.baselineDir).toBe(path.join(root, 'baseline'))
    expect(result.files.map(file => path.basename(file.output))).toEqual(['member.ts', 'product.ts'])
    expect(readFile(root, 'baseline/product.openapi.json')).toContain('/product/item/page')
    expect(readFile(root, 'baseline/member.openapi.json')).toContain('/member/user/detail')
  })

  it('keeps old module interfaces in update mode and only updates touched operations', () => {
    const root = createTempDir()
    writeSpec(root, 'first.openapi.json', {
      openapi: '3.1.0',
      info: {
        title: 'product',
        version: '1.0.0'
      },
      paths: {
        '/product/item/page': {
          get: {
            summary: '商品列表',
            responses: buildResponseSchema()
          }
        },
        '/product/item/{id}': {
          get: {
            summary: '旧商品详情',
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
            responses: buildResponseSchema('string')
          }
        },
        '/product/item/{id}/delete': {
          delete: {
            summary: '删除商品',
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
            responses: buildResponseSchema('boolean')
          }
        }
      }
    })

    generateServices({
      root,
      inputDir: './openapi',
      baselineDir,
      outputDir: './services',
      fileHeader,
      logger: false
    })

    fs.rmSync(path.join(root, 'openapi'), { recursive: true, force: true })
    writeSpec(root, 'second.openapi.json', {
      openapi: '3.1.0',
      info: {
        title: 'product',
        version: '1.0.1'
      },
      paths: {
        '/product/item/{id}': {
          get: {
            summary: '新商品详情',
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
            responses: buildResponseSchema('number')
          }
        }
      }
    })

    generateServices({
      root,
      inputDir: './openapi',
      baselineDir,
      outputDir: './services',
      fileHeader,
      logger: false
    })

    const productService = readFile(root, 'services/product.ts')
    const productBaseline = readFile(root, 'baseline/product.openapi.json')

    expect(productService).toContain('商品列表')
    expect(productService).toContain('删除商品')
    expect(productService).toContain('新商品详情')
    expect(productService).not.toContain('旧商品详情')
    expect(productBaseline).toContain('/product/item/page')
    expect(productBaseline).toContain('/product/item/{id}/delete')
    expect(productBaseline).toContain('新商品详情')
  })

  it('clears baseline and output directories before generating in full mode', () => {
    const root = createTempDir()
    writeSpec(root, 'first.openapi.json', {
      openapi: '3.1.0',
      info: {
        title: 'mixed',
        version: '1.0.0'
      },
      paths: {
        '/product/item/page': {
          get: {
            summary: '商品列表',
            responses: buildResponseSchema()
          }
        },
        '/member/user/detail': {
          get: {
            summary: '用户详情',
            responses: buildResponseSchema()
          }
        }
      }
    })

    generateServices({
      root,
      inputDir: './openapi',
      baselineDir,
      outputDir: './services',
      fileHeader,
      logger: false
    })

    fs.rmSync(path.join(root, 'openapi'), { recursive: true, force: true })
    fs.writeFileSync(path.join(root, 'baseline', 'stale.openapi.json'), '{}\n', 'utf8')
    fs.writeFileSync(path.join(root, 'services', 'stale.ts'), 'stale\n', 'utf8')
    writeSpec(root, 'second.openapi.json', {
      openapi: '3.1.0',
      info: {
        title: 'product',
        version: '1.0.1'
      },
      paths: {
        '/product/item/detail': {
          get: {
            summary: '新商品详情',
            responses: buildResponseSchema()
          }
        }
      }
    })

    generateServices({
      root,
      inputDir: './openapi',
      baselineDir,
      outputDir: './services',
      fileHeader,
      mode: 'full',
      logger: false
    })

    expect(fs.existsSync(path.join(root, 'services/member.ts'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'baseline', 'member.openapi.json'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'baseline', 'stale.openapi.json'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'services', 'stale.ts'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'services/product.ts'))).toBe(true)
    expect(readFile(root, 'services/product.ts')).toContain('新商品详情')
  })

  it('uses the default baseline directory when baselineDir is omitted', () => {
    const root = createTempDir()
    writeSpec(root, 'product.openapi.json', {
      openapi: '3.1.0',
      info: {
        title: 'product',
        version: '1.0.0'
      },
      paths: {
        '/product/item/page': {
          get: {
            summary: '商品列表',
            responses: buildResponseSchema()
          }
        }
      }
    })

    const result = generateServices({
      root,
      inputDir: './openapi',
      outputDir: './services',
      fileHeader,
      logger: false
    })

    expect(result.baselineDir).toBe(path.join(root, DEFAULT_BASELINE_DIR))
    expect(fs.existsSync(path.join(root, DEFAULT_BASELINE_DIR, 'product.openapi.json'))).toBe(true)
  })

  it('rejects unsupported modes', () => {
    const root = createTempDir()
    writeSpec(root, 'product.openapi.json', {
      openapi: '3.1.0',
      info: {
        title: 'product',
        version: '1.0.0'
      },
      paths: {
        '/product/item/page': {
          get: {
            summary: '商品列表',
            responses: buildResponseSchema()
          }
        }
      }
    })

    expect(() =>
      generateServices({
        root,
        inputDir: './openapi',
        baselineDir,
        outputDir: './services',
        fileHeader,
        mode: 'delta' as any,
        logger: false
      })
    ).toThrowError('无效的 --mode 参数: delta，仅支持 update 或 full')
  })

  it('rejects full mode when input dir is inside a directory that will be cleared', () => {
    const root = createTempDir()
    const sharedDir = path.join(root, 'shared')
    fs.mkdirSync(sharedDir, { recursive: true })
    fs.writeFileSync(
      path.join(sharedDir, 'product.openapi.json'),
      `${JSON.stringify(
        {
          openapi: '3.1.0',
          info: {
            title: 'product',
            version: '1.0.0'
          },
          paths: {
            '/product/item/page': {
              get: {
                summary: '商品列表',
                responses: buildResponseSchema()
              }
            }
          }
        },
        null,
        2
      )}\n`,
      'utf8'
    )

    expect(() =>
      generateServices({
        root,
        inputDir: './shared',
        baselineDir: './baseline',
        outputDir: './shared',
        fileHeader,
        mode: 'full',
        logger: false
      })
    ).toThrowError(`full 模式要求输入目录不能位于将被清空的目录内: ${path.join(root, 'shared')} -> ${path.join(root, 'shared')}`)
  })
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runCli } from '../src/cli/index.js'
import { loadConfigFile } from '../src/config.js'

const tempDirs: string[] = []
const fileHeader = "import type { AxiosRequestConfig } from 'axios'\nimport request from '../request'"

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kabu-config-'))
  tempDirs.push(dir)
  return dir
}

function writeSpec(root: string): void {
  const inputDir = path.join(root, 'openapi')
  fs.mkdirSync(inputDir, { recursive: true })
  fs.writeFileSync(
    path.join(inputDir, 'product.openapi.json'),
    `${JSON.stringify(
      {
        openapi: '3.1.0',
        info: {
          title: 'product',
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
      },
      null,
      2
    )}\n`,
    'utf8'
  )
}

function writeConfig(root: string, config: Record<string, unknown>): string {
  const filePath = path.join(root, 'kabu.config.mjs')
  fs.writeFileSync(filePath, `export default ${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return filePath
}

beforeEach(() => {
  process.exitCode = undefined
})

afterEach(() => {
  process.exitCode = undefined
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('config file', () => {
  it('loads command options from a config file referenced by -c', async () => {
    const root = createTempDir()
    writeSpec(root)
    const configFile = writeConfig(root, {
      inputDir: path.join(root, 'openapi'),
      baselineDir: path.join(root, 'baseline'),
      outputDir: path.join(root, 'services'),
      fileHeader,
      rewrite: '/product=/api/config'
    })

    await runCli(['node', 'kabu', 'gen', '-c', configFile])

    const generated = fs.readFileSync(path.join(root, 'services', 'product.ts'), 'utf8')
    expect(generated).toContain('`/api/config/item/${id}`')
    expect(fs.existsSync(path.join(root, 'baseline', 'product.openapi.json'))).toBe(true)
    expect(process.exitCode).toBeUndefined()
  })

  it('prefers CLI options over config file options', async () => {
    const root = createTempDir()
    writeSpec(root)
    const configFile = writeConfig(root, {
      inputDir: path.join(root, 'openapi'),
      baselineDir: path.join(root, 'baseline'),
      outputDir: path.join(root, 'services-from-config'),
      fileHeader,
      rewrite: '/product=/api/config'
    })

    await runCli([
      'node',
      'kabu',
      'gen',
      '-c',
      configFile,
      '--output-dir',
      path.join(root, 'services-from-cli'),
      '--rewrite',
      '/product=/api/cli'
    ])

    const generated = fs.readFileSync(path.join(root, 'services-from-cli', 'product.ts'), 'utf8')
    expect(generated).toContain('`/api/cli/item/${id}`')
    expect(generated).not.toContain('/api/config')
    expect(fs.existsSync(path.join(root, 'services-from-config', 'product.ts'))).toBe(false)
    expect(process.exitCode).toBeUndefined()
  })

  it('ignores values that are not CLI options in the config file', async () => {
    const root = createTempDir()
    const configFile = writeConfig(root, {
      gen: {
        inputDir: './openapi'
      },
      commands: {
        gen: {
          outputDir: './services'
        }
      },
      root,
      logger: false,
      inputDir: path.join(root, 'openapi')
    })

    await expect(loadConfigFile(configFile)).resolves.toEqual({
      filePath: configFile,
      config: {
        inputDir: path.join(root, 'openapi')
      }
    })
  })
})

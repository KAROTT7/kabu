import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { KabuConfig, KabuConfigExport, LoadedKabuConfig } from './types.js'

export const DEFAULT_CONFIG_FILES = ['kabu.config.mjs', 'kabu.config.js', 'kabu.config.cjs', 'kabu.config.json']
const CONFIG_OPTION_KEYS = ['inputDir', 'baselineDir', 'outputDir', 'fileHeader', 'mode', 'rewrite'] as const

const require = createRequire(import.meta.url)

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function interopDefault(moduleValue: unknown): unknown {
  if (isRecord(moduleValue) && Object.prototype.hasOwnProperty.call(moduleValue, 'default')) {
    return moduleValue.default
  }
  return moduleValue
}

function findDefaultConfigFile(root: string): string | null {
  for (const fileName of DEFAULT_CONFIG_FILES) {
    const filePath = path.resolve(root, fileName)
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath
  }
  return null
}

async function loadConfigModule(filePath: string): Promise<unknown> {
  const ext = path.extname(filePath)

  if (ext === '.json') {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  }

  if (ext === '.cjs') {
    return require(filePath)
  }

  if (ext === '.js' || ext === '.mjs') {
    return import(pathToFileURL(filePath).href)
  }

  throw new Error(`不支持的配置文件类型: ${filePath}，请使用 .mjs、.js、.cjs 或 .json`)
}

function normalizeConfig(value: unknown, filePath: string): KabuConfig {
  if (!isRecord(value)) {
    throw new Error(`配置文件需要导出一个对象: ${filePath}`)
  }

  const config: KabuConfig = {}
  const configRecord = config as Record<string, unknown>
  for (const key of CONFIG_OPTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      configRecord[key] = value[key]
    }
  }

  return config
}

export function defineConfig(config: KabuConfigExport): KabuConfigExport {
  return config
}

export async function loadConfigFile(
  configFile: string | undefined,
  root = process.cwd()
): Promise<LoadedKabuConfig> {
  const filePath = configFile ? path.resolve(root, configFile) : findDefaultConfigFile(root)

  if (!filePath) {
    return {
      filePath: null,
      config: {}
    }
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`配置文件不存在或不是文件: ${filePath}`)
  }

  const loaded = interopDefault(await loadConfigModule(filePath))
  const configExport = typeof loaded === 'function' ? await (loaded as () => KabuConfig | Promise<KabuConfig>)() : loaded

  return {
    filePath,
    config: normalizeConfig(configExport, filePath)
  }
}

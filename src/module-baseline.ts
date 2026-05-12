import fs from 'node:fs'
import path from 'node:path'
import { assertOpenApiSupported, readJSON } from './openapi.js'
import type { GenerateMode, Logger } from './types.js'

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch']
const RESERVED_PATH_ITEM_KEYS = new Set(['parameters', ...HTTP_METHODS])

export const DEFAULT_BASELINE_DIR = 'openapi-baseline'

export interface ModuleSpecEntry {
  moduleName: string
  filePath: string
  spec: any
}

export interface SyncModuleSpecsOptions {
  baselineDir: string
  inputSpecs: Array<{ filePath: string; spec: any }>
  outputDir: string
  root: string
  mode: GenerateMode
  logger?: Logger | null
}

export interface SyncModuleSpecsResult {
  moduleSpecs: ModuleSpecEntry[]
}

function sortRecordByKey<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN')))
}

function normalizePathItem(pathItem: any): any {
  const normalized: Record<string, any> = {}
  const source = pathItem && typeof pathItem === 'object' ? pathItem : {}

  if (Array.isArray(source.parameters) && source.parameters.length > 0) {
    normalized.parameters = source.parameters
  }

  for (const method of HTTP_METHODS) {
    if (Object.prototype.hasOwnProperty.call(source, method)) {
      normalized[method] = source[method]
    }
  }

  const extraKeys = Object.keys(source)
    .filter(key => !RESERVED_PATH_ITEM_KEYS.has(key))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))

  for (const key of extraKeys) {
    normalized[key] = source[key]
  }

  return normalized
}

function moduleNameFromPath(url: string): string {
  const moduleName = String(url || '')
    .split('/')
    .filter(Boolean)[0]

  if (!moduleName) {
    throw new Error(`无法从接口路径推导模块名: ${url}`)
  }

  return moduleName
}

function createModuleTitle(sourceSpec: any, moduleName: string, moduleCount: number): string {
  const title = String(sourceSpec?.info?.title || '').trim()
  if (moduleCount === 1 && title) return title
  return moduleName
}

function createModuleFragment(sourceSpec: any, moduleName: string, paths: Record<string, any>, moduleCount: number): any {
  const fragment: any = {
    openapi: String(sourceSpec?.openapi || '3.1.0'),
    info: {
      title: createModuleTitle(sourceSpec, moduleName, moduleCount),
      version: String(sourceSpec?.info?.version || '1.0.0')
    },
    paths: sortRecordByKey(paths)
  }

  const schemas = sourceSpec?.components?.schemas
  if (schemas && typeof schemas === 'object' && Object.keys(schemas).length > 0) {
    fragment.components = {
      schemas: sortRecordByKey(schemas)
    }
  }

  return fragment
}

function splitSpecByModule(sourceSpec: any): Map<string, any> {
  const modulePaths = new Map<string, Record<string, any>>()

  for (const [url, pathItem] of Object.entries(sourceSpec?.paths || {})) {
    const moduleName = moduleNameFromPath(String(url))
    const current = modulePaths.get(moduleName) || {}
    current[String(url)] = normalizePathItem(pathItem)
    modulePaths.set(moduleName, current)
  }

  const moduleCount = modulePaths.size
  return new Map(
    [...modulePaths.entries()].map(([moduleName, paths]) => {
      return [moduleName, createModuleFragment(sourceSpec, moduleName, paths, moduleCount)]
    })
  )
}

function mergePathItem(existing: any, incoming: any): any {
  const merged: Record<string, any> = { ...(existing && typeof existing === 'object' ? existing : {}) }

  if (Array.isArray(incoming?.parameters)) {
    merged.parameters = incoming.parameters
  }

  for (const method of HTTP_METHODS) {
    if (Object.prototype.hasOwnProperty.call(incoming || {}, method)) {
      merged[method] = incoming[method]
    }
  }

  for (const key of Object.keys(incoming || {})) {
    if (!RESERVED_PATH_ITEM_KEYS.has(key)) {
      merged[key] = incoming[key]
    }
  }

  return normalizePathItem(merged)
}

function sortModuleSpec(spec: any): any {
  const sorted: any = {
    openapi: String(spec?.openapi || '3.1.0'),
    info: {
      title: String(spec?.info?.title || 'unknown'),
      version: String(spec?.info?.version || '1.0.0')
    },
    paths: sortRecordByKey(
      Object.fromEntries(
        Object.entries(spec?.paths || {}).map(([url, pathItem]) => [url, normalizePathItem(pathItem)])
      )
    )
  }

  const schemas = spec?.components?.schemas
  if (schemas && typeof schemas === 'object' && Object.keys(schemas).length > 0) {
    sorted.components = {
      schemas: sortRecordByKey(schemas)
    }
  }

  return sorted
}

function mergeModuleSpec(existing: any, incoming: any): any {
  const mergedPaths: Record<string, any> = { ...(existing?.paths || {}) }

  for (const [url, pathItem] of Object.entries(incoming?.paths || {})) {
    const current = mergedPaths[url]
    mergedPaths[url] = current ? mergePathItem(current, pathItem) : normalizePathItem(pathItem)
  }

  const mergedSchemas = {
    ...(existing?.components?.schemas || {}),
    ...(incoming?.components?.schemas || {})
  }

  const merged: any = {
    openapi: String(incoming?.openapi || existing?.openapi || '3.1.0'),
    info: {
      title: String(existing?.info?.title || incoming?.info?.title || 'unknown'),
      version: String(incoming?.info?.version || existing?.info?.version || '1.0.0')
    },
    paths: mergedPaths
  }

  if (Object.keys(mergedSchemas).length > 0) {
    merged.components = {
      schemas: mergedSchemas
    }
  }

  return sortModuleSpec(merged)
}

function moduleSpecFileName(moduleName: string): string {
  return `${moduleName}.openapi.json`
}

function readModuleSpec(baselineDir: string, moduleName: string): any {
  const filePath = path.join(baselineDir, moduleSpecFileName(moduleName))
  if (!fs.existsSync(filePath)) return null
  return readJSON(filePath)
}

function listBaselineModuleNames(baselineDir: string): string[] {
  if (!fs.existsSync(baselineDir) || !fs.statSync(baselineDir).isDirectory()) return []

  return fs
    .readdirSync(baselineDir)
    .filter(fileName => fileName.endsWith('.openapi.json'))
    .map(fileName => fileName.slice(0, -'.openapi.json'.length))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

function writeJSON(filePath: string, value: any): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function syncModuleSpecs(options: SyncModuleSpecsOptions): SyncModuleSpecsResult {
  const { baselineDir, inputSpecs, root, mode } = options
  const logger = options.logger === false ? null : options.logger || null
  const nextSpecs = new Map<string, any>()

  for (const inputSpec of inputSpecs) {
    assertOpenApiSupported(inputSpec.spec, inputSpec.filePath)
    const sourceSpec = inputSpec.spec
    const moduleFragments = splitSpecByModule(sourceSpec)

    for (const [moduleName, fragment] of moduleFragments) {
      const current = nextSpecs.get(moduleName) || (mode === 'update' ? readModuleSpec(baselineDir, moduleName) : null)
      const merged = current ? mergeModuleSpec(current, fragment) : sortModuleSpec(fragment)
      nextSpecs.set(moduleName, merged)

      if (logger) {
        logger.log(
          `[sync] ${path.relative(root, inputSpec.filePath)} -> ${path.relative(root, path.join(baselineDir, moduleSpecFileName(moduleName)))}`
        )
      }
    }
  }

  const moduleSpecs = [...nextSpecs.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'))
    .map(([moduleName, spec]) => {
      const filePath = path.join(baselineDir, moduleSpecFileName(moduleName))
      writeJSON(filePath, spec)
      return {
        moduleName,
        filePath,
        spec
      }
    })

  return {
    moduleSpecs
  }
}

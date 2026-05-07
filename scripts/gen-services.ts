#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()

type Logger = Pick<Console, 'log'> | false

interface RewriteRule {
  from: string
  to: string
}

type RewriteInput = string | [unknown, unknown] | { from?: unknown; to?: unknown }

interface CliArgs {
  pathRewrites: RewriteRule[]
  inputDir?: string
  outputDir?: string
  servicesDir?: string
  requestImport?: string
  rewritePrefix?: RewriteInput | RewriteInput[]
  help?: boolean
  inputDirFromPositional?: boolean
  root?: string
  logger?: Logger
}

interface NormalizedGenerateOptions {
  inputDir: string
  outputDir: string
  requestImport: string
  pathRewrites: RewriteRule[]
  logger?: Logger
}

interface GenerateResult {
  inputDir: string
  outputDir: string
  files: Array<{ input: string; output: string }>
}

interface TsContext {
  collectRef(name: string): void
}

type SchemaMap = Record<string, any>

const METHOD_MAP: Record<string, string> = {
  get: 'get',
  post: 'post',
  put: 'put',
  delete: 'delete',
  patch: 'patch'
}

const DATA_ARGUMENT_METHODS = new Set<string>(['post', 'put', 'patch'])

function parseArgs(argv: string[]): CliArgs {
  const options: CliArgs = {
    pathRewrites: []
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (arg === '--input-dir') {
      options.inputDir = path.resolve(ROOT, argv[i + 1] || '')
      i += 1
      continue
    }

    if (arg === '--output-dir') {
      options.outputDir = path.resolve(ROOT, argv[i + 1] || '')
      i += 1
      continue
    }

    if (arg === '--services-dir') {
      const target = path.resolve(ROOT, argv[i + 1] || '')
      options.inputDir = target
      options.outputDir = target
      i += 1
      continue
    }

    if (arg === '--request-import') {
      options.requestImport = String(argv[i + 1] || '').trim()
      i += 1
      continue
    }

    if (arg === '--rewrite-prefix') {
      const ruleRaw = argv[i + 1] || ''
      options.pathRewrites.push(parseRewriteRule(ruleRaw))
      i += 1
      continue
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    if (!arg.startsWith('-') && !options.inputDirFromPositional) {
      const positionalDir = path.resolve(ROOT, arg)
      options.inputDir = positionalDir
      options.outputDir = positionalDir
      options.inputDirFromPositional = true
    }
  }

  return options
}

function printHelp() {
  console.log(`OpenAPI services 生成脚本\n\n用法:\n  kabu gen --input-dir <path> --request-import <path> [--output-dir <path>] [--rewrite-prefix <from=to>]\n  kabu gen <input-dir> --request-import <path> [--output-dir <path>] [--rewrite-prefix <from=to>]\n\n参数:\n  --input-dir      必填，扫描目录，递归查找 *.openapi.json\n  --request-import 必填，生成文件中的 request 导入路径\n  --output-dir     可选，生成目录（默认: 与 input-dir 相同）\n  --rewrite-prefix 可选，路径前缀重写规则，格式: <from=to>，可重复传入；按传入顺序命中第一条\n  --services-dir   兼容旧参数，等价于同时指定 input/output 为同一目录\n\n示例:\n  kabu gen ./src/services --request-import '@/request'\n  kabu gen --input-dir ./src/services --request-import '@/request'\n  kabu gen --input-dir ./src/services --request-import '@/request' --rewrite-prefix /member=/api/member\n  kabu gen --input-dir ./src/services --request-import '@/request' --rewrite-prefix /a/b=/c/a/c --rewrite-prefix /a=/c/a/b\n`)
}

const upperFirst = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)

function safeWord(s: unknown): string {
  return String(s)
    .replace(/[{}]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 ? upperFirst(w.toLowerCase()) : w.toLowerCase()))
    .join('')
}

function pathParamName(segment: unknown): string {
  const value = String(segment || '').trim()
  const braceMatch = value.match(/^\{(.+)\}$/)
  if (braceMatch) return braceMatch[1]
  if (value.startsWith(':') && value.length > 1) return value.slice(1)
  return ''
}

function pathSegmentToNamePart(segment: string): string {
  const paramName = pathParamName(segment)
  if (paramName) return `By${upperFirst(safeWord(paramName))}`
  return upperFirst(safeWord(segment))
}

function operationName(method: string, url: string): string {
  const parts = url.split('/').filter(Boolean).map(pathSegmentToNamePart).filter(Boolean)
  return `${method.toLowerCase()}${parts.join('')}`
}

function isValidTsIdentifier(name: string): boolean {
  return /^[$A-Z_][0-9A-Z_$]*$/i.test(name)
}

function literalToTs(value: any): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return 'unknown'
}

function appendNullUnion(tsType: string, schema: any): string {
  if (!schema) return tsType

  const nullableBy30 = schema.nullable === true
  const nullableBy31 = Array.isArray(schema.type) && schema.type.includes('null')
  if (!nullableBy30 && !nullableBy31) return tsType

  return tsType.includes('null') ? tsType : `${tsType} | null`
}

function schemaTypeToTs(type: string, schema: any, context: TsContext): string {
  switch (type) {
    case 'integer':
    case 'number':
      return 'number'
    case 'string':
      return 'string'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    case 'array': {
      if (Array.isArray(schema.prefixItems) && schema.prefixItems.length > 0) {
        const tupleItems = schema.prefixItems.map(item => schemaToTs(item, context))
        return `[${tupleItems.join(', ')}]`
      }
      return `${schemaToTs(schema.items, context)}[]`
    }
    case 'object': {
      const props = schema.properties || {}
      const keys = Object.keys(props)
      const required = new Set(schema.required || [])

      if (keys.length === 0 && schema.additionalProperties) {
        return `Record<string, ${schemaToTs(schema.additionalProperties, context)}>`
      }

      if (keys.length === 0) {
        return 'Record<string, unknown>'
      }

      const fields = keys.map(k => {
        const key = isValidTsIdentifier(k) ? k : `'${k}'`
        const optional = required.has(k) ? '' : '?'
        return `${key}${optional}: ${schemaToTs(props[k], context)}`
      })
      return `{ ${fields.join('; ')} }`
    }
    default:
      return 'unknown'
  }
}

function schemaToTs(schema: any, context: TsContext): string {
  if (typeof schema === 'boolean') {
    return schema ? 'unknown' : 'never'
  }

  if (!schema || typeof schema !== 'object') return 'unknown'

  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop()
    if (refName) {
      context.collectRef(refName)
      return refName
    }
    return 'unknown'
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return schema.oneOf.map(s => schemaToTs(s, context)).join(' | ')
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return schema.anyOf.map(s => schemaToTs(s, context)).join(' | ')
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    return schema.allOf.map(s => schemaToTs(s, context)).join(' & ')
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    return literalToTs(schema.const)
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map(literalToTs).join(' | ')
  }

  if (Array.isArray(schema.type) && schema.type.length > 0) {
    const union = schema.type.map(type => schemaTypeToTs(type, schema, context)).join(' | ')
    return appendNullUnion(union, schema)
  }

  if (typeof schema.type === 'string') {
    const ts = schemaTypeToTs(schema.type, schema, context)
    return appendNullUnion(ts, schema)
  }

  if (schema.properties || schema.additionalProperties) {
    return appendNullUnion(schemaTypeToTs('object', schema, context), schema)
  }

  return appendNullUnion('unknown', schema)
}

function emitSchemaType(name: string, schema: any, context: TsContext): string[] {
  if (typeof schema === 'boolean') {
    return [`export type ${name} = ${schema ? 'unknown' : 'never'}`, '']
  }

  if (!schema || typeof schema !== 'object') {
    return [`export type ${name} = unknown`, '']
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    return [`export type ${name} = ${literalToTs(schema.const)}`, '']
  }

  if (
    schema.type === 'object' ||
    schema.properties ||
    schema.additionalProperties ||
    (Array.isArray(schema.type) && schema.type.includes('object'))
  ) {
    const lines = [`export interface ${name} {`]
    const props: Record<string, any> = schema.properties || {}
    const required = new Set(schema.required || [])

    for (const [key, value] of Object.entries(props)) {
      const desc = (value.description || '').replace(/\n+/g, ' ').trim()
      if (desc) lines.push(`  /** ${desc} */`)
      const tsKey = isValidTsIdentifier(key) ? key : `'${key}'`
      const optional = required.has(key) ? '' : '?'
      lines.push(`  ${tsKey}${optional}: ${schemaToTs(value, context)}`)
    }

    if (Object.keys(props).length === 0 && schema.additionalProperties) {
      lines.push(`  [key: string]: ${schemaToTs(schema.additionalProperties, context)}`)
    }

    lines.push('}')
    lines.push('')
    return lines
  }

  return [`export type ${name} = ${schemaToTs(schema, context)}`, '']
}

function readJSON(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function resolveSchemaRef(schema: any, schemaMap: SchemaMap): any {
  if (!schema || !schema.$ref) return null
  const refName = schema.$ref.split('/').pop()
  if (!refName) return null
  return schemaMap[refName] || null
}

function resolveResponseDataType(schema: any, schemaMap: SchemaMap, context: TsContext): string {
  if (!schema) return 'unknown'

  const fromRef = resolveSchemaRef(schema, schemaMap)
  if (fromRef) {
    if (fromRef.type === 'object' && fromRef.properties && Object.prototype.hasOwnProperty.call(fromRef.properties, 'data')) {
      return schemaToTs(fromRef.properties.data, context)
    }
    return schemaToTs(schema, context)
  }

  if (schema.type === 'object' && schema.properties && Object.prototype.hasOwnProperty.call(schema.properties, 'data')) {
    return schemaToTs(schema.properties.data, context)
  }

  return schemaToTs(schema, context)
}

function getJsonSchemaFromContent(content: any): any {
  if (!content || typeof content !== 'object') return null

  if (content['application/json']?.schema) {
    return content['application/json'].schema
  }

  for (const [mediaType, mediaDef] of Object.entries(content as Record<string, any>)) {
    if (typeof mediaType === 'string' && mediaType.toLowerCase().includes('json') && mediaDef?.schema) {
      return mediaDef.schema
    }
  }

  return null
}

function getRequestSchema(detail: any): any {
  return getJsonSchemaFromContent(detail?.requestBody?.content)
}

function getResponseSchema(detail: any): any {
  const responses = detail?.responses || {}

  if (responses['200']) {
    const s200 = getJsonSchemaFromContent(responses['200'].content)
    if (s200) return s200
  }

  const successKeys = Object.keys(responses)
    .filter(key => /^2\d\d$/.test(key))
    .sort((a, b) => Number(a) - Number(b))

  for (const key of successKeys) {
    const schema = getJsonSchemaFromContent(responses[key]?.content)
    if (schema) return schema
  }

  const defaultSchema = getJsonSchemaFromContent(responses.default?.content)
  if (defaultSchema) return defaultSchema

  return null
}

function assertOpenApiSupported(spec: any, filePath: string): void {
  const version = String(spec?.openapi || '').trim()
  if (!version) {
    throw new Error(`文件缺少 openapi 版本字段: ${filePath}`)
  }

  if (!/^3\./.test(version)) {
    throw new Error(`仅支持 OpenAPI 3.x，当前为 ${version}: ${filePath}`)
  }
}

function parseRewriteRule(raw: unknown): RewriteRule {
  const value = String(raw || '').trim()
  const splitIndex = value.indexOf('=')
  if (!value || splitIndex <= 0 || splitIndex === value.length - 1) {
    throw new Error(`无效的 --rewrite-prefix 参数: ${raw}，期望格式 <from=to>`)
  }

  const from = value.slice(0, splitIndex).trim()
  const to = value.slice(splitIndex + 1).trim()

  return createRewriteRule(from, to, String(raw))
}

function createRewriteRule(fromRaw: unknown, toRaw: unknown, source: string = `${fromRaw}=${toRaw}`): RewriteRule {
  const from = normalizePathPrefix(fromRaw)
  const to = normalizePathPrefix(toRaw)

  if (!from.startsWith('/') || !to.startsWith('/')) {
    throw new Error(`无效的 --rewrite-prefix 参数: ${source}，from/to 都需要以 / 开头`)
  }

  return { from, to }
}

function normalizePathPrefix(value: unknown): string {
  const normalized = String(value || '').trim().replace(/\/+$/g, '')
  return normalized || '/'
}

function normalizeRewriteRules(rules: unknown): RewriteRule[] {
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

function pathStartsWithPrefix(url: string, prefix: string): boolean {
  if (prefix === '/') return url.startsWith('/')
  return url === prefix || url.startsWith(`${prefix}/`)
}

function rewritePath(url: string, pathRewrites: RewriteRule[]): string {
  if (!Array.isArray(pathRewrites) || pathRewrites.length === 0) return url

  for (const rule of pathRewrites) {
    if (pathStartsWithPrefix(url, rule.from)) {
      return `${rule.to}${url.slice(rule.from.length)}`
    }
  }

  return url
}

function quoteForSingleQuoteString(value: unknown): string {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function escapeTemplateLiteralPart(value: unknown): string {
  return String(value).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

function objectAccess(objectName: string, key: string): string {
  return isValidTsIdentifier(key) ? `${objectName}.${key}` : `${objectName}['${quoteForSingleQuoteString(key)}']`
}

function pathToTemplateLiteral(url: string, paramsObjectName: string): string {
  const parts = url.split('/').map(segment => {
    const paramName = pathParamName(segment)
    if (paramName) return `\${${objectAccess(paramsObjectName, paramName)}}`
    return escapeTemplateLiteralPart(segment)
  })
  return `\`${parts.join('/')}\``
}

function pathParamNamesFromUrl(url: string): string[] {
  return url.split('/').map(pathParamName).filter(Boolean)
}

function collectOpenApiFiles(inputDir: string): string[] {
  const matches: string[] = []

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (entry.isFile() && entry.name.endsWith('.openapi.json')) {
        matches.push(fullPath)
      }
    }
  }

  walk(inputDir)
  return matches.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

function moduleNameFromOpenApiFile(filePath: string): string {
  const fileName = path.basename(filePath)
  return fileName.slice(0, -'.openapi.json'.length)
}

function createFallbackPathParam(name: string): any {
  return {
    name,
    in: 'path',
    description: '',
    required: true,
    schema: { type: 'string' }
  }
}

function resolvePathParams(url: string, parameters: any[]): any[] {
  return pathParamNamesFromUrl(url).map(name => {
    return parameters.find(p => p.in === 'path' && p.name === name) || createFallbackPathParam(name)
  })
}

function emitParamsInterface(block: string[], paramsType: string, params: any[], context: TsContext): void {
  block.push(`export interface ${paramsType} {`)
  for (const p of params) {
    const desc = (p.description || '').replace(/\n+/g, ' ').trim()
    if (desc) block.push(`  /** ${desc} */`)
    const tsKey = isValidTsIdentifier(p.name) ? p.name : `'${p.name}'`
    const optional = p.required ? '' : '?'
    block.push(`  ${tsKey}${optional}: ${schemaToTs(p.schema, context)}`)
  }
  block.push('}')
  block.push('')
}

function queryParamsExpression(queryParams: any[], sourceName: string): string {
  if (queryParams.length === 0) return 'undefined'

  const fields = queryParams.map(param => {
    const key = isValidTsIdentifier(param.name) ? param.name : `'${quoteForSingleQuoteString(param.name)}'`
    return `${key}: ${objectAccess(sourceName, param.name)}`
  })

  return `{ ${fields.join(', ')} }`
}

function axiosConfigExpression(baseName: string, entries: Array<[string, string]>): string {
  const fields = entries.filter(([, value]) => value && value !== 'undefined')
  if (fields.length === 0) return baseName

  const merged = fields.map(([key, value]) => (key === value ? key : `${key}: ${value}`)).join(', ')
  return `{ ...${baseName}, ${merged} }`
}

function responseOnlyGenerics(responseType: string): string {
  return `<${responseType}, ${responseType}>`
}

function responseBodyGenerics(responseType: string, bodyType: string): string {
  return `<${responseType}, ${responseType}, ${bodyType}>`
}

function generateFromSpec(spec: any, moduleName: string, options: Partial<CliArgs> = {}): string {
  const pathRewrites = normalizeRewriteRules(options.pathRewrites || options.rewritePrefix)
  const { requestImport } = options
  const schemaMap: SchemaMap = { ...(spec.components?.schemas || {}) }
  const operations: Array<{ url: string; method: string; detail: any }> = []

  for (const [url, methods] of Object.entries(spec.paths || {})) {
    for (const [method, detail] of Object.entries(methods || {})) {
      if (!METHOD_MAP[method]) continue
      operations.push({ url, method, detail })
    }
  }

  const title = spec.info?.title || moduleName
  const requestImportEscaped = quoteForSingleQuoteString(requestImport)
  const lines = [
    `import type { AxiosRequestConfig } from 'axios'`,
    `import request from '${requestImportEscaped}'`,
    '',
    `/** ${title}接口（由 OpenAPI 自动提取） */`,
    ''
  ]

  const usedRefs = new Set<string>()
  const context = { collectRef: name => usedRefs.add(name) }

  const functionNames = new Set<string>()
  const operationBlocks: string[][] = []

  for (const { url, method, detail } of operations) {
    const requestUrl = rewritePath(url, pathRewrites)
    let fnName = operationName(method, url)
    if (functionNames.has(fnName)) {
      let i = 2
      while (functionNames.has(`${fnName}${i}`)) i += 1
      fnName = `${fnName}${i}`
    }
    functionNames.add(fnName)

    const summary = (detail.summary || detail.description || '').replace(/\n+/g, ' ').trim()
    const parameters = detail.parameters || []
    const pathParams = resolvePathParams(url, parameters)
    const queryParams = parameters.filter(p => p.in === 'query')
    const functionParams = [...pathParams, ...queryParams]
    const requestSchema = getRequestSchema(detail)
    const responseSchema = getResponseSchema(detail)

    const paramsType = `${upperFirst(fnName)}Params`
    const bodyType = `${upperFirst(fnName)}Body`
    const responseType = `${upperFirst(fnName)}Response`

    const block: string[] = []

    if (functionParams.length > 0) {
      emitParamsInterface(block, paramsType, functionParams, context)
    }

    if (requestSchema) {
      block.push(`export type ${bodyType} = ${schemaToTs(requestSchema, context)}`)
      block.push('')
    }

    block.push(`export type ${responseType} = ${resolveResponseDataType(responseSchema, schemaMap, context)}`)
    block.push('')

    block.push('/**')
    block.push(` * ${summary || fnName}`)
    block.push(` * ${method.toUpperCase()} ${requestUrl}`)
    block.push(' */')

    const requestMethod = METHOD_MAP[method]
    const hasDataArgument = DATA_ARGUMENT_METHODS.has(requestMethod)
    const requestUrlLiteral = pathToTemplateLiteral(requestUrl, functionParams.length > 0 ? 'params' : 'data')
    const queryParamsValue = queryParamsExpression(queryParams, 'params')
    const configWithParams = axiosConfigExpression('axiosRequestConfig', [['params', queryParamsValue]])
    const configWithParamsAndData = axiosConfigExpression('axiosRequestConfig', [
      ['params', queryParamsValue],
      ['data', 'data']
    ])

    if (functionParams.length > 0 && requestSchema) {
      block.push(`export function ${fnName}(params: ${paramsType}, data: ${bodyType}, axiosRequestConfig?: AxiosRequestConfig<${bodyType}>): Promise<${responseType}> {`)
      if (hasDataArgument) {
        block.push(`  return request.${requestMethod}${responseBodyGenerics(responseType, bodyType)}(${requestUrlLiteral}, data, ${configWithParams})`)
      } else {
        block.push(`  return request.${requestMethod}${responseBodyGenerics(responseType, bodyType)}(${requestUrlLiteral}, ${configWithParamsAndData})`)
      }
      block.push('}')
    } else if (functionParams.length > 0) {
      block.push(`export function ${fnName}(params: ${paramsType}, axiosRequestConfig?: AxiosRequestConfig): Promise<${responseType}> {`)
      if (hasDataArgument) {
        block.push(`  return request.${requestMethod}${responseOnlyGenerics(responseType)}(${requestUrlLiteral}, undefined, ${configWithParams})`)
      } else {
        block.push(`  return request.${requestMethod}${responseOnlyGenerics(responseType)}(${requestUrlLiteral}, ${configWithParams})`)
      }
      block.push('}')
    } else if (requestSchema) {
      block.push(`export function ${fnName}(data: ${bodyType}, axiosRequestConfig?: AxiosRequestConfig<${bodyType}>): Promise<${responseType}> {`)
      if (hasDataArgument) {
        block.push(`  return request.${requestMethod}${responseBodyGenerics(responseType, bodyType)}(${requestUrlLiteral}, data, axiosRequestConfig)`)
      } else {
        block.push(`  return request.${requestMethod}${responseBodyGenerics(responseType, bodyType)}(${requestUrlLiteral}, { ...axiosRequestConfig, data })`)
      }
      block.push('}')
    } else {
      block.push(`export function ${fnName}(axiosRequestConfig?: AxiosRequestConfig): Promise<${responseType}> {`)
      if (hasDataArgument) {
        block.push(`  return request.${requestMethod}${responseOnlyGenerics(responseType)}(${requestUrlLiteral}, undefined, axiosRequestConfig)`)
      } else {
        block.push(`  return request.${requestMethod}${responseOnlyGenerics(responseType)}(${requestUrlLiteral}, axiosRequestConfig)`)
      }
      block.push('}')
    }

    block.push('')
    operationBlocks.push(block)
  }

  const emitted = new Set<string>()
  const queue = [...usedRefs]

  while (queue.length > 0) {
    const name = queue.shift()
    if (!name || emitted.has(name)) continue
    emitted.add(name)

    const schema = schemaMap[name]
    const before = usedRefs.size
    lines.push(...emitSchemaType(name, schema, context))

    if (usedRefs.size > before) {
      for (const ref of usedRefs) {
        if (!emitted.has(ref) && !queue.includes(ref)) queue.push(ref)
      }
    }
  }

  lines.push(...operationBlocks.flat())
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function resolveRootPath(value: unknown, root = ROOT): string {
  return path.resolve(root, String(value || ''))
}

function normalizeGenerateOptions(options: Partial<CliArgs> = {}): NormalizedGenerateOptions {
  const root = options.root || ROOT
  const servicesDir = options.servicesDir ? resolveRootPath(options.servicesDir, root) : ''
  const inputDir = options.inputDir ? resolveRootPath(options.inputDir, root) : servicesDir
  const outputDir = options.outputDir ? resolveRootPath(options.outputDir, root) : inputDir
  const requestImport = String(options.requestImport || '').trim()
  const pathRewrites = normalizeRewriteRules(options.pathRewrites || options.rewritePrefix)

  if (!inputDir) {
    throw new Error('缺少必填参数: --input-dir <path>（或位置参数 <input-dir>）')
  }

  if (!requestImport) {
    throw new Error('缺少必填参数: --request-import <path>')
  }

  return {
    inputDir,
    outputDir,
    requestImport,
    pathRewrites,
    logger: options.logger
  }
}

function generateServices(options: Partial<CliArgs> = {}): GenerateResult {
  const args = normalizeGenerateOptions(options)
  const logger = args.logger === false ? null : args.logger || console

  if (!fs.existsSync(args.inputDir) || !fs.statSync(args.inputDir).isDirectory()) {
    throw new Error(`输入目录不存在或不是目录: ${args.inputDir}`)
  }

  ensureDir(args.outputDir)

  const openApiFiles = collectOpenApiFiles(args.inputDir)
  if (openApiFiles.length === 0) {
    throw new Error(`未找到 *.openapi.json 文件: ${args.inputDir}`)
  }

  const files: Array<{ input: string; output: string }> = []

  for (const openApiPath of openApiFiles) {
    const moduleName = moduleNameFromOpenApiFile(openApiPath)
    const outputPath = path.join(args.outputDir, `${moduleName}.ts`)

    const spec = readJSON(openApiPath)
    assertOpenApiSupported(spec, openApiPath)
    const outputCode = generateFromSpec(spec, moduleName, {
      pathRewrites: args.pathRewrites,
      requestImport: args.requestImport
    })

    fs.writeFileSync(outputPath, outputCode, 'utf8')
    files.push({ input: openApiPath, output: outputPath })
    const relativeIn = path.relative(ROOT, openApiPath)
    const relativeOut = path.relative(ROOT, outputPath)
    if (logger) logger.log(`[ok] ${relativeIn} -> ${relativeOut}`)
  }

  if (logger) logger.log('[done] services 生成完成')
  return {
    inputDir: args.inputDir,
    outputDir: args.outputDir,
    files
  }
}

function main(argv = process.argv.slice(2)): void {
  const args = parseArgs(argv)

  if (args.help) {
    printHelp()
    return
  }

  generateServices(args)
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  try {
    main()
  } catch (error) {
    console.error(`[error] ${error.message}`)
    process.exitCode = 1
  }
}

export {
  generateServices,
  generateFromSpec,
  normalizeRewriteRules,
  operationName,
  parseRewriteRule,
  rewritePath
}

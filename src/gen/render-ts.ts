import type { GenerateServicesOptions, SchemaMap, TsContext } from './types.js'
import { getRequestSchema, getResponseSchema, resolvePathParams, resolveResponseDataType } from './openapi.js'
import { normalizeRewriteRules, rewritePath } from './rewrite-rules.js'

const METHOD_MAP: Record<string, string> = {
  get: 'get',
  post: 'post',
  put: 'put',
  delete: 'delete',
  patch: 'patch'
}

const DATA_ARGUMENT_METHODS = new Set<string>(['post', 'put', 'patch'])

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

export function operationName(method: string, url: string): string {
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

export function schemaToTs(schema: any, context: TsContext): string {
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

export function generateFromSpec(spec: any, moduleName: string, options: Partial<GenerateServicesOptions> = {}): string {
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
  const context = { collectRef: (name: string) => usedRefs.add(name) }

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

    block.push(`export type ${responseType} = ${resolveResponseDataType(responseSchema, schemaMap, context, { schemaToTs })}`)
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

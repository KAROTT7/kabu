import type { RewriteRule, SchemaMap, TsContext } from './types.js'
import {
  API_RESULT_TYPE_NAME,
  getRequestSchema,
  getResponseSchema,
  resolveGenericApiResultSchema,
  resolvePathParams,
  resolveResponseDataType,
  resolveResponseRawType
} from './openapi.js'
import { rewritePath } from './rewrite-rules.js'
import { upperFirst, operationName } from './naming.js'
import { schemaToTs } from './schema-to-ts.js'
import { isValidTsIdentifier, pathToTemplateLiteral, tsObjectKey } from './ts-syntax.js'

const METHOD_MAP: Record<string, string> = {
  get: 'get',
  post: 'post',
  put: 'put',
  delete: 'delete',
  patch: 'patch'
}

const DATA_ARGUMENT_METHODS = new Set<string>(['post', 'put', 'patch'])

export interface OperationDetail {
  url: string
  method: string
  detail: any
  pathItemParameters: any[]
}

export function collectOperations(spec: any): OperationDetail[] {
  const operations: OperationDetail[] = []

  for (const [url, pathItem] of Object.entries(spec.paths || {})) {
    const pathItemObject: Record<string, any> = pathItem && typeof pathItem === 'object' ? pathItem : {}
    const pathItemParameters = Array.isArray(pathItemObject.parameters) ? pathItemObject.parameters : []

    for (const [method, detail] of Object.entries(pathItemObject)) {
      if (!METHOD_MAP[method]) continue
      operations.push({ url, method, detail, pathItemParameters })
    }
  }

  return operations
}

function parameterKey(param: any): string {
  return `${param?.in || ''}:${param?.name || ''}`
}

function mergeParameters(pathItemParameters: any[], operationParameters: any[]): any[] {
  const merged = [...pathItemParameters]

  for (const param of operationParameters) {
    const index = merged.findIndex(item => parameterKey(item) === parameterKey(param))
    if (index >= 0) {
      merged[index] = param
    } else {
      merged.push(param)
    }
  }

  return merged
}

function emitParamsInterface(block: string[], paramsType: string, params: any[], context: TsContext): void {
  block.push(`export interface ${paramsType} {`)
  for (const param of params) {
    const desc = (param.description || '').replace(/\n+/g, ' ').trim()
    if (desc) block.push(`  /** ${desc} */`)
    const tsKey = tsObjectKey(param.name)
    const optional = param.required ? '' : '?'
    block.push(`  ${tsKey}${optional}: ${schemaToTs(param.schema, context)}`)
  }
  block.push('}')
  block.push('')
}

function axiosConfigExpression(baseName: string, entries: Array<[string, string]>): string {
  const fields = entries.filter(([, value]) => value && value !== 'undefined')
  if (fields.length === 0) return baseName

  const merged = fields.map(([key, value]) => (key === value ? key : `${key}: ${value}`)).join(', ')
  return `{ ...${baseName}, ${merged} }`
}

function responseOnlyGenerics(responseType: string, rawResponseType: string): string {
  return `<${responseType}, ${rawResponseType}>`
}

function responseBodyGenerics(responseType: string, rawResponseType: string, bodyType: string): string {
  return `<${responseType}, ${rawResponseType}, ${bodyType}>`
}

function responseResolvedType(responseType: string): string {
  return `${responseType} | undefined`
}

function pathArgumentNameFallback(value: unknown): string {
  const words = String(value || '')
    .replace(/[{}]/g, '')
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)

  if (words.length === 0) return 'Value'

  return words
    .map((word, index) => {
      const normalized = /^[A-Z0-9]+$/.test(word) ? word.toLowerCase() : word
      return index === 0 ? normalized[0].toLowerCase() + normalized.slice(1) : upperFirst(normalized)
    })
    .join('')
}

function pathArgumentBaseName(paramName: string): string {
  const rawName = String(paramName || '').trim()
  if (isValidTsIdentifier(rawName)) return rawName

  const fallback = pathArgumentNameFallback(rawName)
  if (isValidTsIdentifier(fallback)) return fallback

  const prefixedFallback = `path${upperFirst(fallback)}`
  return isValidTsIdentifier(prefixedFallback) ? prefixedFallback : 'pathValue'
}

function pathArgumentNames(pathParams: any[], reservedNames: string[]): Map<string, string> {
  const names = new Map<string, string>()
  const used = new Set<string>(reservedNames)

  for (const param of pathParams) {
    const paramName = String(param.name || '')
    const baseName = pathArgumentBaseName(paramName)
    let argName = baseName
    let index = 2

    if (used.has(argName)) {
      argName = `${baseName}Path`
    }

    while (used.has(argName)) {
      argName = `${baseName}Path${index}`
      index += 1
    }

    used.add(argName)
    names.set(paramName, argName)
  }

  return names
}

function resolveOperationName(method: string, url: string, functionNames: Map<string, string>): string {
  const fnName = operationName(method, url)
  const source = `${method.toUpperCase()} ${url}`
  const existing = functionNames.get(fnName)

  if (existing) {
    throw new Error(`接口函数名冲突: ${fnName}，${existing} 与 ${source} 生成了同名函数`)
  }

  functionNames.set(fnName, source)
  return fnName
}

export function renderOperationBlock(
  operation: OperationDetail,
  schemaMap: SchemaMap,
  context: TsContext,
  pathRewrites: RewriteRule[],
  helperSchemas: Map<string, any>,
  functionNames: Map<string, string>
): string[] {
  const { url, method, detail } = operation
  const requestMethod = METHOD_MAP[method]
  const requestUrl = rewritePath(url, pathRewrites)
  const fnName = resolveOperationName(method, url, functionNames)
  const summary = (detail.summary || detail.description || '').replace(/\n+/g, ' ').trim()
  const parameters = mergeParameters(operation.pathItemParameters, detail.parameters || [])
  const pathParams = resolvePathParams(url, parameters)
  const queryParams = parameters.filter(param => param.in === 'query')
  const requestSchema = getRequestSchema(detail)
  const responseSchema = getResponseSchema(detail)
  const reservedPathArgNames = [
    'axiosRequestConfig',
    ...(queryParams.length > 0 ? ['params'] : []),
    ...(requestSchema ? ['data'] : [])
  ]
  const pathArgNames = pathArgumentNames(pathParams, reservedPathArgNames)

  const paramsType = `${upperFirst(fnName)}Params`
  const bodyType = `${upperFirst(fnName)}Body`
  const responseType = `${upperFirst(fnName)}Response`
  const genericApiResultSchema = resolveGenericApiResultSchema(responseSchema, schemaMap)

  const block: string[] = []

  if (queryParams.length > 0) {
    emitParamsInterface(block, paramsType, queryParams, context)
  }

  if (requestSchema) {
    block.push(`export type ${bodyType} = ${schemaToTs(requestSchema, context)}`)
    block.push('')
  }

  const rawResponseType = genericApiResultSchema
    ? `${API_RESULT_TYPE_NAME}<${responseType}>`
    : resolveResponseRawType(responseSchema, context, { schemaToTs })

  if (genericApiResultSchema) {
    helperSchemas.set(API_RESULT_TYPE_NAME, genericApiResultSchema)
  }

  block.push(`export type ${responseType} = ${resolveResponseDataType(responseSchema, schemaMap, context, { schemaToTs })}`)
  block.push('')

  block.push('/**')
  block.push(` * ${summary || fnName}`)
  block.push(` * ${method.toUpperCase()} ${requestUrl}`)
  block.push(' */')

  const hasDataArgument = DATA_ARGUMENT_METHODS.has(requestMethod)
  const requestUrlLiteral = pathToTemplateLiteral(requestUrl, Object.fromEntries(pathArgNames))
  const queryParamsValue = queryParams.length > 0 ? 'params' : 'undefined'
  const configWithParams = axiosConfigExpression('axiosRequestConfig', [['params', queryParamsValue]])
  const configWithParamsAndData = axiosConfigExpression('axiosRequestConfig', [
    ['params', queryParamsValue],
    ['data', 'data']
  ])
  const pathArguments = pathParams.map(param => `${pathArgNames.get(String(param.name || ''))}: string | number`)
  const functionArguments = [
    ...pathArguments,
    ...(queryParams.length > 0 ? [`params: ${paramsType}`] : []),
    ...(requestSchema ? [`data: ${bodyType}`] : []),
    requestSchema ? `axiosRequestConfig?: AxiosRequestConfig<${bodyType}>` : 'axiosRequestConfig?: AxiosRequestConfig'
  ]
  const signature = `export function ${fnName}(${functionArguments.join(', ')}): Promise<${responseResolvedType(responseType)}> {`

  if (requestSchema) {
    block.push(signature)
    if (hasDataArgument) {
      block.push(`  return request.${requestMethod}${responseBodyGenerics(responseType, rawResponseType, bodyType)}(${requestUrlLiteral}, data, ${configWithParams})`)
    } else {
      block.push(`  return request.${requestMethod}${responseBodyGenerics(responseType, rawResponseType, bodyType)}(${requestUrlLiteral}, ${configWithParamsAndData})`)
    }
    block.push('}')
  } else {
    block.push(signature)
    if (hasDataArgument) {
      block.push(`  return request.${requestMethod}${responseOnlyGenerics(responseType, rawResponseType)}(${requestUrlLiteral}, undefined, ${configWithParams})`)
    } else {
      block.push(`  return request.${requestMethod}${responseOnlyGenerics(responseType, rawResponseType)}(${requestUrlLiteral}, ${configWithParams})`)
    }
    block.push('}')
  }

  block.push('')
  return block
}

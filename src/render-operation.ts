import type { RewriteRule, SchemaMap, TsContext } from './types.js'
import { getRequestSchema, getResponseSchema, resolvePathParams, resolveResponseDataType } from './openapi.js'
import { rewritePath } from './rewrite-rules.js'
import { upperFirst, operationName } from './naming.js'
import { schemaToTs } from './schema-to-ts.js'
import { objectAccess, pathToTemplateLiteral, tsObjectKey } from './ts-syntax.js'

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

function queryParamsExpression(queryParams: any[], sourceName: string): string {
  if (queryParams.length === 0) return 'undefined'

  const fields = queryParams.map(param => {
    const key = tsObjectKey(param.name)
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
  return block
}

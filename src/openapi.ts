import fs from 'node:fs'
import type { SchemaMap, SchemaRenderer, TsContext } from './types.js'
import { pathParamName } from './naming.js'

export const API_RESULT_TYPE_NAME = 'ApiResult'

export function readJSON(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function resolveSchemaRef(schema: any, schemaMap: SchemaMap): any {
  if (!schema || !schema.$ref) return null
  const refName = schema.$ref.split('/').pop()
  if (!refName) return null
  return schemaMap[refName] || null
}

export function resolveResponseDataType(
  schema: any,
  schemaMap: SchemaMap,
  context: TsContext,
  renderer: SchemaRenderer
): string {
  if (!schema) return 'unknown'

  const fromRef = resolveSchemaRef(schema, schemaMap)
  if (fromRef) {
    if (fromRef.type === 'object' && fromRef.properties && Object.prototype.hasOwnProperty.call(fromRef.properties, 'data')) {
      return renderer.schemaToTs(fromRef.properties.data, context)
    }
    return renderer.schemaToTs(schema, context)
  }

  if (schema.type === 'object' && schema.properties && Object.prototype.hasOwnProperty.call(schema.properties, 'data')) {
    return renderer.schemaToTs(schema.properties.data, context)
  }

  return renderer.schemaToTs(schema, context)
}

export function resolveResponseRawType(schema: any, context: TsContext, renderer: SchemaRenderer): string {
  if (!schema) return 'unknown'
  return renderer.schemaToTs(schema, context)
}

export function resolveGenericApiResultSchema(schema: any, schemaMap: SchemaMap): any {
  const resolved = resolveSchemaRef(schema, schemaMap) || schema
  if (!resolved || typeof resolved !== 'object') return null

  const props = resolved.properties
  if (!props || typeof props !== 'object' || resolved.additionalProperties) {
    return null
  }

  const keys = Object.keys(props)
  if (!keys.includes('code') || !keys.includes('data')) {
    return null
  }

  if (!keys.includes('message') && !keys.includes('msg')) {
    return null
  }

  const allowedKeys = new Set(['code', 'message', 'msg', 'data'])
  if (keys.some(key => !allowedKeys.has(key))) {
    return null
  }

  return resolved
}

export function getJsonSchemaFromContent(content: any): any {
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

export function getRequestSchema(detail: any): any {
  return getJsonSchemaFromContent(detail?.requestBody?.content)
}

export function getResponseSchema(detail: any): any {
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

export function assertOpenApiSupported(spec: any, filePath: string): void {
  const version = String(spec?.openapi || '').trim()
  if (!version) {
    throw new Error(`文件缺少 openapi 版本字段: ${filePath}`)
  }

  if (!/^3\./.test(version)) {
    throw new Error(`仅支持 OpenAPI 3.x，当前为 ${version}: ${filePath}`)
  }
}

function pathParamNamesFromUrl(url: string): string[] {
  return url.split('/').map(pathParamName).filter(Boolean)
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

export function resolvePathParams(url: string, parameters: any[]): any[] {
  return pathParamNamesFromUrl(url).map(name => {
    return parameters.find(p => p.in === 'path' && p.name === name) || createFallbackPathParam(name)
  })
}

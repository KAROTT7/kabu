import type { TsContext } from './types.js'
import { literalToTs, tsObjectKey } from './ts-syntax.js'

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

      const fields = keys.map(key => {
        const tsKey = tsObjectKey(key)
        const optional = required.has(key) ? '' : '?'
        return `${tsKey}${optional}: ${schemaToTs(props[key], context)}`
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
    return appendNullUnion(schema.oneOf.map(item => schemaToTs(item, context)).join(' | '), schema)
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return appendNullUnion(schema.anyOf.map(item => schemaToTs(item, context)).join(' | '), schema)
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    return appendNullUnion(schema.allOf.map(item => schemaToTs(item, context)).join(' & '), schema)
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
    const tsType = schemaTypeToTs(schema.type, schema, context)
    return appendNullUnion(tsType, schema)
  }

  if (schema.properties || schema.additionalProperties) {
    return appendNullUnion(schemaTypeToTs('object', schema, context), schema)
  }

  return appendNullUnion('unknown', schema)
}

export function emitSchemaType(name: string, schema: any, context: TsContext): string[] {
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
      const tsKey = tsObjectKey(key)
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

export function emitGenericApiResultType(name: string, schema: any, context: TsContext): string[] {
  const lines = [`export interface ${name}<T> {`]
  const props: Record<string, any> = schema?.properties || {}
  const required = new Set(schema?.required || [])

  for (const [key, value] of Object.entries(props)) {
    const desc = (value.description || '').replace(/\n+/g, ' ').trim()
    if (desc) lines.push(`  /** ${desc} */`)
    const tsKey = tsObjectKey(key)
    const optional = required.has(key) ? '' : '?'
    const tsType = key === 'data' ? 'T' : schemaToTs(value, context)
    lines.push(`  ${tsKey}${optional}: ${tsType}`)
  }

  lines.push('}')
  lines.push('')
  return lines
}

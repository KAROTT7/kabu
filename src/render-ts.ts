import type { GenerateServicesOptions, SchemaMap } from './types.js'
import { collectOperations, renderOperationBlock } from './render-operation.js'
import { normalizeRewriteRules } from './rewrite-rules.js'
import { emitGenericApiResultType, emitSchemaType } from './schema-to-ts.js'

export { operationName } from './naming.js'
export { schemaToTs } from './schema-to-ts.js'

export interface SharedTypeEntry {
  schema: any
  schemaMap: SchemaMap
}

export interface GenerateFromSpecRenderOptions extends Partial<GenerateServicesOptions> {
  sharedTypeNames?: Iterable<string>
  sharedTypeImportPath?: string
}

export interface GenerateFromSpecResult {
  code: string
  helperSchemas: Map<string, any>
  schemaMap: SchemaMap
}

function fileHeaderLines(fileHeader: unknown): string[] {
  const normalized = String(fileHeader || '').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim()
  return normalized ? normalized.split('\n') : []
}

function normalizeSharedTypeNames(value: Iterable<string> | undefined): Set<string> {
  return new Set(value || [])
}

function sharedTypeImportLine(typeNames: string[], importPath: string): string {
  const names = [...typeNames].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')).join(', ')
  return `import type { ${names} } from '${importPath}'`
}

function referencedSchema(name: string, entries: Map<string, SharedTypeEntry>): any {
  for (const entry of entries.values()) {
    if (entry.schemaMap[name]) return entry.schemaMap[name]
  }
  return null
}

export function generateSharedTypes(entries: Map<string, SharedTypeEntry>): string {
  const lines = ['/** 通用接口类型（由 OpenAPI 自动提取） */', '']
  const usedRefs = new Set<string>()
  const context = { collectRef: (name: string) => usedRefs.add(name) }
  const entryNames = [...entries.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))

  for (const name of entryNames) {
    const entry = entries.get(name)
    if (entry) lines.push(...emitGenericApiResultType(name, entry.schema, context))
  }

  const emitted = new Set(entryNames)
  const queue = [...usedRefs]

  while (queue.length > 0) {
    const name = queue.shift()
    if (!name || emitted.has(name)) continue
    emitted.add(name)

    const schema = referencedSchema(name, entries)
    const before = usedRefs.size
    lines.push(...emitSchemaType(name, schema, context))

    if (usedRefs.size > before) {
      for (const ref of usedRefs) {
        if (!emitted.has(ref) && !queue.includes(ref)) queue.push(ref)
      }
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`
}

export function generateFromSpecWithMeta(
  spec: any,
  moduleName: string,
  options: GenerateFromSpecRenderOptions = {}
): GenerateFromSpecResult {
  const pathRewrites = normalizeRewriteRules(options.pathRewrites || options.rewrite || options.rewritePrefix)
  const schemaMap: SchemaMap = { ...(spec.components?.schemas || {}) }
  const operations = collectOperations(spec)
  const title = spec.info?.title || moduleName
  const sharedTypeNames = normalizeSharedTypeNames(options.sharedTypeNames)

  const usedRefs = new Set<string>()
  const context = { collectRef: (name: string) => usedRefs.add(name) }
  const functionNames = new Map<string, string>()
  const helperSchemas = new Map<string, any>()
  const operationBlocks = operations.map(operation => {
    return renderOperationBlock(operation, schemaMap, context, pathRewrites, helperSchemas, functionNames)
  })

  const importedHelperNames = [...helperSchemas.keys()].filter(name => sharedTypeNames.has(name))
  const lines = [
    ...fileHeaderLines(options.fileHeader),
    ...(importedHelperNames.length > 0 ? [sharedTypeImportLine(importedHelperNames, options.sharedTypeImportPath || './interface')] : []),
    '',
    `/** ${title}接口（由 OpenAPI 自动提取） */`,
    ''
  ]

  for (const [name, schema] of helperSchemas) {
    if (sharedTypeNames.has(name)) continue
    lines.push(...emitGenericApiResultType(name, schema, context))
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
  return {
    code: `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`,
    helperSchemas,
    schemaMap
  }
}

export function generateFromSpec(spec: any, moduleName: string, options: Partial<GenerateServicesOptions> = {}): string {
  return generateFromSpecWithMeta(spec, moduleName, options).code
}

import type { GenerateServicesOptions, SchemaMap } from './types.js'
import { collectOperations, renderOperationBlock } from './render-operation.js'
import { normalizeRewriteRules } from './rewrite-rules.js'
import { emitSchemaType } from './schema-to-ts.js'
import { quoteForSingleQuoteString } from './ts-syntax.js'

export { operationName } from './naming.js'
export { schemaToTs } from './schema-to-ts.js'

export function generateFromSpec(spec: any, moduleName: string, options: Partial<GenerateServicesOptions> = {}): string {
  const pathRewrites = normalizeRewriteRules(options.pathRewrites || options.rewritePrefix)
  const { requestImport } = options
  const schemaMap: SchemaMap = { ...(spec.components?.schemas || {}) }
  const operations = collectOperations(spec)
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
  const operationBlocks = operations.map(operation => {
    return renderOperationBlock(operation, schemaMap, context, pathRewrites, functionNames)
  })

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

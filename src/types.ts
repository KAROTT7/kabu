export type Logger = Pick<Console, 'log'> | false
export type GenerateMode = 'update' | 'full'

export interface RewriteRule {
  from: string
  to: string
}

export type RewriteInput = string | [unknown, unknown] | { from?: unknown; to?: unknown }

export interface GenerateServicesOptions {
  pathRewrites?: RewriteRule[]
  inputDir?: string
  baselineDir?: string
  outputDir?: string
  fileHeader?: string
  mode?: GenerateMode
  rewrite?: RewriteInput | RewriteInput[]
  rewritePrefix?: RewriteInput | RewriteInput[]
  root?: string
  logger?: Logger
}

export interface NormalizedGenerateOptions {
  inputDir: string
  baselineDir: string
  outputDir: string
  fileHeader: string
  pathRewrites: RewriteRule[]
  mode: GenerateMode
  logger?: Logger
}

export interface GenerateResult {
  inputDir: string
  baselineDir: string
  outputDir: string
  mode: GenerateMode
  files: Array<{ input: string; output: string }>
}

export interface TsContext {
  collectRef(name: string): void
}

export type SchemaMap = Record<string, any>

export interface SchemaRenderer {
  schemaToTs(schema: any, context: TsContext): string
}

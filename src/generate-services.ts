import fs from 'node:fs'
import path from 'node:path'
import { assertOpenApiSupported, readJSON } from './openapi.js'
import { generateFromSpec } from './render-ts.js'
import { normalizeRewriteRules } from './rewrite-rules.js'
import type { GenerateResult, GenerateServicesOptions, NormalizedGenerateOptions } from './types.js'

const ROOT = process.cwd()

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function resolveRootPath(value: unknown, root = ROOT): string {
  return path.resolve(root, String(value || ''))
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

function assertUniqueModuleNames(openApiFiles: string[], root: string): void {
  const seen = new Map<string, string>()

  for (const filePath of openApiFiles) {
    const moduleName = moduleNameFromOpenApiFile(filePath)
    const existing = seen.get(moduleName)
    if (existing) {
      throw new Error(
        `OpenAPI 文件名冲突，都会生成 ${moduleName}.ts: ${path.relative(root, existing)} 和 ${path.relative(root, filePath)}`
      )
    }
    seen.set(moduleName, filePath)
  }
}

function normalizeFileHeader(value: unknown): string {
  return String(value || '').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim()
}

function normalizeGenerateOptions(options: Partial<GenerateServicesOptions> = {}): NormalizedGenerateOptions {
  const root = options.root || ROOT
  const inputDir = options.inputDir ? resolveRootPath(options.inputDir, root) : ''
  const outputDir = options.outputDir ? resolveRootPath(options.outputDir, root) : inputDir
  const fileHeader = normalizeFileHeader(options.fileHeader)
  const pathRewrites = normalizeRewriteRules(options.pathRewrites || options.rewrite || options.rewritePrefix)

  if (!inputDir) {
    throw new Error('缺少必填参数: --input-dir <path>（或位置参数 <input-dir>）')
  }

  if (!fileHeader) {
    throw new Error('缺少必填参数: --file-header <code>')
  }

  return {
    inputDir,
    outputDir,
    fileHeader,
    pathRewrites,
    logger: options.logger
  }
}

export function generateServices(options: Partial<GenerateServicesOptions> = {}): GenerateResult {
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
  assertUniqueModuleNames(openApiFiles, ROOT)

  const files: Array<{ input: string; output: string }> = []

  for (const openApiPath of openApiFiles) {
    const moduleName = moduleNameFromOpenApiFile(openApiPath)
    const outputPath = path.join(args.outputDir, `${moduleName}.ts`)

    const spec = readJSON(openApiPath)
    assertOpenApiSupported(spec, openApiPath)
    const outputCode = generateFromSpec(spec, moduleName, {
      pathRewrites: args.pathRewrites,
      fileHeader: args.fileHeader
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

export type { GenerateResult, GenerateServicesOptions, NormalizedGenerateOptions }

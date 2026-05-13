import fs from 'node:fs'
import path from 'node:path'
import { assertOpenApiSupported, readJSON } from './openapi.js'
import { syncModuleSpecs } from './module-baseline.js'
import { generateFromSpec } from './render-ts.js'
import { normalizeRewriteRules } from './rewrite-rules.js'
import type { GenerateMode, GenerateResult, GenerateServicesOptions, NormalizedGenerateOptions } from './types.js'

const ROOT = process.cwd()

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function clearDirContents(dir: string): void {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return

  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true })
  }
}

function resolveRootPath(value: unknown, root = ROOT): string {
  return path.resolve(root, String(value || ''))
}

function collectOpenApiFiles(inputDir: string, excludedDirs: string[] = []): string[] {
  const matches: string[] = []
  const excluded = excludedDirs.map(dir => path.resolve(dir))

  function walk(currentDir: string): void {
    const resolvedCurrentDir = path.resolve(currentDir)
    if (excluded.includes(resolvedCurrentDir)) return

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

function normalizeMode(value: unknown): GenerateMode {
  if (value == null || value === '') return 'update'
  const mode = String(value).trim().toLowerCase()
  if (mode === 'update' || mode === 'full') return mode
  throw new Error(`无效的 --mode 参数: ${String(value)}，仅支持 update 或 full`)
}

function isSameOrSubPath(targetPath: string, basePath: string): boolean {
  const relative = path.relative(basePath, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function assertFullModeSafe(inputDir: string, dirsToClear: string[]): void {
  for (const dir of dirsToClear) {
    if (isSameOrSubPath(inputDir, dir)) {
      throw new Error(`full 模式要求输入目录不能位于将被清空的目录内: ${inputDir} -> ${dir}`)
    }
  }
}

function normalizeFileHeader(value: unknown): string {
  return String(value || '').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim()
}

function normalizeGenerateOptions(options: Partial<GenerateServicesOptions> = {}): NormalizedGenerateOptions {
  const root = options.root || ROOT
  const inputDir = options.inputDir ? resolveRootPath(options.inputDir, root) : ''
  const outputDir = options.outputDir ? resolveRootPath(options.outputDir, root) : ''
  const baselineDir = options.baselineDir ? resolveRootPath(options.baselineDir, root) : ''
  const fileHeader = normalizeFileHeader(options.fileHeader)
  const pathRewrites = normalizeRewriteRules(options.pathRewrites || options.rewrite || options.rewritePrefix)
  const mode = normalizeMode(options.mode)

  if (!inputDir) {
    throw new Error('缺少必填参数: --input-dir <path>（或位置参数 <input-dir>）')
  }

  if (!baselineDir) {
    throw new Error('缺少必填参数: --baseline-dir <path>')
  }

  if (!outputDir) {
    throw new Error('缺少必填参数: --output-dir <path>')
  }

  if (!fileHeader) {
    throw new Error('缺少必填参数: --file-header <code>')
  }

  return {
    inputDir,
    outputDir,
    baselineDir,
    fileHeader,
    pathRewrites,
    mode,
    logger: options.logger
  }
}

export function generateServices(options: Partial<GenerateServicesOptions> = {}): GenerateResult {
  const args = normalizeGenerateOptions(options)
  const logger = args.logger === false ? null : args.logger || console

  if (!fs.existsSync(args.inputDir) || !fs.statSync(args.inputDir).isDirectory()) {
    throw new Error(`输入目录不存在或不是目录: ${args.inputDir}`)
  }

  if (args.mode === 'full') {
    assertFullModeSafe(args.inputDir, [args.baselineDir, args.outputDir])
  }

  ensureDir(args.baselineDir)
  ensureDir(args.outputDir)

  const openApiFiles = collectOpenApiFiles(args.inputDir, [args.baselineDir])
  if (openApiFiles.length === 0) {
    throw new Error(`未找到 *.openapi.json 文件: ${args.inputDir}`)
  }

  const inputSpecs = openApiFiles.map(filePath => {
    const spec = readJSON(filePath)
    assertOpenApiSupported(spec, filePath)
    return { filePath, spec }
  })

  if (args.mode === 'full') {
    clearDirContents(args.baselineDir)
    if (args.outputDir !== args.baselineDir) {
      clearDirContents(args.outputDir)
    }
  }

  const synced = syncModuleSpecs({
    baselineDir: args.baselineDir,
    inputSpecs,
    outputDir: args.outputDir,
    root: ROOT,
    mode: args.mode,
    logger
  })

  if (synced.moduleSpecs.length === 0) {
    throw new Error(`未找到可生成的模块接口: ${args.inputDir}`)
  }

  const files: Array<{ input: string; output: string }> = []

  for (const moduleSpec of synced.moduleSpecs) {
    const outputPath = path.join(args.outputDir, `${moduleSpec.moduleName}.ts`)
    const outputCode = generateFromSpec(moduleSpec.spec, moduleSpec.moduleName, {
      pathRewrites: args.pathRewrites,
      fileHeader: args.fileHeader
    })

    fs.writeFileSync(outputPath, outputCode, 'utf8')
    files.push({ input: moduleSpec.filePath, output: outputPath })
    const relativeIn = path.relative(ROOT, moduleSpec.filePath)
    const relativeOut = path.relative(ROOT, outputPath)
    if (logger) logger.log(`[ok] ${relativeIn} -> ${relativeOut}`)
  }

  if (logger) logger.log('[done] services 生成完成')
  return {
    inputDir: args.inputDir,
    outputDir: args.outputDir,
    baselineDir: args.baselineDir,
    mode: args.mode,
    files
  }
}

export type { GenerateResult, GenerateServicesOptions, NormalizedGenerateOptions }

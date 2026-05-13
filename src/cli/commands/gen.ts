import type { CAC } from 'cac'
import { generateServices, loadConfigFile } from '../../index.js'
import type { GenerateServicesOptions } from '../../index.js'

interface GenCommandOptions {
  inputDir?: string
  baselineDir?: string
  outputDir?: string
  fileHeader?: string
  mode?: 'update' | 'full'
  rewrite?: string | string[]
  config?: string
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function commandLineOptions(inputDir: string | undefined, options: GenCommandOptions): Partial<GenerateServicesOptions> {
  const result: Partial<GenerateServicesOptions> = {}
  const commandInputDir = options.inputDir || inputDir

  if (commandInputDir) result.inputDir = commandInputDir
  if (options.baselineDir) result.baselineDir = options.baselineDir
  if (options.outputDir) result.outputDir = options.outputDir
  if (options.fileHeader) result.fileHeader = options.fileHeader
  if (options.mode) result.mode = options.mode
  if (hasOwn(options, 'rewrite') && options.rewrite != null) result.rewrite = options.rewrite

  return result
}

function mergeGenOptions(
  configOptions: Partial<GenerateServicesOptions>,
  cliOptions: Partial<GenerateServicesOptions>
): Partial<GenerateServicesOptions> {
  const merged = {
    ...configOptions,
    ...cliOptions
  } as Partial<GenerateServicesOptions>

  if (hasOwn(cliOptions, 'rewrite')) {
    delete merged.pathRewrites
    delete merged.rewritePrefix
  }

  return merged
}

export function registerGenCommand(cli: CAC): void {
  cli
    .command('[inputDir]', 'Generate TypeScript services from OpenAPI JSON files')
    .usage('[inputDir] --baseline-dir <dir> --output-dir <dir> --file-header <code> [options]')
    .option('-c, --config <file>', 'Use specified config file')
    .option('--input-dir <dir>', 'Required. Directory to scan for *.openapi.json files')
    .option('--baseline-dir <dir>', 'Required. Directory to store merged module baseline OpenAPI files')
    .option('--output-dir <dir>', 'Required. Directory to write generated .ts files')
    .option('--file-header <code>', 'Code inserted at the top of generated files')
    .option('--mode <mode>', 'Generate mode: update or full')
    .option('--rewrite <from=to>', 'Rewrite request path prefix; can be repeated')
    .example(`kabu -c ./kabu.config.mjs`)
    .example(`kabu --input-dir ./openapi-fragments --baseline-dir ./openapi-baseline --output-dir ./src/services --file-header "import type { AxiosRequestConfig } from 'axios'\\nimport request from '@/request'"`)
    .example(`kabu ./openapi --baseline-dir ./openapi-baseline --output-dir ./src/services --mode full --file-header "import type { AxiosRequestConfig } from 'axios'\\nimport request from '@/request'"`)
    .example(`kabu ./openapi --baseline-dir ./openapi-baseline --file-header "import type { AxiosRequestConfig } from 'axios'\\nimport request from '@/request'" --rewrite /a/b=/c/a/c --rewrite /a=/c/a/b`)
    .action(async (inputDir: string | undefined, options: GenCommandOptions) => {
      try {
        const loadedConfig = await loadConfigFile(options.config)
        const cliOptions = commandLineOptions(inputDir, options)

        generateServices(mergeGenOptions(loadedConfig.config, cliOptions))
      } catch (error) {
        console.error(`[error] ${error instanceof Error ? error.message : String(error)}`)
        process.exitCode = 1
      }
    })
}

import type { CAC } from 'cac'
import { generateServices } from '../../index.js'

interface GenCommandOptions {
  inputDir?: string
  baselineDir?: string
  outputDir?: string
  fileHeader?: string
  mode?: 'update' | 'full'
  rewrite?: string | string[]
}

export function registerGenCommand(cli: CAC): void {
  cli
    .command('gen [inputDir]', 'Generate TypeScript services from OpenAPI JSON files')
    .alias('gen-services')
    .usage('[inputDir] --file-header <code> [options]')
    .option('--input-dir <dir>', 'Directory to scan for *.openapi.json files')
    .option('--baseline-dir <dir>', 'Directory to store merged module baseline OpenAPI files')
    .option('--output-dir <dir>', 'Directory to write generated .ts files')
    .option('--file-header <code>', 'Code inserted at the top of generated files')
    .option('--mode <mode>', 'Generate mode: update or full')
    .option('--rewrite <from=to>', 'Rewrite request path prefix; can be repeated')
    .example(`kabu gen --input-dir ./openapi-fragments --baseline-dir ./openapi-baseline --output-dir ./src/services --file-header "import type { AxiosRequestConfig } from 'axios'\\nimport request from '@/request'"`)
    .example(`kabu gen ./openapi --baseline-dir ./openapi-baseline --output-dir ./src/services --mode full --file-header "import type { AxiosRequestConfig } from 'axios'\\nimport request from '@/request'"`)
    .example(`kabu gen ./openapi --baseline-dir ./openapi-baseline --file-header "import type { AxiosRequestConfig } from 'axios'\\nimport request from '@/request'" --rewrite /a/b=/c/a/c --rewrite /a=/c/a/b`)
    .action((inputDir: string | undefined, options: GenCommandOptions) => {
      try {
        generateServices({
          inputDir: options.inputDir || inputDir,
          baselineDir: options.baselineDir,
          outputDir: options.outputDir,
          fileHeader: options.fileHeader,
          mode: options.mode,
          rewrite: options.rewrite
        })
      } catch (error) {
        console.error(`[error] ${error instanceof Error ? error.message : String(error)}`)
        process.exitCode = 1
      }
    })
}

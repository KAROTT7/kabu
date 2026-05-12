import type { CAC } from 'cac'
import { generateServices } from '../../index.js'

interface GenCommandOptions {
  inputDir?: string
  outputDir?: string
  fileHeader?: string
  rewritePrefix?: string | string[]
}

export function registerGenCommand(cli: CAC): void {
  cli
    .command('gen [inputDir]', 'Generate TypeScript services from OpenAPI JSON files')
    .alias('gen-services')
    .usage('[inputDir] --file-header <code> [options]')
    .option('--input-dir <dir>', 'Directory to scan for *.openapi.json files')
    .option('--output-dir <dir>', 'Directory to write generated .ts files')
    .option('--file-header <code>', 'Code inserted at the top of generated files')
    .option('--rewrite-prefix <from=to>', 'Rewrite request path prefix; can be repeated')
    .example(`kabu gen ./src/services --file-header "import type { AxiosRequestConfig } from 'axios'\\nimport request from '@/request'"`)
    .example(`kabu gen --input-dir ./openapi --output-dir ./src/services --file-header "import type { AxiosRequestConfig } from 'axios'\\nimport request from '@/request'"`)
    .example(`kabu gen ./openapi --file-header "import type { AxiosRequestConfig } from 'axios'\\nimport request from '@/request'" --rewrite-prefix /a/b=/c/a/c --rewrite-prefix /a=/c/a/b`)
    .action((inputDir: string | undefined, options: GenCommandOptions) => {
      try {
        generateServices({
          inputDir: options.inputDir || inputDir,
          outputDir: options.outputDir,
          fileHeader: options.fileHeader,
          rewritePrefix: options.rewritePrefix
        })
      } catch (error) {
        console.error(`[error] ${error instanceof Error ? error.message : String(error)}`)
        process.exitCode = 1
      }
    })
}

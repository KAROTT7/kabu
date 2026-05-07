import type { CAC } from 'cac'
import { generateServices } from '../gen/index.js'

interface GenCommandOptions {
  inputDir?: string
  outputDir?: string
  requestImport?: string
  rewritePrefix?: string | string[]
}

export function registerGenCommand(cli: CAC): void {
  cli
    .command('gen [inputDir]', 'Generate TypeScript services from OpenAPI JSON files')
    .alias('gen-services')
    .usage('[inputDir] --request-import <path> [options]')
    .option('--input-dir <dir>', 'Directory to scan for *.openapi.json files')
    .option('--output-dir <dir>', 'Directory to write generated .ts files')
    .option('--request-import <path>', 'Import path for the project request wrapper')
    .option('--rewrite-prefix <from=to>', 'Rewrite request path prefix; can be repeated')
    .example('kabu gen ./src/services --request-import @/request')
    .example('kabu gen --input-dir ./openapi --output-dir ./src/services --request-import @/request')
    .example('kabu gen ./openapi --request-import @/request --rewrite-prefix /a/b=/c/a/c --rewrite-prefix /a=/c/a/b')
    .action((inputDir: string | undefined, options: GenCommandOptions) => {
      try {
        generateServices({
          inputDir: options.inputDir || inputDir,
          outputDir: options.outputDir,
          requestImport: options.requestImport,
          rewritePrefix: options.rewritePrefix
        })
      } catch (error) {
        console.error(`[error] ${error instanceof Error ? error.message : String(error)}`)
        process.exitCode = 1
      }
    })
}

import { cac } from 'cac'
import type { CAC } from 'cac'
import { registerGenCommand } from './commands/gen.js'

const version = '0.1.0'

export function createCli(): CAC {
  const cli = cac('kabu')

  registerGenCommand(cli)

  cli.version(version)
  cli.help()

  cli.on('command:*', () => {
    console.error(`Unknown command: ${cli.args.join(' ')}`)
    cli.outputHelp()
    process.exitCode = 1
  })

  return cli
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value) && typeof (value as PromiseLike<unknown>).then === 'function'
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const cli = createCli()

  cli.parse(argv, { run: false })
  const actionResult = cli.runMatchedCommand()

  if (isPromiseLike(actionResult)) {
    await actionResult
  }

  if (argv.slice(2).length === 0) {
    cli.outputHelp()
  }
}

#!/usr/bin/env node

import { cac } from 'cac';
import { registerGenCommand } from '../commands/gen.js';

const cli = cac('kabu');
const version = '0.1.0';

registerGenCommand(cli);

cli.version(version);
cli.help();

cli.on('command:*', () => {
  console.error(`Unknown command: ${cli.args.join(' ')}`);
  cli.outputHelp();
  process.exitCode = 1;
});

cli.parse();

if (process.argv.slice(2).length === 0) {
  cli.outputHelp();
}

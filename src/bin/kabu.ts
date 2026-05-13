#!/usr/bin/env node

import { runCli } from '../cli/index.js'

runCli().catch(error => {
  console.error(`[error] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})

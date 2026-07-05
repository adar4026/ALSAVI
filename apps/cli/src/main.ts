#!/usr/bin/env node
import { run } from './cli.js';

// Thin entry point: forward real argv and process streams to `run`, set exit
// code. All logic lives in `run` (testable without touching process streams).
process.exitCode = await run(process.argv.slice(2), {
  stdout: (chunk) => process.stdout.write(chunk),
  stderr: (chunk) => process.stderr.write(chunk),
});

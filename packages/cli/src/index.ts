#!/usr/bin/env node
import { Command } from 'commander';
import { registerCardCommand } from './commands/card.js';
import { registerRunCommand } from './commands/run.js';
import { VERSION } from './version.js';

const program = new Command();

program
  .name('a2a-compliance')
  .description('Compliance test kit for A2A (Agent2Agent) protocol endpoints')
  .version(VERSION);

registerCardCommand(program);
registerRunCommand(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

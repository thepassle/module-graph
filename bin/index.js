#!/usr/bin/env node

import { program } from 'commander';
import { createModuleGraph } from '../index.js';

function ensureRelative(filePath) {
  if (!filePath.startsWith('./') && !filePath.startsWith('../')) {
    return './' + filePath;
  }
  return filePath;
}

program
  .name('my-pkg')
  .description('CLI to process JS files')
  .version('0.1.0');

program
  .command('find <entrypoint>')
  .argument('<pattern>', 'Module to find')
  .description('Output the import chain for a given module')
  .action(async (entrypoint, pattern) => {
    if (!entrypoint) {
      console.error('Error: entrypoint is required');
      process.exit(1);
    }

    if (!pattern) {
      console.error('Error: pattern is required');
      process.exit(1);
    }

    let entrypoints = entrypoint.split(',').map(s => s.trim()).map(ensureRelative);


    const graph = await createModuleGraph(entrypoints);

    for (const module of graph.get(pattern)) {
      console.log(module);
    }
  });

// ⚡ node ../../../bin/index.js import-chain a.js c.js
// ⚡ node ../../../bin/index.js import-chain a.js c.js --ts
// ⚡ node ../../../bin/index.js import-chain a.js c.js --ts --node
program
  .command('import-chain <entrypoint>')
  .argument('<pattern>', 'Module to find import chain for')
  .description('Output the import chain for a given module')
  // .requiredOption('-e, --entrypoint <entrypoints>', 'Specify entry point files', (value) => value.split(','))
  .action(async (entrypoint, pattern) => {
    if (!entrypoint) {
      console.error('Error: entrypoint is required');
      process.exit(1);
    }

    if (!pattern) {
      console.error('Error: pattern is required');
      process.exit(1);
    }

    let entrypoints = entrypoint.split(',').map(s => s.trim()).map(ensureRelative);

    const graph = await createModuleGraph(entrypoints);

    let i = 0;
    for (const chain of graph.findImportChains(pattern)) {
      console.log(`Chain ${++i}:`)
      for (const i of chain) {
        console.log(i);
      }
      console.log();
    }
  });


// ⚡ node ../../../bin/index.js a.js
// ⚡ node ../../../bin/index.js a.js --ts
// ⚡ node ../../../bin/index.js a.js --ts --node
program
  .argument('<entrypoint>', 'Entrypoint')
  .action(async (entrypoint) => {
    if (!entrypoint) {
      console.error('Error: entrypoint is required');
      process.exit(1);
    }

    let entrypoints = entrypoint.split(',').map(s => s.trim()).map(ensureRelative);

    const graph = await createModuleGraph(entrypoints);

    for (const module of graph.getUniqueModules()) {
      console.log(module);
    }
  });

program.parse(process.argv);
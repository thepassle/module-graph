#!/usr/bin/env node

import { program } from 'commander';
import { createModuleGraph } from '../index.js';
import { typescript } from '../plugins/typescript.js';

function ensureRelative(filePath) {
  if (!filePath.startsWith('./') && !filePath.startsWith('../')) {
    return './' + filePath;
  }
  return filePath;
}

function createOptions(options) {
  /**
   * --node
   */
  if (!options?.ts && options?.node) {
    console.error('Error: --node option can only be used in combination with --ts');
    process.exit(1);
  }

  const plugins = [];

  /**
   * --ts
   */
  if (options?.ts && !options?.node) {
    plugins.push(typescript());
  }

  /**
   * --ts --node
   */
  if (options?.ts && options?.node) {
    plugins.push(typescript({
      compilerOptions: {
        moduleResolution: "node",
      }
    }));
  }

  return plugins;
}

program
  .name('my-pkg')
  .description('CLI to process JS files')
  .version('0.1.0');

program
  .command('find <entrypoint>')
  .argument('<pattern>', 'Module to find')
  .description('Output the import chain for a given module')
  .option('--ts', 'Analyze Typescript source code')
  .option('--node', 'Use node compiler options for ts plugin')
  .action(async (entrypoint, pattern, options) => {
    if (!entrypoint) {
      console.error('Error: entrypoint is required');
      process.exit(1);
    }

    if (!pattern) {
      console.error('Error: pattern is required');
      process.exit(1);
    }

    let entrypoints = entrypoint.split(',').map(s => s.trim()).map(ensureRelative);

    const plugins = createOptions(options);

    const graph = await createModuleGraph(entrypoints, {plugins});

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
  .option('--ts', 'Analyze Typescript source code')
  .option('--node', 'Use node compiler options for ts plugin')
  .action(async (entrypoint, pattern, options) => {
    if (!entrypoint) {
      console.error('Error: entrypoint is required');
      process.exit(1);
    }

    if (!pattern) {
      console.error('Error: pattern is required');
      process.exit(1);
    }

    let entrypoints = entrypoint.split(',').map(s => s.trim()).map(ensureRelative);

    const plugins = createOptions(options);

    const graph = await createModuleGraph(entrypoints, {plugins});

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
  .option('--ts', 'Analyze Typescript source code')
  .option('--node', 'Use node compiler options for ts plugin')
  .action(async (entrypoint, options) => {
    if (!entrypoint) {
      console.error('Error: entrypoint is required');
      process.exit(1);
    }

    let entrypoints = entrypoint.split(',').map(s => s.trim()).map(ensureRelative);

    const plugins = createOptions(options);
    const graph = await createModuleGraph(entrypoints, {plugins});

    for (const module of graph.getUniqueModules()) {
      console.log(module);
    }
  });

program.parse(process.argv);
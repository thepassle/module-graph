# Module graph

Creates a module graph based on a given entrypoint. Supports ESM, monorepos, import attributes, typescript, and is extensible via plugins. Builds on top of [`rs-module-lexer`](https://www.npmjs.com/package/rs-module-lexer) for scanning a module's imports, and [`oxc-resolver`](https://www.npmjs.com/package/oxc-resolver) for module resolution.

## Installation

```
npm i @thepassle/module-graph
```

## Usage

```js
import { createModuleGraph } from '@thepassle/module-graph';

const moduleGraph = await createModuleGraph('./index.js');

/**
 * Multiple entrypoints
 */
const moduleGraph = await createModuleGraph(['./foo.js', './bar.js']);

/**
 * Configuration options
 * Supports all `oxc-resolver`'s `NapiResolveOptions` options.
 * https://github.com/oxc-project/oxc-resolver?tab=readme-ov-file#oxc-resolver
 */
const moduleGraph = await createModuleGraph('./index.js', {
  basePath: process.cwd(),
  exportConditions: ['browser', 'import'],
  /** Handle external modules */
  external: {
    /** Ignore all external modules imported via a bare module specifier */
    ignore: true,
    /** Only include external modules from these packages */
    include: ['bar'],
    /** Exclude bare module specifiers */
    exclude: ['foo', '@foo/bar'],
  },
  /** Picomatch glob pattern or callback */
  exclude: [
    '**/ignore.js',
    '**/foo/*.js',
    (importee) => importee.includes('foo')
  ],
  /** Ignores dynamic imports */
  ignoreDynamicImport: true,
  /** Picomatch glob patterns or callbacks for modules that should not be parsed because
   * they do on exist or are not using valid js/ts/jsx/tsx syntax
   */
  foreignModules: ['**/*.css', 'virtual:*'],
  /** Picomatch glob patterns or callbacks for imports that may not be tied to physical file */
  virtualModules: ['virtual:*'],
  plugins: [myPlugin]
});
```

`createModuleGraph` analyzes only ESM-style imports, not `require`. However, if a CommonJS file is found and uses a dynamic import, it will include the dynamic import in the graph and any other imports that leads to.

## CLI

```bash
# List all modules in the graph
npx @thepassle/module-graph index.js
npx @thepassle/module-graph foo.js,bar.js

# Find import chains for a given module
npx @thepassle/module-graph import-chain entrypoint.js module-to-find.js

# Find specific module
npx @thepassle/module-graph find entrypoint.js module-to-find.js
```

## `ModuleGraph`

### `get`

```js
const moduleGraph = await createModuleGraph('./index.js');

const foo = moduleGraph.get('foo.js');
/** Or use picomatch pattern */
const bar = moduleGraph.get('**/bar.js');

/**
 * Or:
 */
const foo = moduleGraph.get((p) => p.endsWith('foo.js'));
```

### `getUniqueModules`

```js
const moduleGraph = await createModuleGraph('./index.js');

const uniqueModules = moduleGraph.getUniqueModules();
```

### `findImportChains`

```js
const moduleGraph = await createModuleGraph('./index.js');

const chains = moduleGraph.findImportChains('baz.js');

/**
 * Or:
 */
const chains = moduleGraph.findImportChains((p) => p.endsWith('baz.js'));

chains.forEach((c) => console.log(c.join(" -> ")));
// index.js -> bar.js -> baz.js
```

## Plugins

You can also extend the default behavior by providing plugins. There are several default, opt-in plugins available:

- **Imports** outputs additional analysis of every modules imports on the `Module` object
- **Exports** outputs additional analysis of every modules exports on the `Module` object
- **Barrel-file** analyzes every module to see if it's a barrel file
- **Unused-exports** finds unused exports in your module graph

```js
import { imports } from '@thepassle/module-graph/plugins/imports.js';
import { exports } from '@thepassle/module-graph/plugins/exports.js';
import { barrelFile } from '@thepassle/module-graph/plugins/barrel-file.js';
import { unusedExports } from '@thepassle/module-graph/plugins/unused-exports.js';

const moduleGraph = await createModuleGraph('./index.js', {
  plugins: [
    imports,
    exports,
    unusedExports,
    barrelFile({
      amountOfExportsToConsiderModuleAsBarrel: 3
    })
  ]
});

const module = moduleGraph.get('index.js');

module.imports; // Array of `Import`
module.exports; // Array of `Export`
module.isBarrelFile; // true
module.unusedExports; // Array of `Export`
```

See the [documentation](https://github.com/thepassle/module-utils?tab=readme-ov-file#importsexports) for more information on the `Import` and `Export` objects.

## Creating plugins

### Hooks

All plugin hooks can be async.

#### `start`

> Runs once

Use for initializing logic of the plugin

```js
const plugin = {
  name: 'my-plugin',
  start: ({entrypoints, basePath, exportConditions}) => {
    console.log('Plugin start');
  }
}

const moduleGraph = await createModuleGraph('./index.js', {
  plugins: [plugin]
});
```

#### `handleImport`

> Runs for every import starting (but excluding) the entrypoints

Can be used to implement custom logic or rewrite a specifier

- If `false` is returned, the import will be skipped entirely
- If a string is returned, it will try to resolve that instead

```js
const plugin = {
  name: 'my-plugin',
  handleImport: ({source, importer, importee}) => {
    if (importee.endsWith('?skip')) {
      return false;
    }
  }
}

const moduleGraph = await createModuleGraph('./index.js', {
  plugins: [plugin]
});
```

#### `analyze`

> Runs for every module

Can be used to analyze the module (or its source), and add additional meta information to the Module object

You can mutate the module directly, no need to return it

```js
const plugin = {
  name: 'my-plugin',
  analyze: (module) => {
    if (module.source.includes('process.env')) {
      module.usesProcessEnv = true;
    }
  }
}

const moduleGraph = await createModuleGraph('./index.js', {
  plugins: [plugin]
});

moduleGraph.get('module-containing-process-env.js').usesProcessEnv; // true
```

#### `resolve`

> Runs for every import starting (but excluding) the entrypoint

Can be used to implement custom resolution logic. Gets passed the `resolveOptions` passed to `createModuleGraph`. If a plugin resolves the module and returns it from the `resolve` hook, consequent plugins will no longer be executed, because the module is already resolved.

- If nothing is returned, the default resolution will be used
- If a URL is returned, it will output that instead

```js
const plugin = {
  name: 'my-plugin',
  resolve: ({ importee, importer, exportConditions, ...resolveOptions }) => {
    return customResolve(importee, importer, exportConditions);
  }
}

const moduleGraph = await createModuleGraph('./index.js', {
  plugins: [plugin]
});
```

#### `end`

> Runs once

Use for cleanup logic of the plugin

```js
const plugin = {
  name: 'my-plugin',
  end: (moduleGraph) => {
    console.log('Plugin end')
    moduleGraph.foo = 'bar';
  }
}

const moduleGraph = await createModuleGraph('./index.js', {
  plugins: [plugin]
});

moduleGraph.foo; // 'bar'
```

### Example plugin

For example, if you want to create a graph visualization, you could create a `digraph` plugin like so:

```js
import { exportToFile } from "@ts-graphviz/node";
import { createModuleGraph } from '@thepassle/module-graph';

const digraphPlugin = {
  name: 'digraph-plugin',
  end(moduleGraph) {
    let digraph = 'digraph {\n';
    for (const [parent, importees] of moduleGraph.graph) {
      digraph += `  "${parent}" -> ${[...importees].map(p => `"${p}"`).join(',')}\n`;
    }
    digraph += '}';

    moduleGraph.digraph = digraph;
  }
}

const moduleGraph = await createModuleGraph('./entrypoint.js', {
  plugins: [digraphPlugin]
});

await exportToFile(moduleGraph.digraph, {
  format: "png",
  output: "./example.png",
});
```

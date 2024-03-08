# Module graph

Creates a module graph based on a given entrypoint. Supports ESM, monorepos, import attributes, typescript (via a plugin) and is extensible via plugins. Builds on top of [`es-module-lexer`](https://www.npmjs.com/package/es-module-lexer) for scanning a module's imports, and [`@rollup/plugin-node-resolve`](https://www.npmjs.com/package/@rollup/plugin-node-resolve) for module resolution (without using `Rollup` directly).

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
 * Supports all `@rollup/plugin-node-resolve`'s `RollupNodeResolveOptions` options.
 * https://www.npmjs.com/package/@rollup/plugin-node-resolve#options
 */
const moduleGraph = await createModuleGraph('./index.js', {
  basePath: process.cwd(),
  exportConditions: ['browser', 'import'],
  /** Ignores external modules */
  ignoreExternal: true,
  /** Picomatch glob pattern */
  exclude: [
    '**/ignore.js',
    '**/foo/*.js',
  ],
  plugins: [myPlugin]
});
```

`createModuleGraph` analyzes only ESM-style imports, not `require`. However, if a CommonJS file is found and uses a dynamic import, it will include the dynamic import in the graph and any other imports that leads to.

## Typescript

If you want to analyze typescript source code, you can use the `typescript` plugin:

```js
import { createModuleGraph } from '@thepassle/module-graph';
import { typescript } from '@thepassle/module-graph/plugins/typescript.js';

const moduleGraph = await createModuleGraph('./index.ts', {
  plugins: [typescript()]
});
```

The default is set to ESM, which means it expects `.js` file extensions in your code. However, you can also provide your `tsconfig.json` options to the typescript plugin, to resolve extensionless typescript imports, e.g.: `import { Foo } from './foo';`:

```js
import { createModuleGraph } from '@thepassle/module-graph';
import { typescript } from '@thepassle/module-graph/plugins/typescript.js';

const moduleGraph = await createModuleGraph('./index.ts', {
  plugins: [typescript({
    compilerOptions: {
      moduleResolution: "node",
    }
  })]
});
```

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

All CLI commands also allow the `--ts` option if your source code is in Typescript, and this can be combined with the `--node` flag if you're using extensionless imports in Typescript. E.g.:

```bash
npx @thepassle/module-graph find entrypoint.ts module-to-find.ts --ts --node
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

- **Typescript** analyze TS source code. Takes a `compilerOptions` object.
- **Imports** outputs additional analysis of every modules imports on the `Module` object
- **Exports** outputs additional analysis of every modules exports on the `Module` object
- **Barrel-file** analyzes every module to see if it's a barrel file

```js
import { typescript } from '@thepassle/module-graph/plugins/typescript.js';
import { imports } from '@thepassle/module-graph/plugins/imports.js';
import { exports } from '@thepassle/module-graph/plugins/exports.js';
import { barrelFile } from '@thepassle/module-graph/plugins/barrel-file.js';

const moduleGraph = await createModuleGraph('./index.js', {
  plugins: [
    typescript(),
    imports,
    exports,
    barrelFile({
      amountOfExportsToConsiderModuleAsBarrel: 3
    })
  ]
});

const module = moduleGraph.get('index.js');

module.imports; // Array of `Import`
module.exports; // Array of `Export`
module.isBarrelFile; // true
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

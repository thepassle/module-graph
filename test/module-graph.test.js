import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleResolve } from 'import-meta-resolve';
import { createModuleGraph } from '../index.js';
import { isBareModuleSpecifier } from '../utils.js';
import { typescript } from '../plugins/typescript.js';
import { unusedExports } from '../plugins/unused-exports.js';

const fixture = (p) => path.join(process.cwd(), 'test/fixtures', p);

describe('utils', () => {
  it('isBareModuleSpecifier', () => {
    assert(isBareModuleSpecifier('foo'));
    assert(isBareModuleSpecifier('@foo/bar'));
    assert(!isBareModuleSpecifier('/Users/foo/bar/baz.js'));
    assert(!isBareModuleSpecifier('./foo'));
    assert(!isBareModuleSpecifier('../foo'));
    assert(!isBareModuleSpecifier('#private'));
  });
});

describe('createModuleGraph', () => {

  it('graph-simple', async () => {
    /**
     * index.js -> bar.js -> baz.js
     */
    const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('graph-simple') });
    assert(moduleGraph.graph.get('index.js').has('bar.js'));
    assert(moduleGraph.graph.get('bar.js').has('baz.js'));

    const uniqueModules = moduleGraph.getUniqueModules();
    assert.deepStrictEqual(uniqueModules, ['index.js', 'bar.js', 'baz.js']);

    const chains = moduleGraph.findImportChains('baz.js');
    assert.deepStrictEqual(chains[0], ['index.js', 'bar.js', 'baz.js']);
  });

  it('graph-simple `findImportChains` callback', async () => {
    /**
     * index.js -> bar.js -> baz.js
     */
    const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('graph-simple') });

    const chains = moduleGraph.findImportChains((p) => p.endsWith('baz.js'));
    assert.deepStrictEqual(chains[0], ['index.js', 'bar.js', 'baz.js']);
  });

  it('dynamic-import', async () => {
    /**
     * index.js -> import('./foo.js')
     */
    const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('dynamic-import') });

    assert(moduleGraph.graph.get('index.js').has('foo.js'));
  });

  it('dynamic-import-in-cjs', async () => {
    /**
     * Ignores `requires`, but still follows dynamic imports
     */
    const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('dynamic-import-in-cjs') });

    assert(moduleGraph.graph.get('index.js').has('foo.js'));
    // `foo.js` dynamically imports `baz.js`
    assert(moduleGraph.graph.get('foo.js').has('baz.js'));
    // `foo.js` `require`s `bar.js`, but it's not included in the graph
    assert.equal(moduleGraph.graph.get('foo.js').has('bar.js'), false);
    assert(moduleGraph.graph.get('baz.js').has('qux.js'));
  });

  it('multiple-entrypoints', async () => {
    const moduleGraph = await createModuleGraph(['./a.js', './c.js'], { basePath: fixture('multiple-entrypoints') });

    assert(moduleGraph.modules.size, 3);
  });

  it('multiple-entrypoints-import-chains', async () => {
    /**
     * a.js -> b.js -> c.js
     * d.js -> c.js
     */
    const moduleGraph = await createModuleGraph(['./a.js', './d.js'], { basePath: fixture('multiple-entrypoints-import-chains') });
    
    const chains = moduleGraph.findImportChains((p) => p.endsWith('c.js'));
    assert.deepStrictEqual(chains[0], ['a.js', 'b.js', 'c.js']);
    assert.deepStrictEqual(chains[1], ['d.js', 'c.js']);
  });

  it('circular', async () => {
    /**
     * a.js -> b.js -> c.js -> a.js
     * 
     * Doesn't result in an infinite loop
     */
    const moduleGraph = await createModuleGraph('./a.js', { basePath: fixture('circular') });
    assert.equal(moduleGraph.modules.size, 3);
  });

  it('multiple-entrypoints-import-chains-circular', async () => {
    /**
     * a.js -> b.js -> c.js -> d.js
     * d.js -> c.js
     */
    const moduleGraph = await createModuleGraph(['./a.js', './d.js'], { basePath: fixture('multiple-entrypoints-import-chains-circular') });
    
    const chains = moduleGraph.findImportChains((p) => p.endsWith('c.js'));
    assert.deepStrictEqual(chains[0], ['a.js', 'b.js', 'c.js']);
    assert.deepStrictEqual(chains[1], ['d.js', 'c.js']);
  });

  it('require-in-chain', async () => {
    const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('require-in-chain') });
    // Does not include `bar.js` because it was `require`d
    assert.equal(moduleGraph.modules.size, 2);
  });

  it('import-attributes', async () => {
    const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('import-attributes') });

    assert(moduleGraph.graph.get('index.js').has('data.json'));
    assert(moduleGraph.graph.get('index.js').has('styles.css'));
  });

  it('multiple-import-chains', async () => {
    /**
     *     a
     *    / \
     *   b   d
     *    \ /
     *     c
     */
    const moduleGraph = await createModuleGraph('./a.js', { basePath: fixture('multiple-import-chains') });
    const chains = moduleGraph.findImportChains('c.js');

    assert.equal(chains.length, 2);
    assert.deepStrictEqual(chains[0], ['a.js', 'b.js', 'c.js']);
    assert.deepStrictEqual(chains[1], ['a.js', 'd.js', 'c.js']);

    const [c] = moduleGraph.get('c.js');
    assert.deepStrictEqual(c.importedBy, ['b.js', 'd.js']);
  });

  it('resolves-private', async () => {
    /**
     * index.js -> #private
     */
    const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('resolves-private') });

    assert(moduleGraph.graph.get('index.js').has('private.js'));
  });

  it('ignores-builtins', async () => {
    /**
     * index.js
     *  - node:fs
     *  - fs
     *  - path
     */
    const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('ignores-builtins') });

    assert.equal(moduleGraph.modules.size, 1);
  });

  it('external-dependencies', async () => {
    /**
     * 'foo'
     */
    const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('external-dependencies') });
    const [m] = moduleGraph.get('node_modules/foo/index.js');
    
    assert(m.packageRoot.pathname.endsWith('test/fixtures/external-dependencies/node_modules/foo'));
  });

  it('ignore-external', async () => {
    /**
     * a.js -> b.js -> foo
     */
    const moduleGraph = await createModuleGraph('./a.js', { 
      basePath: fixture('ignore-external'),
      ignoreExternal: true
    });

    assert.equal(moduleGraph.modules.size, 2);
    assert.equal(moduleGraph.externalDependencies.size, 0);
  });

  it('external-dependencies-scoped-package', async () => {
    /**
     * 'foo'
     */
    const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('external-dependencies-scoped-package') });
    const [m] = moduleGraph.get('node_modules/@foo/bar/index.js');
    
    assert(m.packageRoot.pathname.endsWith('test/fixtures/external-dependencies-scoped-package/node_modules/@foo/bar'));
  });

  it('external-package-exports-regular', async () => {
    /**
     * 'foo' with package exports ".": "./foo.js"
     */
    const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('external-package-exports-regular') });
    const [m] = moduleGraph.get('node_modules/foo/foo.js');

    assert(m.packageRoot.pathname.endsWith('test/fixtures/external-package-exports-regular/node_modules/foo'));
  });

  it('monorepo', async () => {
    const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('monorepo/packages/foo') });
    const [m] = moduleGraph.get('../../node_modules/bar/index.js');
    assert(m.packageRoot.pathname.endsWith('monorepo/node_modules/bar'));
  });
});

describe('plugins', () => {
  it('start', async () => {
    const plugin = {
      name: 'start-plugin',
      start: ({ entrypoints, basePath, exportConditions }) => {
        assert.deepStrictEqual(entrypoints, ['index.js']);
        assert.equal(basePath, fixture('plugins-start'));
        assert.deepStrictEqual(exportConditions, ["node", "import"]);
      }
    }
    await createModuleGraph('./index.js', { 
      basePath: fixture('plugins-start'),
      plugins: [plugin]
    });
  });

  it('end', async () => {
    let called = false;
    let graphSize = 0;

    const plugin = {
      name: 'end-plugin',
      end: (moduleGraph) => {
        graphSize = moduleGraph.modules.size;
        called = true;
        moduleGraph.foo = 'bar';
      }
    }
    const moduleGraph = await createModuleGraph('./index.js', { 
      basePath: fixture('plugins-end'),
      plugins: [plugin]
    });

    assert(called);
    assert.equal(graphSize, 2);
    assert.equal(moduleGraph.foo, 'bar');
  });

  it('handleImport - boolean', async () => {
    /**
     * index.js
     * - foo?skip
     * - bar.js
     */

    const skipPlugin = {
      name: 'skip-plugin',
      handleImport: ({ source, importer, importee }) => {
        if (importee.endsWith('?skip')) {
          return false;
        }
      }
    }
    const moduleGraph = await createModuleGraph('./index.js', { 
      basePath: fixture('plugins-handle-import-boolean'),
      plugins: [skipPlugin]
    });

    assert.deepStrictEqual(moduleGraph.getUniqueModules(), ['index.js', 'bar.js']);
  });

  it('handleImport - string', async () => {
    /**
     * index.js
     * - foo?replace
     * - bar.js
     */

    const skipPlugin = {
      name: 'skip-plugin',
      handleImport: ({ source, importer, importee }) => {
        if (importee.endsWith('?replace')) {
          return './baz.js';
        }
      }
    }
    const moduleGraph = await createModuleGraph('./index.js', { 
      basePath: fixture('plugins-handle-import-string'),
      plugins: [skipPlugin]
    });

    assert.deepStrictEqual(moduleGraph.getUniqueModules(), ['index.js', 'baz.js', 'bar.js']);
  });

  it('resolve', async () => {
    /**
     * index.js -> bar.js
     */

    const resolvePlugin = {
      name: 'resolve-plugin',
      resolve: ({ importee, importer, exportConditions }) => {
        /**
         * Rewrite `./bar.js` (importee) to `./baz.js`
         */
        return moduleResolve('./baz.js', pathToFileURL(importer), exportConditions);
      }
    }
    
    const moduleGraph = await createModuleGraph('./index.js', { 
      basePath: fixture('plugins-resolve'),
      plugins: [resolvePlugin]
    });

    assert.deepStrictEqual(moduleGraph.getUniqueModules(), ['index.js', 'baz.js']);
  });

  it('resolve multiple', async () => {
    const resolvePlugin1 = {
      name: 'skip-plugin',
      resolve: ({ importee, importer, exportConditions }) => {
        return moduleResolve('./baz.js', pathToFileURL(importer), exportConditions);
      }
    }

    let called = false;
    const resolvePlugin2 = {
      name: 'skip-plugin',
      resolve: ({ importee, importer, exportConditions }) => {
        called = true;
      }
    }
    
    const moduleGraph = await createModuleGraph('./index.js', { 
      basePath: fixture('plugins-resolve'),
      plugins: [resolvePlugin1, resolvePlugin2]
    });

    /** `resolvePlugin1` has already resolved the module, so `resolvePlugin2`'s `resolve` hook gets skipped */
    assert.equal(called, false);
  });

  it('analyze', async () => {
    const analyzePlugin = {
      name: 'analyze-plugin',
      analyze: (module) => {
        if (module.source.includes('process.env')) {
          module.usesProcessEnv = true;
        }
      }
    }
    const moduleGraph = await createModuleGraph('./index.js', { 
      basePath: fixture('plugins-analyze'),
      plugins: [analyzePlugin]
    });

    const [r] = moduleGraph.get('bar.js');
    assert(r.usesProcessEnv);
  });

  it('exclude', async () => {
    const moduleGraph = await createModuleGraph('./index.js', { 
      basePath: fixture('exclude'),
      exclude: [
        'ignore.js',
        '**/ignore-me.js',
        '**/quux/*.js',
      ]
    });

    assert.deepStrictEqual(moduleGraph.getUniqueModules(), ["index.js", "foo.js", "bar.js", "node_modules/qux/index.js"]);
  });
});

describe('built-in plugins', () => {
  it('unused exports', async () => {
    const moduleGraph = await createModuleGraph('./a.js', {
      basePath: fixture('unused-exports'),
      plugins: [unusedExports]
    });

    assert.equal(moduleGraph.unusedExports.length, 2);

    assert.equal(moduleGraph.unusedExports[0].name, 'b1');
    assert.equal(moduleGraph.unusedExports[0].declaration.name, 'b1');
    assert.equal(moduleGraph.unusedExports[0].declaration.module, 'b.js');

    assert.equal(moduleGraph.unusedExports[1].name, 'default');
    assert.equal(moduleGraph.unusedExports[1].declaration.name, 'c1');
    assert.equal(moduleGraph.unusedExports[1].declaration.module, 'c.js');
  });

  it('unused exports alias', async () => {
    /**
     * import { b as alias } from './b.js';
     */
    const moduleGraph = await createModuleGraph('./a.js', {
      basePath: fixture('unused-exports-alias'),
      plugins: [unusedExports]
    });

    assert.equal(moduleGraph.unusedExports.length, 0);
  });

  it('unused exports aggregate', async () => {
    /**
     * import * as foo from './b.js'
     */
    const moduleGraph = await createModuleGraph('./a.js', {
      basePath: fixture('unused-exports-aggregate'),
      plugins: [unusedExports]
    });

    assert.equal(moduleGraph.unusedExports.length, 0);
  });

  it('unused exports reexport named', async () => {
    /**
     * export { b } from './b.js'
     * export { c as alias } from './c.js'
     */
    const moduleGraph = await createModuleGraph('./a.js', {
      basePath: fixture('unused-exports-reexport-named'),
      plugins: [unusedExports]
    });

    assert.equal(moduleGraph.unusedExports.length, 0);
  });

  it('unused exports reexport default', async () => {
    /**
     * export { default } from './b.js'
     */
    const moduleGraph = await createModuleGraph('./a.js', {
      basePath: fixture('unused-exports-reexport-default'),
      plugins: [unusedExports]
    });

    assert.equal(moduleGraph.unusedExports.length, 0);
  });

  it('unused exports reexport default', async () => {
    /**
     * export * from './b.js'
     */
    const moduleGraph = await createModuleGraph('./a.js', {
      basePath: fixture('unused-exports-reexport-aggregate'),
      plugins: [unusedExports]
    });

    assert.equal(moduleGraph.unusedExports.length, 0);
  });

  it('typescript', async () => {
    /**
     * index.ts -> foo.ts -> node_modules/bar/index.js
     * import { foo } from './foo.js';
     */
    const moduleGraph = await createModuleGraph('./index.ts', {
      basePath: fixture('typescript'),
      plugins: [typescript()]
    });

    assert(moduleGraph.graph.get('index.ts').has('foo.ts'));
    assert(moduleGraph.graph.get('foo.ts').has('node_modules/bar/index.js'));
  });

  it('typescript node', async () => {
    /**
     * index.ts -> foo.ts
     * import { foo } from './foo';
     */
    const moduleGraph = await createModuleGraph('./index.ts', {
      basePath: fixture('typescript-node'),
      plugins: [typescript({
        compilerOptions: {
          moduleResolution: "node",
        }
      })]
    });

    assert(moduleGraph.graph.get('index.ts').has('foo.ts'));
  });
});
import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { moduleResolve } from 'import-meta-resolve';
import { createModuleGraph } from '../index.js';

const fixture = (p) => path.join(process.cwd(), 'test/fixtures', p);

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

    assert.deepStrictEqual(moduleGraph.get('c.js').importedBy, ['b.js', 'd.js']);
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
    const m = moduleGraph.get('node_modules/foo/index.js');

    assert(m.packageRoot.endsWith('test/fixtures/external-dependencies/node_modules/foo'));
  });

  it('external-dependencies-scoped-package', async () => {
    /**
     * 'foo'
     */
    const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('external-dependencies-scoped-package') });
    const m = moduleGraph.get('node_modules/@foo/bar/index.js');

    assert(m.packageRoot.endsWith('test/fixtures/external-dependencies-scoped-package/node_modules/@foo/bar'));
  });

  it('external-package-exports-regular', async () => {
    /**
     * 'foo' with package exports ".": "./foo.js"
     */
    const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('external-package-exports-regular') });
    const m = moduleGraph.get('node_modules/foo/foo.js');

    assert(m.packageRoot.endsWith('test/fixtures/external-package-exports-regular/node_modules/foo'));
  });

  it('monorepo', async () => {
    // @TODO
    // const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('monorepo') });
    // const m = moduleGraph.get('node_modules/foo/foo.js');

  });

  /**
   * @TODO
   * 
   * - Example: bluwy's cjs/esm detector as a plugin, should be able to do that in handleImport hook
   * 
   * - monorepo style -> node_modules resolves to ../../node_modules/foo
   * 
   * - viz-js.com
   *    let result = 'digraph {\n';
   *    for (const [parent, importees] of moduleGraph.graph) {
   *      result += `  "${parent}" -> ${[...importees].map(p => `"${p}"`).join(',')}\n`;
   *    }
   *    result += '}';
   * 
   * - nested node_modules
   *  - implement { 'external-pkg': { '1.0.0': 'node_modules/external-pkg', '2.0.0': 'node_modules/foo/node_modules/external-pkg'} }
   * 
   * - test `moduleGraph.get` method
   *  - string
   *  - callback
   * 
   * 
   * - test TS import? 
   *  - what happens with `import type { Foo } from 'foo';?
   *  - can we analyze ts source code with a plugin? :)
   */
});

describe('plugins', () => {
  it('start', async () => {
    const plugin = {
      name: 'start-plugin',
      start: ({ entrypoint, basePath, conditions, preserveSymlinks }) => {
        assert.equal(entrypoint, './index.js');
        assert.equal(basePath, fixture('plugins-start'));
        assert.deepStrictEqual(conditions, new Set(['import', 'node']));
        assert.equal(preserveSymlinks, false);
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
      }
    }
    await createModuleGraph('./index.js', { 
      basePath: fixture('plugins-end'),
      plugins: [plugin]
    });

    assert(called);
    assert.equal(graphSize, 2);
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
      name: 'skip-plugin',
      resolve: ({ importee, importer, conditions, preserveSymlinks }) => {
        /**
         * Rewrite `./bar.js` (importee) to `./baz.js`
         */
        return moduleResolve('./baz.js', importer, conditions, preserveSymlinks);
      }
    }
    
    const moduleGraph = await createModuleGraph('./index.js', { 
      basePath: fixture('plugins-resolve'),
      plugins: [resolvePlugin]
    });

    assert.deepStrictEqual(moduleGraph.getUniqueModules(), ['index.js', 'baz.js']);
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

    assert(moduleGraph.get('bar.js').usesProcessEnv);
  });
});
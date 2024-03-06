import { describe, it } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { moduleResolve } from "import-meta-resolve";
import { createModuleGraph } from "../index.js";
import { isBareModuleSpecifier } from "../utils.js";
import { typescript } from "../plugins/typescript.js";
import ts from "typescript";

const fixture = (p) => path.join(process.cwd(), "test/fixtures", p);
const toUnix = (p) => p.replace(/\\/g, "/");

describe("utils", () => {
  it("isBareModuleSpecifier", () => {
    assert(isBareModuleSpecifier("foo"));
    assert(isBareModuleSpecifier("@foo/bar"));
    assert(!isBareModuleSpecifier("/Users/foo/bar/baz.js"));
    assert(!isBareModuleSpecifier("./foo"));
    assert(!isBareModuleSpecifier("../foo"));
    assert(!isBareModuleSpecifier("#private"));
  });
});

export const has = (arr) => Array.isArray(arr) && arr.length > 0;

export function hasExportModifier(node) {
  if (has(node?.modifiers)) {
    if (node.modifiers.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) {
      return true;
    }
  }
  return false;
}

export function hasDefaultModifier(node) {
  if (has(node?.modifiers)) {
    if (node.modifiers.some(mod => mod.kind === ts.SyntaxKind.DefaultKeyword)) {
      return true;
    }
  }
  return false;
}

/**
 * @example export { var1, var2 };
 */
export function hasNamedExports(node) {
  if (has(node?.exportClause?.elements)) {
    return true;
  }
  return false;
}

/**
 * @example export { var1, var2 } from 'foo';
 */
export function isReexport(node) {
  if (node?.moduleSpecifier !== undefined) {
    return true;
  }
  return false;
}

/** @example import defaultExport from 'foo'; */
export function hasDefaultImport(node) {
  return !!node?.importClause?.name;
}

/** @example import {namedA, namedB} from 'foo'; */
export function hasNamedImport(node) {
  return has(node?.importClause?.namedBindings?.elements);
}

/** @example import * as name from './my-module.js'; */
export function hasAggregatingImport(node) {
  return !!node?.importClause?.namedBindings?.name && !hasNamedImport(node);
}

/** @example import './my-module.js'; */
export function hasSideEffectImport(node) {
  return "importClause" in node && node.importClause == null;
}

describe.only("createModuleGraph", () => {
  // it('graph-simple', async () => {
  //   /**
  //    * index.js -> bar.js -> baz.js
  //    */
  //   const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('graph-simple') });

  //   assert(moduleGraph.graph.get('index.js').has('bar.js'));
  //   assert(moduleGraph.graph.get('bar.js').has('baz.js'));

  //   const uniqueModules = moduleGraph.getUniqueModules();
  //   assert.deepStrictEqual(uniqueModules, ['index.js', 'bar.js', 'baz.js']);

  //   const chains = moduleGraph.findImportChains('baz.js');
  //   assert.deepStrictEqual(chains[0], ['index.js', 'bar.js', 'baz.js']);
  // });

  it.only("unused-exports", async () => {
    /**
     * index.js -> foo.js
     */

    const moduleGraph = await createModuleGraph("./index.js", {
      basePath: fixture("unused-exports"),
      plugins: [
        {
          name: "unused-exports",
          analyze(module) {
            const ast = ts.createSourceFile(
              "",
              module.source,
              ts.ScriptTarget.ES2015,
              true
            );
            const imports = [];
            const exports = [];

            function collect(source, filePath) {
              visitNode(source);

              // @TODO analyze dynamic imports
              function visitNode(node) {
                /**
                 * IMPORTS
                 */
                /**
                 * @example import defaultExport from 'foo';
                 */
                if (hasDefaultImport(node)) {
                  const importTemplate = {
                    name: node.importClause.name.text,
                    kind: "default",
                    module: path.normalize(node.moduleSpecifier.text),
                    isTypeOnly: !!node?.importClause?.isTypeOnly,
                  };
                  imports.push(importTemplate);
                }

                /**
                 * @example import { export1, export2 } from 'foo';
                 * @example import { export1 as alias1 } from 'foo';
                 * @example import { export1, export2 as alias2 } from 'foo';
                 */
                if (hasNamedImport(node)) {
                  node.importClause.namedBindings.elements.forEach(
                    (element) => {
                      const importTemplate = {
                        name: element.name.text,
                        kind: "named",
                        module: path.normalize(node.moduleSpecifier.text),
                        isTypeOnly: !!node?.importClause?.isTypeOnly,
                      };
                      imports.push(importTemplate);
                    }
                  );
                }

                /**
                 * @example import * as name from './my-module.js';
                 */
                if (hasAggregatingImport(node)) {
                  const importTemplate = {
                    name: node.importClause.namedBindings.name.text,
                    kind: "aggregate",
                    module: path.normalize(node.moduleSpecifier.text),
                    isTypeOnly: !!node?.importClause?.isTypeOnly,
                  };
                  imports.push(importTemplate);
                }

                /**
                 * @example import './my-module.js';
                 */
                if (hasSideEffectImport(node)) {
                  const importTemplate = {
                    kind: "side-effect",
                    module: path.normalize(node.moduleSpecifier.text),
                    isTypeOnly: false,
                  };
                  imports.push(importTemplate);
                }
                /**
                 * EXPORTS
                 */
                /**
                 * @example export const foo = '';
                 */
                if (hasExportModifier(node) && ts.isVariableStatement(node)) {
                  node?.declarationList?.declarations?.forEach(
                    (declaration) => {
                      const _export = {
                        kind: "js",
                        name: declaration.name.getText(),
                        declaration: {
                          name: declaration.name.getText(),
                          module: filePath,
                        },
                      };

                      exports.push(_export);
                    }
                  );
                }

                /**
                 * @example export default var1;
                 */
                if (node.kind === ts.SyntaxKind.ExportAssignment) {
                  const _export = {
                    kind: "js",
                    name: "default",
                    declaration: {
                      name: node.expression.text,
                      module: filePath,
                    },
                  };
                  exports.push(_export)
                }

                if (node.kind === ts.SyntaxKind.ExportDeclaration) {
                  /**
                   * @example export { var1, var2 };
                   */
                  if (hasNamedExports(node) && !isReexport(node)) {
                    node.exportClause?.elements?.forEach((element) => {
                      const _export = {
                        kind: "js",
                        name: element.name.getText(),
                        declaration: {
                          name:
                            element.propertyName?.getText() ||
                            element.name.getText(),
                          module: filePath,
                        },
                      };

                      exports.push(_export);
                    });
                  }

                  /**
                   * @example export * from 'foo';
                   * @example export * from './my-module.js';
                   */
                  if (isReexport(node) && !hasNamedExports(node)) {
                    const _export = {
                      kind: "js",
                      name: "*",
                      declaration: {
                        name: "*",
                        module: filePath,
                        // package: node.moduleSpecifier
                        //   .getText()
                        //   .replace(/'/g, ""),
                      },
                    };
                    exports.push(_export);
                  }

                  /**
                   * @example export { var1, var2 } from 'foo';
                   * @example export { var1, var2 } from './my-module.js';
                   */
                  if (isReexport(node) && hasNamedExports(node)) {
                    node.exportClause?.elements?.forEach((element) => {
                      const _export = {
                        kind: "js",
                        name: element.name.getText(),
                        declaration: {
                          name:
                            element.propertyName?.getText() ||
                            element.name.getText(),
                          module: filePath,
                        },
                      };

                      if (
                        isBareModuleSpecifier(node.moduleSpecifier.getText())
                      ) {
                        _export.declaration.package = node.moduleSpecifier
                          .getText()
                          .replace(/'/g, "");
                      } else {
                        _export.declaration.module = node.moduleSpecifier
                          .getText()
                          .replace(/'/g, "");
                      }
                      exports.push(_export);
                    });
                  }
                }

                /**
                 * @example export function foo() {}
                 */
                if (node.kind === ts.SyntaxKind.FunctionDeclaration) {
                  if (hasExportModifier(node)) {
                    const isDefault = hasDefaultModifier(node);
                    const _export = {
                      kind: "js",
                      name: isDefault ? "default" : node.name?.getText() || "",
                      declaration: {
                        name: node.name?.getText() || "",
                        module: path,
                      },
                    };
                    exports.push(_export);
                  }
                }

                /**
                 * @example export class Class1 {}
                 */
                if (node.kind === ts.SyntaxKind.ClassDeclaration) {
                  if (hasExportModifier(node)) {
                    const isDefault = hasDefaultModifier(node);
                    const _export = {
                      kind: "js",
                      name: isDefault ? "default" : node?.name?.text || "",
                      declaration: {
                        name: node?.name?.text || "",
                        module: moduleDoc.path,
                      },
                    };
                    exports.push(_export);
                  }
                }

                ts.forEachChild(node, visitNode);
              }
            }

            collect(ast, module.path);

            module.collectedImports = imports;
            module.collectedExports = exports;
          },
          end(moduleGraph) {
            for (const module of moduleGraph.modules.values()) {

              for (const _export of module.collectedExports) {
                let isImported = false;

                for (const modulePath of module.importedBy) {
                  const m = moduleGraph.get(modulePath);
                  const foundExport = m.collectedImports.find(i => i.name === _export.name && i.module === _export.declaration.module)
                  isImported = foundExport || isImported;
                }

                if (!isImported) {
                  console.log(`"${_export.name}" from "${_export.declaration.module}" is not imported by anything`)
                }
              }
            }
          }
        },
      ],
    });
  });

  // it('graph-simple `findImportChains` callback', async () => {
  //   /**
  //    * index.js -> bar.js -> baz.js
  //    */
  //   const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('graph-simple') });

  //   const chains = moduleGraph.findImportChains((p) => p.endsWith('baz.js'));
  //   assert.deepStrictEqual(chains[0], ['index.js', 'bar.js', 'baz.js']);
  // });

  // it('dynamic-import', async () => {
  //   /**
  //    * index.js -> import('./foo.js')
  //    */
  //   const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('dynamic-import') });

  //   assert(moduleGraph.graph.get('index.js').has('foo.js'));
  // });

  // it('dynamic-import-in-cjs', async () => {
  //   /**
  //    * Ignores `requires`, but still follows dynamic imports
  //    */
  //   const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('dynamic-import-in-cjs') });

  //   assert(moduleGraph.graph.get('index.js').has('foo.js'));
  //   // `foo.js` dynamically imports `baz.js`
  //   assert(moduleGraph.graph.get('foo.js').has('baz.js'));
  //   // `foo.js` `require`s `bar.js`, but it's not included in the graph
  //   assert.equal(moduleGraph.graph.get('foo.js').has('bar.js'), false);
  //   assert(moduleGraph.graph.get('baz.js').has('qux.js'));
  // });

  // it('multiple-entrypoints', async () => {
  //   const moduleGraph = await createModuleGraph(['./a.js', './c.js'], { basePath: fixture('multiple-entrypoints') });

  //   assert(moduleGraph.modules.size, 3);
  // });

  // it('multiple-entrypoints-import-chains', async () => {
  //   /**
  //    * a.js -> b.js -> c.js
  //    * d.js -> c.js
  //    */
  //   const moduleGraph = await createModuleGraph(['./a.js', './d.js'], { basePath: fixture('multiple-entrypoints-import-chains') });

  //   const chains = moduleGraph.findImportChains((p) => p.endsWith('c.js'));
  //   assert.deepStrictEqual(chains[0], ['a.js', 'b.js', 'c.js']);
  //   assert.deepStrictEqual(chains[1], ['d.js', 'c.js']);
  // });

  // it('circular', async () => {
  //   /**
  //    * a.js -> b.js -> c.js -> a.js
  //    *
  //    * Doesn't result in an infinite loop
  //    */
  //   const moduleGraph = await createModuleGraph('./a.js', { basePath: fixture('circular') });
  //   assert.equal(moduleGraph.modules.size, 3);
  // });

  // it('multiple-entrypoints-import-chains-circular', async () => {
  //   /**
  //    * a.js -> b.js -> c.js -> d.js
  //    * d.js -> c.js
  //    */
  //   const moduleGraph = await createModuleGraph(['./a.js', './d.js'], { basePath: fixture('multiple-entrypoints-import-chains-circular') });

  //   const chains = moduleGraph.findImportChains((p) => p.endsWith('c.js'));
  //   assert.deepStrictEqual(chains[0], ['a.js', 'b.js', 'c.js']);
  //   assert.deepStrictEqual(chains[1], ['d.js', 'c.js']);
  // });

  // it('typescript', async () => {
  //   const moduleGraph = await createModuleGraph('./index.ts', {
  //     basePath: fixture('typescript'),
  //     plugins: [typescript()]
  //   });

  //   assert(moduleGraph.graph.get('index.ts').has('foo.ts'));
  //   assert(moduleGraph.graph.get('foo.ts').has('node_modules/bar/index.js'));
  // });

  // it('require-in-chain', async () => {
  //   const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('require-in-chain') });
  //   // Does not include `bar.js` because it was `require`d
  //   assert.equal(moduleGraph.modules.size, 2);
  // });

  // it('import-attributes', async () => {
  //   const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('import-attributes') });

  //   assert(moduleGraph.graph.get('index.js').has('data.json'));
  //   assert(moduleGraph.graph.get('index.js').has('styles.css'));
  // });

  // it('multiple-import-chains', async () => {
  //   /**
  //    *     a
  //    *    / \
  //    *   b   d
  //    *    \ /
  //    *     c
  //    */
  //   const moduleGraph = await createModuleGraph('./a.js', { basePath: fixture('multiple-import-chains') });
  //   const chains = moduleGraph.findImportChains('c.js');

  //   assert.equal(chains.length, 2);
  //   assert.deepStrictEqual(chains[0], ['a.js', 'b.js', 'c.js']);
  //   assert.deepStrictEqual(chains[1], ['a.js', 'd.js', 'c.js']);

  //   assert.deepStrictEqual(moduleGraph.get('c.js').importedBy, ['b.js', 'd.js']);
  // });

  // it('resolves-private', async () => {
  //   /**
  //    * index.js -> #private
  //    */
  //   const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('resolves-private') });

  //   assert(moduleGraph.graph.get('index.js').has('private.js'));
  // });

  // it('ignores-builtins', async () => {
  //   /**
  //    * index.js
  //    *  - node:fs
  //    *  - fs
  //    *  - path
  //    */
  //   const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('ignores-builtins') });

  //   assert.equal(moduleGraph.modules.size, 1);
  // });

  // it('external-dependencies', async () => {
  //   /**
  //    * 'foo'
  //    */
  //   const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('external-dependencies') });
  //   const m = moduleGraph.get('node_modules/foo/index.js');

  //   assert(m.packageRoot.pathname.endsWith('test/fixtures/external-dependencies/node_modules/foo'));
  // });

  // it('ignore-external', async () => {
  //   /**
  //    * a.js -> b.js -> foo
  //    */
  //   const moduleGraph = await createModuleGraph('./a.js', {
  //     basePath: fixture('ignore-external'),
  //     ignoreExternal: true
  //   });

  //   assert.equal(moduleGraph.modules.size, 2);
  //   assert.equal(moduleGraph.externalDependencies.size, 0);
  // });

  // it('external-dependencies-scoped-package', async () => {
  //   /**
  //    * 'foo'
  //    */
  //   const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('external-dependencies-scoped-package') });
  //   const m = moduleGraph.get('node_modules/@foo/bar/index.js');

  //   assert(m.packageRoot.pathname.endsWith('test/fixtures/external-dependencies-scoped-package/node_modules/@foo/bar'));
  // });

  // it('external-package-exports-regular', async () => {
  //   /**
  //    * 'foo' with package exports ".": "./foo.js"
  //    */
  //   const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('external-package-exports-regular') });
  //   const m = moduleGraph.get('node_modules/foo/foo.js');

  //   assert(m.packageRoot.pathname.endsWith('test/fixtures/external-package-exports-regular/node_modules/foo'));
  // });

  // it('monorepo', async () => {
  //   const moduleGraph = await createModuleGraph('./index.js', { basePath: fixture('monorepo/packages/foo') });
  //   const m = moduleGraph.get('../../node_modules/bar/index.js');
  //   assert(m.packageRoot.pathname.endsWith('monorepo/node_modules/bar'));
  // });
});

describe("plugins", () => {
  it("start", async () => {
    const plugin = {
      name: "start-plugin",
      start: ({ entrypoints, basePath, exportConditions }) => {
        assert.deepStrictEqual(entrypoints, ["index.js"]);
        assert.equal(basePath, fixture("plugins-start"));
        assert.deepStrictEqual(exportConditions, ["node", "import"]);
      },
    };
    await createModuleGraph("./index.js", {
      basePath: fixture("plugins-start"),
      plugins: [plugin],
    });
  });

  it("end", async () => {
    let called = false;
    let graphSize = 0;

    const plugin = {
      name: "end-plugin",
      end: (moduleGraph) => {
        graphSize = moduleGraph.modules.size;
        called = true;
        moduleGraph.foo = "bar";
      },
    };
    const moduleGraph = await createModuleGraph("./index.js", {
      basePath: fixture("plugins-end"),
      plugins: [plugin],
    });

    assert(called);
    assert.equal(graphSize, 2);
    assert.equal(moduleGraph.foo, "bar");
  });

  it("handleImport - boolean", async () => {
    /**
     * index.js
     * - foo?skip
     * - bar.js
     */

    const skipPlugin = {
      name: "skip-plugin",
      handleImport: ({ source, importer, importee }) => {
        if (importee.endsWith("?skip")) {
          return false;
        }
      },
    };
    const moduleGraph = await createModuleGraph("./index.js", {
      basePath: fixture("plugins-handle-import-boolean"),
      plugins: [skipPlugin],
    });

    assert.deepStrictEqual(moduleGraph.getUniqueModules(), [
      "index.js",
      "bar.js",
    ]);
  });

  it("handleImport - string", async () => {
    /**
     * index.js
     * - foo?replace
     * - bar.js
     */

    const skipPlugin = {
      name: "skip-plugin",
      handleImport: ({ source, importer, importee }) => {
        if (importee.endsWith("?replace")) {
          return "./baz.js";
        }
      },
    };
    const moduleGraph = await createModuleGraph("./index.js", {
      basePath: fixture("plugins-handle-import-string"),
      plugins: [skipPlugin],
    });

    assert.deepStrictEqual(moduleGraph.getUniqueModules(), [
      "index.js",
      "baz.js",
      "bar.js",
    ]);
  });

  it("resolve", async () => {
    /**
     * index.js -> bar.js
     */

    const resolvePlugin = {
      name: "resolve-plugin",
      resolve: ({ importee, importer, exportConditions }) => {
        /**
         * Rewrite `./bar.js` (importee) to `./baz.js`
         */
        return moduleResolve(
          "./baz.js",
          pathToFileURL(importer),
          exportConditions
        );
      },
    };

    const moduleGraph = await createModuleGraph("./index.js", {
      basePath: fixture("plugins-resolve"),
      plugins: [resolvePlugin],
    });

    assert.deepStrictEqual(moduleGraph.getUniqueModules(), [
      "index.js",
      "baz.js",
    ]);
  });

  it("resolve multiple", async () => {
    const resolvePlugin1 = {
      name: "skip-plugin",
      resolve: ({ importee, importer, exportConditions }) => {
        return moduleResolve(
          "./baz.js",
          pathToFileURL(importer),
          exportConditions
        );
      },
    };

    let called = false;
    const resolvePlugin2 = {
      name: "skip-plugin",
      resolve: ({ importee, importer, exportConditions }) => {
        called = true;
      },
    };

    const moduleGraph = await createModuleGraph("./index.js", {
      basePath: fixture("plugins-resolve"),
      plugins: [resolvePlugin1, resolvePlugin2],
    });

    /** `resolvePlugin1` has already resolved the module, so `resolvePlugin2`'s `resolve` hook gets skipped */
    assert.equal(called, false);
  });

  it("analyze", async () => {
    const analyzePlugin = {
      name: "analyze-plugin",
      analyze: (module) => {
        if (module.source.includes("process.env")) {
          module.usesProcessEnv = true;
        }
      },
    };
    const moduleGraph = await createModuleGraph("./index.js", {
      basePath: fixture("plugins-analyze"),
      plugins: [analyzePlugin],
    });

    assert(moduleGraph.get("bar.js").usesProcessEnv);
  });
});

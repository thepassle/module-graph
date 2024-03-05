import path from "path";

/**
 * @typedef {import('./types.js').Module} Module
 */

export class ModuleGraph {
  /**
   * @param {string} basePath
   * @param {string | string[]} entrypoints
   */
  constructor(basePath, entrypoints) {
    /**
     * @type {Map<string, Set<string>>}
     */
    this.graph = new Map();
    this.entrypoints = (typeof entrypoints === 'string' ? [entrypoints] : entrypoints).map(e => path.posix.normalize(e));
    this.basePath = basePath;
    /**
     * @TODO This doesn't take into account nested dependencies
     * we may need to read the package.json (based on the `packageRoot`) for the version of a dependency
     * and then store multiple versions given a bare module specifier -> need to think of a good data structure for this
     */
    this.externalDependencies = new Set();
    /**
     * @type {Map<string, Module>}
     */
    this.modules = new Map();
  }

  /**
   * 
   * @param {string | ((path: string) => boolean)} targetModule} targetModule 
   * @returns {Module | undefined}
   */
  get (targetModule) {
    if (typeof targetModule === "function") {
      for (const [module, value] of this.modules.entries()) {
        if (targetModule(module)) {
          return value;
        }
      }
    } else {
      return this.modules.get(targetModule);
    }
  }

  /**
   * @returns {string[]}
   */
  getUniqueModules() {
    const uniqueModules = new Set();

    for (const [module, dependencies] of this.graph.entries()) {
      uniqueModules.add(module);
      for (const dependency of dependencies) {
        uniqueModules.add(dependency);
      }
    }

    return [...uniqueModules].map((p) => path.relative(this.basePath, path.join(this.basePath, p)));
  }

  /**
   * @param {string | ((path: string) => boolean)} targetModule
   * @returns {string[][]}
   */
  findImportChains(targetModule) {
    /**
     * @type {string[][]}
     */
    const chains = [];

    /**
     * @param {string} module 
     * @param {string[]} path 
     * @returns 
     */
    const dfs = (module, path) => {
      const condition =
        typeof targetModule === "function"
          ? targetModule(module)
          : module === targetModule;
      if (condition) {
        chains.push(path);
        return;
      }

      const dependencies = this.graph.get(module);
      if (dependencies) {
        for (const dependency of dependencies) {
          dfs(dependency, [...path, dependency]);
        }
      }
    };

    for (const entrypoint of this.entrypoints) {
      dfs(entrypoint, [entrypoint]);
    }

    return chains;
  }
}

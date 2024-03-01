import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath, resolve as urlResolve } from "url";
import { builtinModules } from "module";
import { init as initEsl, parse } from "es-module-lexer";
// import { init as initFmu, guessJsSyntax } from 'fmu'
import { moduleResolve } from "import-meta-resolve";

/**
 * @typedef {import('./types.js').Module} Module
 * @typedef {import('./types.js').Plugin} Plugin
 */

/**
 * @TODO
 * - multiple entrypoints? ['./index.js', './foo.js']
 */

/**
 * @param {string} specifier
 * @returns {boolean}
 */
export const isBareModuleSpecifier = (specifier) => !!specifier?.replace(/'/g, '')[0].match(/[@a-zA-Z]/g);

/**
 * @param {string} specifier
 * @returns {boolean}
 */
export const isScopedPackage = (specifier) => specifier.startsWith('@');

export class ModuleGraph {
  /**
   * @param {string} basePath
   * @param {string} entrypoint
   */
  constructor(basePath, entrypoint) {
    /**
     * @type {Map<string, Set<string>>}
     */
    this.graph = new Map();
    this.entrypoint = path.posix.normalize(entrypoint);
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

    return [...uniqueModules].map((p) => path.posix.relative(this.basePath, path.join(this.basePath, p)));
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
     * 
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
          if (!path.includes(dependency)) {
            dfs(dependency, [...path, dependency]);
          }
        }
      }
    };

    dfs(this.entrypoint, [this.entrypoint]);

    return chains;
  }
}

/**
 *
 * @param {string} entrypoint
 * @param {{
 *  conditions?: string[],
 *  preserveSymlinks?: boolean,
 *  basePath?: string,
 *  plugins?: Plugin[]
 * }} options
 * @returns {Promise<ModuleGraph>}
 */
export async function createModuleGraph(entrypoint, options = {}) {
  const plugins = options?.plugins ?? [];
  const basePath = options?.basePath ?? process.cwd();
  const conditions = new Set(options?.conditions ?? ["node", "import"]);
  const preserveSymlinks = options?.preserveSymlinks ?? false;
  
  const module = path.posix.relative(
    basePath,
    fileURLToPath(
      moduleResolve(entrypoint, pathToFileURL(path.join(basePath, entrypoint)))
    )
  );


  /**
   * [PLUGINS] - start
   */
  for (const plugin of plugins) {
    plugin.start?.({
      entrypoint,
      basePath,
      conditions,
      preserveSymlinks,
    });
  }

  const importsToScan = new Set([module]);

  let moduleGraph = new ModuleGraph(basePath, entrypoint);
  moduleGraph.modules.set(module, {
    href: pathToFileURL(module).href,
    pathname: pathToFileURL(module).pathname,
    path: module,
    source: '',
    importedBy: []
  });

  /** Init es-module-lexer wasm */
  await initEsl;
  /** Init fmu wasm */
  // await initFmu();

  while (importsToScan.size) {
    importsToScan.forEach((dep) => {
      importsToScan.delete(dep);
      const source = fs.readFileSync(path.join(basePath, dep)).toString();

      const [imports] = parse(source);

      imports?.forEach(({n: importee}) => {
        if (!importee) return;

        /**
         * [PLUGINS] - handleImport
         */
        for (const plugin of plugins) {
          const result = /** @type {void | boolean | string} */ (plugin.handleImport?.({
            source,
            importer: dep,
            importee,
          }));
          if (typeof result === 'string') {
            importee = result;
          } else if (result === false) {
            return;
          }
        }
        /** Skip built-in modules like fs, path, etc */
        if (builtinModules.includes(importee.replace("node:", ""))) return;
        if (isBareModuleSpecifier(importee)) {
          moduleGraph.externalDependencies.add(importee);
        }

        try {
          /**
           * Resolve the module's location
           */
          const importer = pathToFileURL(path.join(basePath, dep));

          /**
           * [PLUGINS] - resolve
           */
          let resolvedURL;
          for (const plugin of plugins) {
            const result = plugin.resolve?.({
              importee,
              importer,
              conditions,
              preserveSymlinks,
            });
            if (result) {
              resolvedURL = result;
            }
          }

          /**
           * If no plugins resolved the URL, defer to default resolution
           */
          if (!resolvedURL) {
            resolvedURL = moduleResolve(importee, importer, conditions, preserveSymlinks);
          }
          const pathToDependency = path.posix.relative(basePath, fileURLToPath(resolvedURL));
             
          /** 
           * Get the packageRoot of the external dependency, which is useful for getting
           * to the package.json, for example. You can't always `require.resolve` it, 
           * if it's not included in the packages package exports.
           */
          let packageRoot;
          if (pathToDependency.includes('node_modules')) {
            const separator = 'node_modules' + path.posix.sep;
            const lastIndex = resolvedURL.pathname.lastIndexOf(separator);
            
            const filePath = resolvedURL.pathname.substring(0, lastIndex + separator.length);
            const importSpecifier = resolvedURL.pathname.substring(lastIndex + separator.length);
            
            /**
             * @example "@foo/bar"
             */
            if (isScopedPackage(importSpecifier)) {
              const split = importSpecifier.split('/');
              const pkg = [split[0], split[1]].join('/');
              packageRoot = path.posix.join(filePath, pkg);
            } else {
              const pkg = importSpecifier.split('/')[0];
              packageRoot = path.posix.join(filePath, pkg);
            }
          }

          /** @type {Module} */
          const module = {
            href: resolvedURL.href,
            pathname: resolvedURL.pathname,
            path: pathToDependency,
            importedBy: [],
            source: '',
            ...(packageRoot ? {packageRoot} : {}),
          }
          
          importsToScan.add(pathToDependency);

          if (!moduleGraph.modules.has(pathToDependency)) {
            moduleGraph.modules.set(pathToDependency, module);
          }
          if (!moduleGraph.graph.has(dep)) {
            moduleGraph.graph.set(dep, new Set());
          }
          /** @type {Set<string>} */ (moduleGraph.graph.get(dep)).add(pathToDependency);

          const importedModule = moduleGraph.modules.get(pathToDependency);
          if (importedModule && !importedModule.importedBy.includes(dep)) {
            importedModule.importedBy.push(dep);
          }
        } catch (e) {
          console.log(`Failed to resolve dependency "${importee}".`, e);
        }
      });

      /**
       * Add `source` code to the Module, and apply the `analyze` function
       * from the options, if it's provided.
       */
      const currentModule = /** @type {Module} */ (moduleGraph.modules.get(dep));
      currentModule.source = source;

      /**
       * [PLUGINS] - analyze
       */
      for (const plugin of plugins) {
        plugin.analyze?.(currentModule);
      }
    });
  }

  /**
   * [PLUGINS] - end
   */
  for (const plugin of plugins) {
    const result = plugin.end?.(moduleGraph);
    if (result) {
      moduleGraph = result;
    }
  }

  return moduleGraph;
}
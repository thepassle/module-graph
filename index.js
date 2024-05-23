import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { builtinModules } from "module";
import { init, parse } from "es-module-lexer";
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { ModuleGraph } from "./ModuleGraph.js";
import { extractPackageNameFromSpecifier, isBareModuleSpecifier, isScopedPackage, toUnix } from "./utils.js";
import * as pm from 'picomatch';

const picomatch = pm.default;

/**
 * @typedef {import('./types.js').Module} Module
 * @typedef {import('./types.js').Plugin} Plugin
 * @typedef {import('@rollup/plugin-node-resolve').RollupNodeResolveOptions} RollupNodeResolveOptions
 */

/**
 * @param {string | string[]} entrypoints
 * @param {RollupNodeResolveOptions & {
 *  plugins?: Plugin[],
 *  basePath?: string,
 *  external?: {
 *   ignore?: boolean,
 *   include?: string[],
 *   exclude?: string[]
 *  },
 *  ignoreDynamicImport?: boolean,
 *  exclude?: Array<string | ((importee: string) => boolean)>,
 * }} options
 * @returns {Promise<ModuleGraph>}
 */
export async function createModuleGraph(entrypoints, options = {}) {
  const { 
    plugins = [], 
    basePath = process.cwd(), 
    exportConditions = ["node", "import"],
    ignoreDynamicImport = false,
    external = {
      ignore: false,
      include: [],
      exclude: [],
    },
    exclude: excludePatterns = [],
    ...resolveOptions 
  } = options;
  if (external.ignore && external.include?.length) {
    throw new Error('Cannot use both "ignore" and "include" in the external option.');
  }
  const exclude = excludePatterns.map(p => typeof p === 'string' ? picomatch(p) : p);

  const r = nodeResolve({
    ...resolveOptions, 
    exportConditions,
    rootDir: basePath,
  });

  // @ts-ignore
  const resolveFn = r.resolveId.handler.bind({resolve: () => null});

  /**
   * @param {string} importee 
   * @param {string} importer 
   * @param {Object} options 
   * @returns {Promise<URL | undefined>}
   */
  async function resolve(importee, importer, options = {}) {
    const resolved = await resolveFn(importee, importer, options);
    if (!resolved) {
      throw new Error(`Failed to resolve "${importee}" from "${importer}".`);
    }
    return pathToFileURL(resolved.id);
  }

  const processedEntrypoints = (typeof entrypoints === "string" ? [entrypoints] : entrypoints);
  const modules = processedEntrypoints.map(e => toUnix(path.relative(basePath, path.join(basePath, e))));

  /**
   * [PLUGINS] - start
   */
  for (const { name, start } of plugins) {
    if (!name) {
      throw new Error('Plugin must have a name');
    }

    try {
      await start?.({
        entrypoints: modules,
        basePath,
        exportConditions,
      });
    } catch(e) {
      const { stack } = /** @type {Error} */ (e);
      const error = new Error(`[PLUGIN] "${name}" failed on the "start" hook.\n\n${stack}`);
      throw error;
    }
  }

  const importsToScan = new Set([...modules]);

  let moduleGraph = new ModuleGraph(basePath, entrypoints);
  for (const module of modules) {
    moduleGraph.modules.set(module, {
      href: pathToFileURL(module).href,
      pathname: pathToFileURL(module).pathname,
      path: module,
      source: '',
      facade: false,
      hasModuleSyntax: true,
      importedBy: []
    });

    moduleGraph.graph.set(module, new Set());
  }

  /** Init es-module-lexer wasm */
  await init;

  while (importsToScan.size) {
    for (const dep of importsToScan) {
      importsToScan.delete(dep);
      const source = fs.readFileSync(path.join(basePath, dep)).toString();

      const [imports, _, facade, hasModuleSyntax] = parse(source);
      importLoop: for (let { n: importee, ss: start, se: end } of imports) {
        const importString = source.substring(start, end);
        if (!importee) continue;
        if (ignoreDynamicImport && importString.startsWith('import(')) continue;
        if (isBareModuleSpecifier(importee) && external.ignore) continue;
        if (isBareModuleSpecifier(importee) && external.exclude?.length && external.exclude?.includes(extractPackageNameFromSpecifier(importee))) continue;
        if (isBareModuleSpecifier(importee) && external.include?.length && !external.include?.includes(extractPackageNameFromSpecifier(importee))) continue;

        /**
         * [PLUGINS] - handleImport
         */
        for (const { name, handleImport } of plugins) {
          try {
            const result = await /** @type {void | boolean | string} */ (handleImport?.({
              source,
              importer: dep,
              importee,
            }));
  
            if (typeof result === 'string') {
              importee = result;
            } else if (result === false) {
              continue importLoop;
            }
          } catch(e) {
            const { stack } = /** @type {Error} */ (e);
            const error = new Error(`[PLUGIN] "${name}" failed on the "handleImport" hook.\n\n${stack}`);
            throw error;
          }
        }
        /** Skip built-in modules like fs, path, etc */
        if (builtinModules.includes(importee.replace("node:", ""))) continue;

        /**
         * Resolve the module's location
         */
        const importer = path.join(basePath, dep);
        /**
         * [PLUGINS] - resolve
         */
        let resolvedURL;
        for (const { name, resolve } of plugins) {
          try {
            const result = await resolve?.({
              importee,
              importer,
              exportConditions,
              ...resolveOptions,
            });

            if (result) {
              resolvedURL = result;
              break;
            }
          } catch (e) {
            const { stack } = /** @type {Error} */ (e);
            const error = new Error(`[PLUGIN] "${name}" failed on the "resolve" hook.\n\n${stack}`);
            throw error;
          }
        }

        /**
         * If no plugins resolved the URL, defer to default resolution
         */
        if (!resolvedURL) {
          try {
            resolvedURL = /** @type {URL} */ (await resolve(importee, importer));
          } catch(e) {
            console.error(`Failed to resolve "${importee}" from "${importer}".`);
            continue;
          }
        }
        const pathToDependency = toUnix(path.relative(basePath, fileURLToPath(resolvedURL)));

        /**
         * Handle excludes, we do this here, because we want the resolved file paths, like
         * `node_modules/foo/index.js` to be excluded, not the importee, which would just be `foo`
         */
        if (exclude.some(match => match(/** @type {string} */ (pathToDependency)))) {
          continue;
        }      

        /** 
         * Get the packageRoot of the external dependency, which is useful for getting
         * to the package.json, for example. You can't always `require.resolve` it, 
         * if it's not included in the packages package exports.
         */
        let packageRoot;
        let pkg;
        if (pathToDependency.includes('node_modules')) {
          const resolvedPath = fileURLToPath(resolvedURL);
          const separator = 'node_modules' + path.sep;
          const lastIndex = resolvedPath.lastIndexOf(separator);

          const filePath = resolvedPath.substring(0, lastIndex + separator.length);
          const importSpecifier = resolvedPath.substring(lastIndex + separator.length);
          /**
           * @example "@foo/bar"
           */
          if (isScopedPackage(importSpecifier)) {
            const split = importSpecifier.split(path.sep);
            pkg = [split[0], split[1]].join(path.sep);
            packageRoot = pathToFileURL(path.join(filePath, pkg));
          } else {
            pkg = importSpecifier.split(path.sep)[0];
            packageRoot = pathToFileURL(path.join(filePath, pkg));
          }
        }

        /** @type {Module} */
        const module = {
          href: resolvedURL.href,
          pathname: resolvedURL.pathname,
          path: pathToDependency,
          importedBy: [],
          facade: false,
          hasModuleSyntax: true,
          source: '',
          ...(packageRoot ? {packageRoot} : {}),
        }

        if (isBareModuleSpecifier(importee)) {
          moduleGraph.externalModules.set(resolvedURL.pathname, {
            ...module,
            package: /** @type {string} */ (pkg),
            importSpecifier: importee
          });
        }
        
        if (!moduleGraph.graph.has(pathToDependency)) {
          importsToScan.add(pathToDependency);
        }

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
      };

      /**
       * Add `source` code to the Module
       */
      const currentModule = /** @type {Module} */ (moduleGraph.modules.get(dep));
      currentModule.source = source;
      currentModule.facade = facade;
      currentModule.hasModuleSyntax = hasModuleSyntax;

      const externalModule = moduleGraph.externalModules.get(currentModule.pathname);
      if (externalModule) {
        externalModule.source = source;
        externalModule.facade = facade;
        externalModule.hasModuleSyntax = hasModuleSyntax;
      }

      /**
       * [PLUGINS] - analyze
       */
      for (const { name, analyze } of plugins) {
        try {
          await analyze?.(currentModule);
        } catch(e) {
          const { stack } = /** @type {Error} */ (e);
          const error = new Error(`[PLUGIN] "${name}" failed on the "analyze" hook.\n\n${stack}`);
          throw error;
        }
      }
    };
  }

  /**
   * [PLUGINS] - end
   */
  for (const { name, end } of plugins) {
    try {
      await end?.(moduleGraph);
    } catch(e) {
      const { stack } = /** @type {Error} */ (e);
      const error = new Error(`[PLUGIN] "${name}" failed on the "end" hook.\n\n${stack}`);
      throw error;
    }
  }

  return moduleGraph;
}
import { ModuleGraph } from './index.js';

export interface Module {
  href: string,
  pathname: string,
  path: string,
  source: string,
  packageRoot?: string,
  importedBy: string[],
  kind: 'Mixed' | 'Unkown' | 'ESM' | 'CJS',
}

export interface Plugin {
  /**
   * Runs once
   * Use for initializing logic of the plugin
   */
  start?: (params: {
    entrypoint: string,
    basePath: string,
    conditions: Set<string>,
    preserveSymlinks: boolean,
  }) => void
  /**
   * Runs for every import starting (but excluding) the entrypoint
   * Can be used to implement custom logic or rewrite a specifier
   * If false is returned, the import will be skipped entirely
   * If a string is returned, it will try to resolve that instead
   */
  handleImport?: (params: {
    source: string,
    importer: string,
    importee: string,
  }) => void | boolean | string,
  /**
   * Runs for every module
   * Can be used to analyze the module (or its source), and add 
   * additional meta information to the Module object
   * You can mutate the module directly, no need to return it
   */
  analyze?: (module: Module) => void,
  /**
   * Runs for every import starting (but excluding) the entrypoint
   * Can be used to implement custom resolution logic
   * If nothing is returned, the default resolution will be used
   * If a URL is returned, it will output that instead
   */
  resolve?: (params: {
    importee: string,
    importer: URL,
    conditions: Set<string>,
    preserveSymlinks: boolean,
  }) => URL | void,
  /**
   * Runs once
   * Use for cleanup logic of the plugin
   */
  end?: (moduleGraph: ModuleGraph) => ModuleGraph | void
}
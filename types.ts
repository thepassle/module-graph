import { ModuleGraph } from './ModuleGraph.js';
import type { ImportSpecifier, ExportSpecifier } from 'es-module-lexer';
import type { RollupNodeResolveOptions } from '@rollup/plugin-node-resolve';

export interface Module {
  href: string,
  pathname: string,
  path: string,
  source: string,
  packageRoot?: string,
  imports: readonly ImportSpecifier[],
  exports: readonly ExportSpecifier[],
  facade: boolean,
  hasModuleSyntax: boolean,
  importedBy: string[],
}

export interface Plugin {
  name: string;
  /**
   * Runs once
   * Use for initializing logic of the plugin
   */
  start?: (params: {
    entrypoints: string[],
    basePath: string,
    exportConditions: string[],
  }) => void | Promise<void>;
  /**
   * Runs for every import starting (but excluding) the entrypoints
   * Can be used to implement custom logic or rewrite a specifier
   * If false is returned, the import will be skipped entirely
   * If a string is returned, it will try to resolve that instead
   */
  handleImport?: (params: {
    source: string,
    importer: string,
    importee: string,
  }) => void | boolean | string | Promise<void | boolean | string>;
  /**
   * Runs for every module
   * Can be used to analyze the module (or its source), and add 
   * additional meta information to the Module object
   * You can mutate the module directly, no need to return it
   */
  analyze?: (module: Module) => void | Promise<void>;
  /**
   * Runs for every import starting (but excluding) the entrypoints
   * Can be used to implement custom resolution logic
   * If nothing is returned, the default resolution will be used
   * If a URL is returned, it will output that instead
   */
  resolve?: (params: {
    importee: string,
    importer: URL,
    exportConditions: string[],
  } & RollupNodeResolveOptions) => URL | void | Promise<void | URL>;
  /**
   * Runs once
   * Use for cleanup logic of the plugin
   */
  end?: (moduleGraph: ModuleGraph) => void | Promise<void>;
}
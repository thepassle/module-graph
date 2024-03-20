import { exports as _exports } from "@thepassle/module-utils/exports.js";
import { imports as _imports } from "@thepassle/module-utils/imports.js";

/**
 * @param {string} path
 */
function getFilename(path) {
  return path.split("/").pop();
}

/**
 * @typedef {import('@thepassle/module-utils/exports.js').Export} Export
 * @typedef {import('@thepassle/module-utils/imports.js').Import} Import
 * @typedef {import('../types.js').ExtendedModule<{
 *  imports: Import[],
 *  exports: Export[]
 * }>} ExtendedModule
 * @typedef {import('../types.js').ExtendedModuleGraph<{unusedExports: Export[]}>} ExtendedModuleGraph
 */

/**
 * @type {import('../types.js').Plugin}
 */
export const unusedExports = {
  name: "find-unused-exports",
  analyze: (module) => {
    module.imports = _imports(module.source, module.path);
    module.exports = _exports(module.source, module.path);
  },
  end(moduleGraph) {
    /** @type {Export[]} */
    const unusedExports = [];
    for (const module of moduleGraph.modules.values()) {
      for (const _export of /** @type {ExtendedModule} */ (module).exports) {
        let isImported = false;

        for (const modulePath of module.importedBy) {
          const [m] = /** @type {ExtendedModule[]} */ (moduleGraph.get(modulePath));
          const foundExport = m.imports.find((i) => {
            if (i.kind === 'default' && _export.name === 'default' && getFilename(i.module) === getFilename(/** @type {string} */ (_export.declaration?.module ?? _export.declaration.package))) {
              return true;
            }

            return i.declaration === '*' || (i.declaration === _export.name && getFilename(i.module) === getFilename(/** @type {string} */ (_export.declaration?.module ?? _export.declaration.package)))
          });

          isImported = !!foundExport || isImported;
        }

        if (!isImported) {
          unusedExports.push(_export);
        }
      }
    }

    /** @type {ExtendedModuleGraph} */ (moduleGraph).unusedExports = unusedExports;
  },
};

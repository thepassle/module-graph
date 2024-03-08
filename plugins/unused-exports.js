import { exports as _exports } from "@thepassle/module-utils/exports.js";
import { imports as _imports } from "@thepassle/module-utils/imports.js";

/**
 * @param {string} path
 */
function getFilename(path) {
  return path.split("/").pop();
}

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
    const unusedExports = [];
    for (const module of moduleGraph.modules.values()) {
      for (const _export of module.exports) {
        let isImported = false;

        for (const modulePath of module.importedBy) {
          const [m] = moduleGraph.get(modulePath);
          // @ts-ignore
          const foundExport = m.imports.find((i) => i.name === _export.name && getFilename(i.module) === getFilename(_export.declaration.module));

          isImported = !!foundExport || isImported;
        }

        if (!isImported) {
          unusedExports.push({export: _export, module: _export.declaration.module});
        }
      }
    }

    // @ts-ignore
    moduleGraph.unusedExports = unusedExports;
  },
};

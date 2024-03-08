import { imports as _imports } from '@thepassle/module-utils/imports.js';

/**
 * @type {import('../types.js').Plugin} Plugin
 */
export const imports = {
  name: 'imports-plugin',
  analyze: module => {
    module.imports = _imports(module.source, module.path);
  },
};
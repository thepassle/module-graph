import { exports as _exports } from '@thepassle/module-utils/exports.js';

/**
 * @type {import('../types.js').Plugin} Plugin
 */
export const exports = {
  name: 'exports-plugin',
  analyze: module => {
    module.exports = _exports(module.source, module.path);
  },
};
import { barrelFile as _barrelFile } from '@thepassle/module-utils/barrel-file.js';

/**
 * @param {{
 *  amountOfExportsToConsiderModuleAsBarrel: number
 * }} options 
 * @returns {import('../index.js').Plugin} Plugin
 */
export function barrelFile(options = {amountOfExportsToConsiderModuleAsBarrel: 5}) {
  return {
    name: 'barrel-file-plugin',
    analyze: module => {
      module.isBarrelFile = _barrelFile(module.source, module.path, options);
    },
  };
}
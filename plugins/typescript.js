import t from '@rollup/plugin-typescript';
import { pathToFileURL } from 'url';

/**
 * @typedef {import('../types.js').Plugin} Plugin
 * @typedef {import('@rollup/plugin-typescript').RollupTypescriptOptions} RollupTypescriptOptions
 */

/**
 * @param {RollupTypescriptOptions} options
 * @returns {Plugin}
 */
export function typescript(options = {}) {
  // @ts-expect-error
  const ts = t(options);

  return {
    name: 'typescript',
    async resolve({importer, importee}) {
      const resolved = await ts.resolveId(importee, importer);
      if (resolved) {
        return pathToFileURL(resolved);
      }
    }
  }
}
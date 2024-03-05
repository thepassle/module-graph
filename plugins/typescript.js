import t from '@rollup/plugin-typescript';
import { pathToFileURL } from 'url';

/**
 * @typedef {import('../types.js').Plugin} Plugin
 */

/**
 * @returns {Plugin}
 */
export function typescript() {
  // @ts-expect-error
  const ts = t();

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
/**
 * @param {string} specifier
 * @returns {boolean}
 */
export const isBareModuleSpecifier = (specifier) => !!specifier?.replace(/'/g, '')[0].match(/[@a-zA-Z]/g);

/**
 * @param {string} specifier
 * @returns {boolean}
 */
export const isScopedPackage = (specifier) => specifier.startsWith('@');

/**
 * 
 * @param {string} p 
 * @returns {string}
 */
export const toUnix = p => p.replace(/\\/g, '/');

/**
 *
 * @param {string} specifier
 * @returns {string}
 */
export function extractPackageNameFromSpecifier(specifier) {
  specifier = toUnix(specifier);
  if(isScopedPackage(specifier)) {
    /**
     * @example '@foo/bar'
     * @example '@foo/bar/baz.js'
     */
    const split = specifier.split('/');
    return [split[0], split[1]].join('/');
  } else {
    /**
     * @example 'foo'
     * @example 'foo/bar/baz.js'
     */
    return specifier.split('/')[0];
  }
}

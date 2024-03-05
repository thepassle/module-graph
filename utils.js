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
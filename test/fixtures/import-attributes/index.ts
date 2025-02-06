/**
 * This file uses a `.ts` extension rather than `.js` as this syntax has not yet included in the ECMAScript standard,
 * and is therefore not yet supported in `rs-module-lexer` for `.js` extension files.
 */
import data from './data.json' with { type: 'json' };
// @ts-ignore
import styles from './styles.css' with { type: 'css' };
import { bar } from './bar.js';
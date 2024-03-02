# TODO

## Multiple entrypoints

Example:

```js
const moduleGraph = await createModuleGraph(['./foo.js', './bar.js']);
```

## Track nested dependencies/multiple versions of dependencies

Maybe something like:

```js
{ 
  'external-pkg': { 
    '1.0.0': 'node_modules/external-pkg', 
    '2.0.0': 'node_modules/foo/node_modules/external-pkg'
  } 
}
```

## Detect and ignore cjs?

Can use [fmu](https://github.com/bluwy/fmu) to detect cjs and bail

```js
import { init, guessJsSyntax } from 'fmu'

// initialize wasm (MUST call this before any other APIs)
await init()

const code = `exports.foo = 'bar'`
console.log(await guessJsSyntax(code)) // "CJS"
```

## Plugin error handling

- Throw if no plugin name provided
- Add error handling to plugin calls

## TS?

Can we support analyzing TS sourcecode? Maybe via a plugin?
Might have to do some nasty file extension magic.
Some tsconfig moduleResolution require `.js` file extensions to reference `.ts` files on the fs

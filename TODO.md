# TODO

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

Or maybe I can just use esm-shims `hasModuleSyntax` for this?
`hasModuleSyntax` is false for a module containing only `import('foo')`, because cjs can use `import()`
But if a module does not `hasModuleSyntax`, and there _are_ imports (`!!imports.length`), we can continu analyzing maybe?

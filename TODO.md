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

## `findAll`

Add `findAll` method

```js
// Gets passed `Module`
moduleGraph.findAll(({packageRoot, path, pathname, importedBy}) => {
  if (!!packageRoot) {
    return true;
  }

  if(importedBy.length > 5) {
    return true;
  }
});
```

## CEM

Can I not just apply CEM/A as a plugin?

## Plugins for extra module information

- imports/exports (like the plugin kris and I paired on)
- barrelfiles

## `externalOnly`

foo -> bar -> baz
         \_ qux
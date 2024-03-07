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

## `externalOnly`

foo -> bar -> baz
         \_ qux

```js
import { imports } from "@thepassle/module-utils/imports.js";
import { exports } from "@thepassle/module-utils/exports.js";

const importsPlugin = {
  name: "imports-plugin",
  analyze: (module) => {
    module.imports = imports(module.source, module.path);
  },
};

const exportsPlugin = {
  name: "exports-plugin",
  analyze: (module) => {
    module.imports = exports(module.source, module.path);
  },
};

const moduleGraph = await createModuleGraph("./index.js", {
  plugins: [importsPlugin, exportsPlugin],
});

moduleGraph.get('index.js').imports;
moduleGraph.get('index.js').exports;
```
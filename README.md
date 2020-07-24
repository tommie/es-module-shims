## ES Module Shims

[90% of users](https://caniuse.com/#feat=es6-module) are now running browsers with baseline support for ES modules.

But modules features like Import Maps will take a while to be supported in browsers.

_It turns out that we can actually polyfill new modules features on top of these baseline implementations in a performant 8KB shim._

This includes support for:

* [Import Maps](https://github.com/wicg/import-maps) support.
* `import.meta` and `import.meta.url`.
* Dynamic `import()` shimming when necessary in eg older Firefox versions.

In addition a custom [fetch hook](#fetch-hook) can be implemented allowing for streaming in-browser transform workflows to support custom module types.

Because we are still using the native module loader the edge cases work out comprehensively, including:

* Live bindings in ES modules
* Dynamic import expressions (`import('src/' + varname')`)
* Circular references, with the execption that live bindings are disabled for the first unexecuted circular parent.

Due to the use of a tiny [Web Assembly JS tokenizer for ES module syntax only](https://github.com/guybedford/es-module-lexer), with very simple rewriting rules, transformation is very fast, although in complex cases of hundreds of modules it can be a few hundred milliseconds slower than using SystemJS or native ES modules. See the [SystemJS performance comparison](https://github.com/systemjs/systemjs#performance) for a full performance breakdown in a complex loading scenario.

### Browser Support

Works in all browsers with [baseline ES module support](https://caniuse.com/#feat=es6-module).

Current browser compatibility of modules features without ES module shims:

| ES Modules Features                | Chrome (61+)                         | Firefox (60+)                        | Safari (10.1+)                       | Edge (16+)                           |
| ---------------------------------- | ------------------------------------ | ------------------------------------ | ------------------------------------ | ------------------------------------ |
| Executes Modules in Correct Order  | :heavy_check_mark:                   | :heavy_check_mark:                   | :heavy_check_mark:                   | :x:<sup>1</sup>                      |
| [Dynamic Import](#dynamic-import)  | :heavy_check_mark: 63+               | :heavy_check_mark: 67+               | :heavy_check_mark: 11.1+             | :x:                                  |
| [import.meta.url](#importmetaurl)  | :heavy_check_mark: ~76+              | :heavy_check_mark: ~67+              | :heavy_check_mark: ~12+ ❕<sup>1</sup>| :x:                                  |
| [Module Workers](#module-workers)  | :heavy_check_mark: ~68+              | :x:                                  | :x:                                  | :x:                                  |
| [Import Maps](#import-maps)        | :x:<sup>2</sup>                      | :x:                                  | :x:                                  | :x:                                  |

* 1: _Edge executes parallel dependencies in non-deterministic order. ([ChakraCore bug](https://github.com/microsoft/ChakraCore/issues/6261))._
* 2: _Enabled under the Experimental Web Platform Features flag in Chrome 76._
* ~: _Indicates the exact first version support has not yet been determined (PR's welcome!)._
* ❕<sup>1</sup>: On module redirects, Safari returns the request URL in `import.meta.url` instead of the response URL as per the spec.

#### Browser Compatibility with ES Module Shims:

| ES Modules Features                | Chrome (61+)                         | Firefox (60+)                        | Safari (10.1+)                       | Edge (16+)                           |
| ---------------------------------- | ------------------------------------ | ------------------------------------ | ------------------------------------ | ------------------------------------ |
| Executes Modules in Correct Order  | :heavy_check_mark:                   | :heavy_check_mark:                   | :heavy_check_mark:                   | :heavy_check_mark:<sup>1</sup>       |
| [Dynamic Import](#dynamic-import)  | :heavy_check_mark:                   | :heavy_check_mark:                   | :heavy_check_mark:                   | :heavy_check_mark:                   |
| [import.meta.url](#importmetaurl)  | :heavy_check_mark:                   | :heavy_check_mark:                   | :heavy_check_mark:                   | :heavy_check_mark:                   |
| [Module Workers](#module-workers)  | :heavy_check_mark: ~68+              | :x:<sup>2</sup>                      | :x:<sup>2</sup>                      | :x:<sup>2</sup>                      |
| [Import Maps](#import-maps)        | :heavy_check_mark:                   | :heavy_check_mark:                   | :heavy_check_mark:                   | :heavy_check_mark:                   |

* 1: _The Edge parallel execution ordering bug is corrected by ES Module Shims with an execution chain inlining approach._
* 2: _Module worker support cannot be implemented without dynamic import support in web workers._

### Import Maps

> The goal is for this project to eventually become a true polyfill for import maps in older browsers, but this will only happen once the spec is implemented in more than one browser and demonstrated to be stable.

In order to import bare package specifiers like `import "lodash"` we need [import maps](https://github.com/domenic/import-maps), which are still an experimental specification.

Using this polyfill we can write:

```html
<!doctype html>
<!-- either user "defer" or load this polyfill after the scripts below-->
<script defer src="es-module-shims.js"></script>
<script type="importmap-shim">
{
  "imports": {
    "test": "/test.js"
  },
  "scopes": {
    "/": {
      "test-dep": "/test-dep.js"
    }
  }
}
</script>
<script type="module-shim">
  import test from "test";
  console.log(test);
</script>
```

All modules are still loaded with the native browser module loader, just as Blob URLs, meaning there is minimal overhead to using a polyfill approach like this.

### Dynamic Import

Dynamic `import(...)` within any modules loaded will be rewritten as `importShim(...)` automatically
providing full support for all es-module-shims features through dynamic import.

To load code dynamically (say from the browser console), `importShim` can be called similarly:

```js
importShim('/path/to/module.js').then(x => console.log(x));
```

### import.meta.url

`import.meta.url` provides the full URL of the current module within the context of the module execution.

### Skip Processing

When loading modules that you know will only use baseline modules features, it is possible to set a rule to explicitly
opt-out modules from rewriting. This improves performance because those modules then do not need to be processed or transformed at all, so that only local application code is handled and not library code.

This can be configured by setting the `importShim.skip` URL regular expression:

```js
importShim.skip = /^https:\/\/cdn\.com/;
```

By default, this expression supports `jspm.dev`, `dev.jspm.io` and `cdn.pika.dev`.

### Fetch Hook

> Note: This hook is non spec-compliant, but is provided as a convenience feature since the pipeline handles the same data URL rewriting and circular handling of the module graph that applies when trying to implement any module transform system.

The ES Module Shims fetch hook can be used to implement transform plugins.

For example:

```js
importShim.fetch = async function (url) {
  const response = await fetch(url);
  if (response.url.endsWith('.ts')) {
    const source = await response.body();
    const transformed = tsCompile(source);
    return new Response(new Blob([transformed], { type: 'application/javascript' }));
  }
  return response;
};
```

Because the dependency analysis applies by ES Module Shims takes care of ensuring all dependencies run through the same fetch hook,
the above is all that is needed to implement custom plugins.

Streaming support is also provided, for example here is a hook with streaming support for JSON:

```js
importShim.fetch = async function (url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText} ${response.url}`);
  const contentType = response.headers.get('content-type');
  if (!/^application\/json($|;)/.test(contentType))
    return response;
  const reader = response.body.getReader();
  return new Response(new ReadableStream({
    async start (controller) {
      let done, value;
      controller.enqueue(new Uint8Array([...'export default '].map(c => c.charCodeAt(0))));
      while (({ done, value } = await reader.read()) && !done) {
        controller.enqueue(value);
      }
      controller.close();
    }
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript"
    }
  });
}
```

#### Plugins

Since the Fetch Hook is very new, there are no plugin examples of it yet, but it should be easy to support various workflows
such as TypeScript and new JS features this way.

If you work on something here (or even just wrap the examples above into a separate project) please do share to link to from here!

## Implementation Details

### Import Rewriting

* Sources are fetched, import specifiers are rewritten to reference exact URLs, and then executed as BlobURLs through the whole module graph.
* CSP is not supported as we're using fetch and modular evaluation.
* The [tokenizer](https://github.com/guybedford/es-module-lexer) handles the full language grammar including nested template strings, comments, regexes and division operator ambiguity based on backtracking.
* When executing a circular reference A -> B -> A, a shell module technique is used to "shim" the circular reference into an acyclic graph. As a result, live bindings for the circular parent A are not supported, and instead the bindings are captured immediately after the execution of A.

### Import Maps
* The import maps specification is under active development and will change, all of the current specification features are implemented, but the edge cases are not currently fully handled. These will be refined as the specification and reference implementation continue to develop.

## Inspiration

Huge thanks to Rich Harris for inspiring this approach with [Shimport](https://github.com/rich-harris/shimport).

### License

MIT

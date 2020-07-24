import { baseUrl as pageBaseUrl, resolveImportMap, createBlob, resolveUrl, resolveAndComposeImportMap, hasDocument, resolveIfNotPlainOrUrl, emptyImportMap, dynamicImport, resolvedPromise } from './common.js';
import { init, parse } from '../node_modules/es-module-lexer/dist/lexer.js';

let id = 0;
const registry = {};

async function loadAll (load, seen) {
  if (load.b || seen[load.u])
    return;
  seen[load.u] = 1;
  await load.L;
  return Promise.all(load.d.map(dep => loadAll(dep, seen)));
}

async function topLevelLoad (url, source) {
  await init;
  const load = getOrCreateLoad(url, source);
  const seen = {};
  await loadAll(load, seen);
  lastLoad = undefined;
  resolveDeps(load, seen);
  const module = await dynamicImport(load.b);
  // if the top-level load is a shell, run its update function
  if (load.s)
    (await dynamicImport(load.s)).u$_(module);
  return module;
}

async function importShim (id, parentUrl) {
  return topLevelLoad(await resolve(id, parentUrl || pageBaseUrl));
}

self.importShim = importShim;

const meta = {};

const edge = navigator.userAgent.match(/Edge\/\d\d\.\d+$/);

Object.defineProperties(importShim, {
  map: { value: emptyImportMap, writable: true },
  m: { value: meta },
  l: { value: undefined, writable: true },
  e: { value: undefined, writable: true }
});
importShim.fetch = url => fetch(url);
importShim.skip = /^https?:\/\/(cdn\.pika\.dev|dev\.jspm\.io|jspm\.dev)\//;

let lastLoad;
function resolveDeps (load, seen) {
  if (load.b || !seen[load.u])
    return;
  seen[load.u] = 0;

  for (const dep of load.d)
    resolveDeps(dep, seen);

  // "execution"
  const source = load.S;
  // edge doesnt execute sibling in order, so we fix this up by ensuring all previous executions are explicit dependencies
  let resolvedSource = edge && lastLoad ? `import '${lastLoad}';` : '';

  const [imports] = load.a;

  if (!imports.length) {
    resolvedSource += source;
  }
  else {
    // once all deps have loaded we can inline the dependency resolution blobs
    // and define this blob
    let lastIndex = 0, depIndex = 0;
    for (const { s: start, e: end, d: dynamicImportIndex } of imports) {
      // dependency source replacements
      if (dynamicImportIndex === -1) {
        const depLoad = load.d[depIndex++];
        let blobUrl = depLoad.b;
        if (!blobUrl) {
          // circular shell creation
          if (!(blobUrl = depLoad.s)) {
            blobUrl = depLoad.s = createBlob(`export function u$_(m){${
                depLoad.a[1].map(
                  name => name === 'default' ? `$_default=m.default` : `${name}=m.${name}`
                ).join(',')
              }}${
                depLoad.a[1].map(name =>
                  name === 'default' ? `let $_default;export{$_default as default}` : `export let ${name}`
                ).join(';')
              }\n//# sourceURL=${depLoad.r}?cycle`);
          }
        }
        // circular shell execution
        else if (depLoad.s) {
          resolvedSource += source.slice(lastIndex, start - 1) + '/*' + source.slice(start - 1, end + 1) + '*/' + source.slice(start - 1, start) + blobUrl + source[end] + `;import*as m$_${depIndex} from'${depLoad.b}';import{u$_ as u$_${depIndex}}from'${depLoad.s}';u$_${depIndex}(m$_${depIndex})`;
          lastIndex = end + 1;
          depLoad.s = undefined;
          continue;
        }
        resolvedSource += source.slice(lastIndex, start - 1) + '/*' + source.slice(start - 1, end + 1) + '*/' + source.slice(start - 1, start) + blobUrl;
        lastIndex = end;
      }
      // import.meta
      else if (dynamicImportIndex === -2) {
        meta[load.r] = { url: load.r };
        resolvedSource += source.slice(lastIndex, start) + 'importShim.m[' + JSON.stringify(load.r) + ']';
        lastIndex = end;
      }
      // dynamic import
      else {
        resolvedSource += source.slice(lastIndex, dynamicImportIndex + 6) + 'Shim(' + source.slice(start, end) + ', ' + JSON.stringify(load.r);
        lastIndex = end;
      }
    }

    resolvedSource += source.slice(lastIndex);
  }

  let sourceMappingResolved = '';
  const sourceMappingIndex = resolvedSource.lastIndexOf('//# sourceMappingURL=');
  if (sourceMappingIndex > -1) {
    const sourceMappingEnd = resolvedSource.indexOf('\n',sourceMappingIndex);
    const sourceMapping = resolvedSource.slice(sourceMappingIndex, sourceMappingEnd > -1 ? sourceMappingEnd : undefined);
    sourceMappingResolved = `\n//# sourceMappingURL=` + resolveUrl(sourceMapping.slice(21), load.r);
  }
  load.b = lastLoad = createBlob(resolvedSource + sourceMappingResolved + '\n//# sourceURL=' + load.r);
  load.S = undefined;
}

function getOrCreateLoad (url, source) {
  let load = registry[url];
  if (load)
    return load;

  load = registry[url] = {
    // url
    u: url,
    // response url
    r: undefined,
    // fetchPromise
    f: undefined,
    // source
    S: undefined,
    // linkPromise
    L: undefined,
    // analysis
    a: undefined,
    // deps
    d: undefined,
    // blobUrl
    b: undefined,
    // shellUrl
    s: undefined,
  };

  const depcache = importShim.map.depcache[url];
  if (depcache) {
    depcache.forEach(async depUrl => {
      getOrCreateLoad(await resolve(depUrl, url));
    });
  }

  load.f = (async () => {
    if (!source) {
      const res = await importShim.fetch(url);
      if (!res.ok)
        throw new Error(`${res.status} ${res.statusText} ${res.url}`);
      load.r = res.url;
      const contentType = res.headers.get('content-type');
      if (contentType.match(/^(text|application)\/(x-)?javascript(;|$)/))
        source = await res.text();
      else
        throw new Error(`Unknown Content-Type "${contentType}"`);
    }
    try {
      load.a = parse(source, load.u);
    }
    catch (e) {
      console.warn(e);
      load.a = [[], []];
    }
    load.S = source;
    return load.a[0].filter(d => d.d === -1).map(d => source.slice(d.s, d.e));
  })();

  load.L = load.f.then(async deps => {
    load.d = await Promise.all(deps.map(async depId => {
      const resolved = await resolve(depId, load.r || load.u);
      if (importShim.skip.test(resolved))
        return { b: resolved };
      const depLoad = getOrCreateLoad(resolved);
      await depLoad.f;
      return depLoad;
    }));
  });

  return load;
}

let importMapPromise;

if (hasDocument) {
  // preload import maps
  for (const script of document.querySelectorAll('script[type="importmap-shim"][src]'))
    script._f = fetch(script.src);
  // load any module scripts
  for (const script of document.querySelectorAll('script[type="module-shim"]'))
    topLevelLoad(script.src || `${pageBaseUrl}?${id++}`, script.src ? null : script.innerHTML);
}

async function resolve (id, parentUrl) {
  if (!importMapPromise) {
    importMapPromise = resolvedPromise;
    if (hasDocument)
      for (const script of document.querySelectorAll('script[type="importmap-shim"]')) {
        importMapPromise = importMapPromise.then(async () => {
          importShim.map = await resolveAndComposeImportMap(script.src ? await (await (script._f || fetch(script.src))).json() : JSON.parse(script.innerHTML), script.src || pageBaseUrl, importShim.map);
        });
      }
  }
  await importMapPromise;
  return resolveImportMap(importShim.map, resolveIfNotPlainOrUrl(id, parentUrl) || id, parentUrl) || throwUnresolved(id, parentUrl);
}

function throwUnresolved (id, parentUrl) {
  throw Error("Unable to resolve specifier '" + id + (parentUrl ? "' from " + parentUrl : "'"));
}

class Hot {
  constructor (url) {
    this.data = getHotData(this.url = stripVersion(url)).d;
  }
  accept (deps, cb) {
    if (typeof deps === 'function') {
      cb = deps;
      deps = null;
    }
    const hotData = getHotData(this.url);
    (hotData.a = hotData.a || []).push([typeof deps === 'string' ? defaultResolve(deps, this.url) : deps ? deps.map(d => defaultResolve(d, this.url)) : null, cb]);
  }
  dispose (cb) {
    getHotData(this.url).u = cb;
  }
  decline () {
    getHotData(this.url).r = true;
  }
  invalidate () {
    invalidate(this.url);
    queueInvalidationInterval();
  }
}

const versionedRegEx = /\?v=\d+$/;
function stripVersion (url) {
  const versionMatch = url.match(versionedRegEx);
  if (!versionMatch) return url;
  return url.slice(0, -versionMatch[0].length);
}

const toVersioned = url => url + '?v=' + getHotData(url).v;

let defaultResolve;

const esmsInitOptions = self.esmsInitOptions = self.esmsInitOptions || {};
esmsInitOptions.hot = esmsInitOptions.hot || {};
Object.assign(esmsInitOptions, {
  resolve (id, parent, _defaultResolve) {
    if (!defaultResolve)
      defaultResolve = _defaultResolve;
    const originalParent = stripVersion(parent);
    const url = stripVersion(defaultResolve(id, originalParent));
    const parents = getHotData(url).p;
    if (!parents.includes(originalParent))
      parents.push(originalParent);
    return toVersioned(url);
  },
  onimport (url) {
    getHotData(url).e = true;
  },
  meta (metaObj, url) {
    metaObj.hot = new Hot(url);
  }
});

let hotRegistry = {};
let curInvalidationRoots = new Set();
let curInvalidationInterval;

const getHotData = url => hotRegistry[url] || (hotRegistry[url] = {
  // version
  v: 1,
  // refresh (decline)
  r: false,
  // accept list ([deps, cb] pairs)
  a: null,
  // unload callback
  u: null,
  // entry point
  e: false,
  // hot data
  d: {},
  // parents
  p: []
});

function invalidate (url, fromUrl, seen = []) {
  if (!seen.includes(url)) {
    seen.push(url);
    const hotData = hotRegistry[url];
    if (hotData) {
      if (hotData.u)
        hotData.u(hotData.d);
      if (hotData.r) {
        location.href = location.href;
      } else {
        if (hotData.a || hotData.e)
          curInvalidationRoots.add(fromUrl);
        if (!hotData.a || !hotData.a.some(([d]) => d === fromUrl || d && d.includes(fromUrl))) {
          if (hotData.e)
            curInvalidationRoots.add(url);
          hotData.v++;
          if (!hotData.a) {
            for (const parent of hotData.p)
              invalidate(parent, url, seen);
          }
        }
      }
    }
  }
}

function queueInvalidationInterval () {
  curInvalidationInterval = setTimeout(() => {
    for (const root of curInvalidationRoots) {
      const promise = importShim(toVersioned(root));
      const { a, p } = hotRegistry[root];
      promise.then(async m => {
        if (a) a.every(([d, c]) => d === null && c(m));
        for (const parent of p) {
          const { a } = hotRegistry[parent];
          if (a) a.every(([d, c]) => d === root && c(m) || d && c(await Promise.all(d.map(d => importShim(toVersioned(d))))));
        }
      });
    }
    curInvalidationRoots = new Set();
  }, 150);
}

const websocket = new WebSocket(`ws://${esmsInitOptions.hot.host || 'localhost'}:${esmsInitOptions.hot.port || '8080'}/watch`);
websocket.onmessage = evt => {
  const { data } = evt;
  if (data === 'Connected') {
    console.log('ESMS Hot Reloader Successfully Connected');
    return;
  }
  invalidate(new URL(data, document.baseURI).href);
  queueInvalidationInterval();
};

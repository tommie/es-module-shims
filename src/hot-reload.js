class Hot {
  constructor (url) {
    this.data = getHotData(this.url = stripVersion(url)).d;
  }
  accept (deps = [this.url], cb) {
    if (typeof deps === 'function') {
      cb = deps;
      deps = [this.url];
    }
    const hotData = getHotData(this.url);
    hotData.a = cb;
    // hotData.dl = deps.map(dep => defaultResolve(dep, this.url));
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
let curInvalidationRoots = [];
let curInvalidationInterval;

const getHotData = url => hotRegistry[url] || (hotRegistry[url] = {
  // version
  v: 1,
  // refresh (decline)
  r: false,
  // accept callback
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

function invalidate (url, seen = []) {
  if (seen.includes(url))
    return;
  seen.push(url);
  const hotData = hotRegistry[url];
  if (!hotData) return false;
  if (hotData.u)
    hotData.d = hotData.u() || hotData.d;
  if (hotData.r) {
    location.href = location.href;
    return true;
  }
  if (hotData.a) {
    hotData.a();
    return false;
  }
  if (hotData.e)
    curInvalidationRoots.push(url);
  hotData.v++;
  let hasRoot = false;
  for (const parent of hotData.p) {
    hasRoot = invalidate(parent, seen);
  }
  if (!hasRoot)
    curInvalidationRoots.push(url);
  return true;
}

function queueInvalidationInterval () {
  curInvalidationInterval = setTimeout(() => {
    for (const root of curInvalidationRoots) {
      importShim(toVersioned(root));
    }
    curInvalidationRoots = [];
  }, 150);
}

const websocket = new WebSocket(`ws://${esmsInitOptions.hot.host || 'localhost'}:${esmsInitOptions.hot.port || '8080'}/watch`);
websocket.onmessage = evt => {
  if (evt.data === 'Connected') {
    console.log('ESMS Hot Reloader Successfully Connected');
    return;
  }
  const url = new URL(evt.data, document.baseURI).href;
  invalidate(url);
  queueInvalidationInterval();
};

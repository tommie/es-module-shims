class Hot {
  constructor (url) {
    this.data = getHotData(this.url = url).d;
  }
  accept (deps, cb) {
    if (typeof deps === 'function') {
      cb = deps;
      deps = [this.url];
    }
    getHotData(this.url).dc = cb;
    hotData.dl = deps;
    cb(...mods)
  }
  dispose (cb) {
    getHotData(this.url).uc = cb;
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

const esmsInitOptions = self.esmsInitOptions = self.esmsInitOptions || {};
esmsInitOptions.hot = esmsInitOptions.hot || {};
Object.assign(esmsInitOptions, {
  resolve (id, parent, defaultResolve) {
    const originalParent = stripVersion(parent);
    const url = stripVersion(defaultResolve(id, originalParent));
    const parents = parentsMap[url] = parentsMap[url] || [];
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

const getHotData = url => hotRegistry[url] || (hotRegistry[url] = { v: 1, r: false, a: [], dc: null, uc: null, e: false, d: {}, p: null });

function invalidate (url, seen = []) {
  if (seen.includes(url))
    return;
  seen.push(url);
  if (refreshUrls.includes(url)) {
    window.location.href = window.location.href;
    return;
  }
  if (importRoots.includes(url))
    curInvalidationRoots.push(url);
  getHotData(url).v++;
  const parents = parentsMap[url];
  if (!parents) return;
  for (const parent of parents) {
    invalidate(parent, seen);
  }
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
    console.log('ESMS Hot Reloader Successfully Connected')
    return;
  }
  const url = new URL(evt.data, document.baseURI).href;
  invalidate(url);
  queueInvalidationInterval();
};

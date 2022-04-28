function resolve (id, parentUrl = this.url) {
  return importShim.resolve(id, `${parentUrl}`);
}

export function throwUnresolved (id, parentUrl) {
  throw Error(`Unable to resolve specifier '${id}'${fromParent(parentUrl)}`);
}

class HotAPI {
  constructor (url) {
    this.url = url;
    this.data = {};
  }

  accept (deps, cb) {
    if (typeof deps === 'function') {
      cb = deps;
      deps = [this.url];
    }
    cb(...mods)
  }

  dispose (cb) {
    cb(data);
  }

  decline () {
    // On invalidate:
    // window.location.href = window.location.href;
  }

  invalidate () {
    // invalidate this module
  }
}

const esmsInitOptions = self.esmsInitOptions = self.esmsInitOptions || {};
esmsInitOptions.hot = esmsInitOptions.hot || {};
Object.assign(esmsInitOptions, {
  resolve (id, parent, defaultResolve) {
    console.log('resolve', id, parent);
    return defaultResolve(id, parent);
  },
  meta (metaObj, url) {
    metaObj.hot = new HotAPI(url);
  }
});

const websocket = new WebSocket(`ws://${esmsInitOptions.hot.host || 'localhost'}:${esmsInitOptions.hot.port || '8080'}/watch`);
websocket.onmessage = evt => {
  if (evt.data === 'Connected') {
    console.log('ESMS Hot Reloader Successfully Connected')
    return;
  }
  const url = new URL(evt.data, document.baseURI).href;
  console.log(url, 'CHANGED');
};

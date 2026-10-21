// tvadblock service override v13 (loaded by the installed service at startup; see standalone/svc/index.js).
// v13 (new): Hulu runs as Hulu's own TV app (tizenbbd.app.hulu.com/livingroom/tizenbbd/1, found via v12) inside the
//   launcher's local page: hulu.com's web player cannot run on Chrome 76 (?. and ?? syntax), the TV build can.
//   No navigation; ported web cookies are deleted (they made auth.hulu.com answer 431); webapis calls our package
//   lacks privileges for get this TV's own values (REST api/v2); exit() is restored once Hulu's boot starts.
// v12 (kept): probe walks the native app's data/ (web engine disk cache keeps request URLs in clear) and uploads
//   cache files only (never Cookies / Login / token stores) to find the exact tizenbbd.app.hulu.com app URL.
// v11 (kept): probe reads res/config.xml, widget.license and the .tmg app archive (v10 found them in res/, not res/wgt/).
// v10 (kept): one-time probe after a launch reads the native Hulu stub (config.xml = URL of Hulu's own TV web app) over
//   the TV's local sdbd sync protocol and uploads it to the T630.
// v9 (kept): the override re-fetches itself on every open from the home screen (VERSION marker) and swaps
//   its logic in place, so a fix on the T630 applies on the next open without restarting the TV.
// v8 (kept) -- the "opens, then crashes back to the home channel" bug:
//   The installed service marks itself "connecting" only inside its ORIGINAL debugLaunch. The v3+ replacement
//   never did, so the debug-relaunched app's index.html saw isConnecting=false, asked for another launch
//   ("start: launcher requested" / "duplicate launcher request" right after attach) and then called exit():
//   the app closed and CDP died ("socket ended" / "not opened"). The noexit patch never held because
//   tizen.application.getCurrentApplication() returns a new object on every call.
//   Fix: hook the service's own HTTP server so /tvab/getState answers isConnecting=true for the whole launch;
//   exit() is neutralised on the Application prototype in the launcher page only (the site keeps Back->exit);
//   our own startDebugger replaces the original's 130 s busy lock (reopening within 130 s did nothing).
// v7 (kept): attach + noexit first, script/auth fetched in the background.
// v4-v6 (kept): owner's browser session -> Network.setCookies + localStorage seed before navigation.
// v3 (kept): 2.5 s delay + fast 'launch failed' detection + retries; uncaughtException guard.
var VERSION = 'v13';
var G = global.__tvab || (global.__tvab = {});
if (!G.exc) { G.exc = true; try { process.on('uncaughtException', function (e) { ctx.report('svc-exc', (e && e.message) || e); }); } catch (e) {} }
var ORIG = ctx.impl();
var T630 = ctx.CFG.reportUrl.replace(/\/r\/?$/, '');
var RAW = 'https://raw.githubusercontent.com/BillyBWinsAgain/tvadblock-' + ctx.CFG.svc + '/main/dist/userScript.js';
var AUTH_URL = T630 + '/tvab/cookies/' + ctx.CFG.svc + '?k=n_zL_NLnKH9xYhX44mEig9f1';
var launching = 0;   // until this time, /tvab/getState says isConnecting=true
var busy = 0;        // our startDebugger lock (cleared on success or failure, not a fixed 130 s)

function getText(url, ms) {
  return new Promise(function (res) {
    var done = false, t = setTimeout(function () { if (!done) { done = true; res(null); } }, ms || 3000);
    ctx.fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now())
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (x) { if (!done) { done = true; clearTimeout(t); res(x); } })
      .catch(function () { if (!done) { done = true; clearTimeout(t); res(null); } });
  });
}
function fresh() {
  return getText(T630 + '/tvab/script/' + ctx.CFG.svc, 2500).then(function (t) {
    if (t && t.length > 1000) { ctx.report('script', 't630 ' + t.length); return t; }
    return getText(RAW, 6000).then(function (t2) {
      if (t2 && t2.length > 1000) { ctx.report('script', 'raw ' + t2.length); return t2; }
      ctx.report('script', 'no live script'); return null;
    });
  });
}
function authBundle() {
  return ctx.fetch(AUTH_URL + '&t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (b) {
      if (b && b.cookies && b.cookies.length) { ctx.report('auth', 'bundle ' + b.cookies.length + 'ck ' + Object.keys(b.ls || {}).length + 'ls'); return b; }
      ctx.report('auth', 'empty bundle'); return null;
    })
    .catch(function (e) { ctx.report('auth', 'fetch failed ' + e.message); return null; });
}

// ---- hold /tvab/getState at isConnecting=true while a launch is in flight; reload this override on each open ----
var OVERRIDE_URL = ctx.CFG.remote.replace('/userScript.js', '/service-override.js');
function reloadThen(next) {
  getText(OVERRIDE_URL, 1500).then(function (code) {
    var m = code && /var VERSION = '([^']+)'/.exec(code);
    if (m && m[1] !== G.version) {
      try { new Function('ctx', code)(ctx); ctx.report('override', 'reloaded ' + G.version); } catch (e) { ctx.report('override', 'reload failed ' + e.message); }
    }
    next();
  });
}
G.version = VERSION;
G.onReq = function (req, res, app) {
  if (req.url.indexOf('/tvab/getState') === 0 && Date.now() < launching) {
    ctx.report('getState', 'held: launch in progress');
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ canConnectToDaemon: true, isConnecting: true }));
    return;
  }
  if (req.url.indexOf('/tvab/debugger') === 0) {
    if (Date.now() < launching) { app(req, res); return; }
    launching = Date.now() + 120000;
    reloadThen(function () { G.onReq === mine ? app(req, res) : G.onReq(req, res, app); });
    return;
  }
  app(req, res);
};
var mine = G.onReq;
if (!G.hooked) {
  try {
    var hs = process._getActiveHandles ? process._getActiveHandles() : [], srv = null;
    hs.forEach(function (h) {
      try { if (!srv && h && typeof h.address === 'function' && h.listeners && h.address() && h.address().port === ctx.CFG.port && h.listeners('request').length) { srv = h; } } catch (e) {}
    });
    if (!srv) { ctx.report('hook', 'server not found on ' + ctx.CFG.port); }
    else {
      var app = srv.listeners('request')[0];
      srv.removeAllListeners('request');
      srv.on('request', function (req, res) { G.onReq(req, res, app); });
      G.hooked = true;
      ctx.report('hook', 'getState held during launches');
    }
  } catch (e) { ctx.report('hook-err', e.message); }
}

// exit() lives on the Application prototype; getCurrentApplication() hands out a fresh object each call.
var NOEXIT = '(function(){var nx=function(){};try{var A=tizen.application,a=A.getCurrentApplication(),P=Object.getPrototypeOf(a);' +
  'if(!window.__tvabExitRestore){var oe=P.exit,og=A.getCurrentApplication;window.__tvabExitRestore=function(){try{Object.defineProperty(P,"exit",{value:oe,configurable:true,writable:true});}catch(e){}try{A.getCurrentApplication=og;}catch(e){}};}' +
  'try{P.exit=nx;}catch(e){}try{Object.defineProperty(P,"exit",{value:nx,configurable:true,writable:true});}catch(e){}' +
  'var g=A.getCurrentApplication,w=function(){var x=g.apply(A,arguments);try{x.exit=nx;}catch(e){}return x;};' +
  'try{A.getCurrentApplication=w;}catch(e){}try{Object.getPrototypeOf(A).getCurrentApplication=w;}catch(e){}' +
  'window.__tvabNoExit=tizen.application.getCurrentApplication().exit===nx?2:1;}catch(e){window.__tvabNoExit=0;}return window.__tvabNoExit;})()';
var STATE = '(function(){var r=document.getElementById("tvab-root");return location.href+" | inj="+!!(window.__tvadblock_hulu||window.__tvadblock_max)+' +
  '" | boot="+(window.__tvabBoot||"-")+" | george="+typeof window.george+" | wapi="+JSON.stringify((window.__wapi||[]).filter(function(x,i,a){return a.indexOf(x)===i;}).slice(0,12))+' +
  '" | body="+(document.body?(document.body.innerText||"").replace(/\\s+/g," ").slice(0,120):"")+' +
  '" | ui="+(r?(r.style.display==="none"?"hidden":(r.innerText||"").replace(/\\s+/g," ").slice(0,140)):"none")+" | title="+document.title;})()';

// ---- v13: Hulu's own TV app (the build the native Samsung app loads), booted in the launcher's local page ----
var TVAPP = ctx.CFG.svc === 'hulu';
var LAUNCHER_GUARD = "if(location.protocol==='file:'){var of=window.fetch;window.fetch=function(u){if(String(u).indexOf(':811')>=0){return new Promise(function(){});}return of.apply(this,arguments);};}";
function tvappBoot(H) {
  if (window.__tvabBoot) { return 'already ' + window.__tvabBoot; }
  window.__tvabBoot = 'starting';
  function script(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('load ' + src)); }; document.head.appendChild(s); }); }
  // this TV's own values (REST http://<tv>:8001/api/v2/) for productinfo/adinfo calls our package has no privilege for
  var FB = { 'productinfo.getModel': 'UN43TU690TFXZA', 'productinfo.getRealModel': 'UN43TU690TFXZA', 'productinfo.getModelCode': '21_KANTSU2E_UHD_BASIC1',
    'productinfo.getDuid': '3c0d4318-4e35-4e8e-ab3d-87bb48481f54', 'productinfo.getFirmware': '', 'productinfo.isUdPanelSupported': true,
    'productinfo.isUHDAModel': false, 'productinfo.is8KPanelSupported': false, 'productinfo.getLicensedVendor': 'Samsung',
    'adinfo.getTIFA': '', 'adinfo.isLATEnabled': true };
  window.__wapi = [];
  function wrapAll() {
    if (!window.webapis) { window.__wapi.push('no webapis'); return; }
    Object.keys(webapis).forEach(function (ns) {
      var o = webapis[ns]; if (!o || typeof o !== 'object') { return; }
      Object.keys(o).concat(Object.getOwnPropertyNames(Object.getPrototypeOf(o) || {})).forEach(function (k) {
        var f; try { f = o[k]; } catch (e) { return; }
        if (typeof f !== 'function' || k === 'constructor') { return; }
        try {
          o[k] = function () {
            try { return f.apply(o, arguments); } catch (e) {
              var key = ns + '.' + k;
              if (e && e.name === 'SecurityError' && key in FB) { window.__wapi.push(key + ' stand-in'); return FB[key]; }
              window.__wapi.push(key + ' ' + (e && e.name)); throw e;
            }
          };
        } catch (e) { }
      });
    });
  }
  script('$WEBAPIS/webapis/webapis.js').catch(function (e) { window.__wapi.push('webapis.js ' + e.message); })
    .then(function () { wrapAll(); return fetch(H + '/livingroom/tizenbbd/1/index.html', { credentials: 'include' }); })
    .then(function (r) { return r.text(); })
    .then(function (html) {
      var i0 = html.indexOf('manifest:'); if (i0 < 0) { throw new Error('no manifest'); }
      i0 = html.indexOf('{', i0); var depth = 0, i1 = i0;
      for (; i1 < html.length; i1++) { var ch = html.charAt(i1); if (ch === '{') { depth++; } else if (ch === '}') { depth--; if (!depth) { break; } } }
      var manifest = JSON.parse(html.slice(i0, i1 + 1));
      [].slice.call(document.querySelectorAll('style')).forEach(function (st) { st.parentNode.removeChild(st); });  // the launcher's centering css
      document.body.innerHTML = '<button role="" autofocus style="opacity:0"></button>';
      document.documentElement.style.cssText = ''; document.body.style.cssText = 'margin:0;background:#000';
      var b = document.createElement('base'); b.href = H + '/livingroom/tizenbbd/1/'; document.head.appendChild(b);
      window.bootData = { appStartupTime: Date.now() }; window.USE_STAGING = false; window.DEBUG = false; window.EDITORIAL = false; window.TESTING = false; window.UI_AUTOMATION = false;
      window.tizenConnectionInfo = { ethernet: null, wifi: null };
      return new Promise(function (res) {
        var n = 0; function d() { if (++n === 2) { res(); } }
        try {
          tizen.systeminfo.getPropertyValue('WIFI_NETWORK', function (w) { tizenConnectionInfo.wifi = w; d(); }, d);
          tizen.systeminfo.getPropertyValue('ETHERNET_NETWORK', function (e) { tizenConnectionInfo.ethernet = e; d(); }, d);
          tizen.systeminfo.addPropertyValueChangeListener('WIFI_NETWORK', function (w) { tizenConnectionInfo.wifi = w; });
          tizen.systeminfo.addPropertyValueChangeListener('ETHERNET_NETWORK', function (e) { tizenConnectionInfo.ethernet = e; });
        } catch (e) { res(); }
      }).then(function () { return script(H + manifest.urlRoot + 'boot.js'); }).then(function () {
        if (window.__tvabExitRestore) { window.__tvabExitRestore(); }   // Back on Hulu's home may close the app again
        window.hboot.bootstrap.initializeAndRun({ devDeepLinkURI: null, manifest: manifest, qsParams: {} });
        window.__tvabBoot = 'booted ' + manifest.appVersion;
      });
    })
    .catch(function (e) { window.__tvabBoot = 'error ' + e.message; });
  return 'started';
}
var TVAPP_BOOT = '(' + tvappBoot.toString() + ')("https://tizenbbd.app.hulu.com")';

ctx.set('startDebugger', function () {
  if (Date.now() < busy) { ctx.report('skip', 'already starting'); return Promise.resolve(false); }
  busy = Date.now() + 90000;
  launching = Date.now() + 120000;
  return ORIG.canConnectToDaemon().then(function (res) {
    if (!res.canConnectToDaemon) { ctx.report('daemon', 'devIP not 127.0.0.1'); busy = 0; launching = 0; return false; }
    var self = ctx.tizen.application.getAppInfo().packageId + '.' + ctx.CFG.appSuffix;
    ctx.report('launch', self + ' ' + VERSION);
    ORIG.tellHome(self);
    ctx.impl().debugLaunch(self, function (port) { ORIG.tellHome(self); ctx.impl().connectToDebugger(res.ip, port, ctx.CFG.url); },
      function (why) { ctx.report('fail', why); busy = 0; launching = 0; });
    return true;
  });
});

ctx.set('connectToDebugger', function (host, port, navigateTo) {
  var scriptP = fresh(), bundleP = authBundle(), tries = 0;
  (function attach() {
    ctx.fetch('http://' + host + ':' + port + '/json').then(function (r) { return r.json(); }).then(function (targets) {
      ctx.report('targets', JSON.stringify(targets.map(function (t) { return [t.type, (t.url || '').slice(0, 60)]; })));
      var t0 = Date.now();
      ctx.CDP({ host: host, port: port, local: true }, function (client) {
        client.Runtime.evaluate({ expression: NOEXIT, returnByValue: true })
          .then(function (r) { ctx.report('noexit', 'level ' + (r && r.result && r.result.value)); }).catch(function (e) { ctx.report('noexit-err', e.message); });
        client.on('disconnect', function () { ctx.report('cdp-closed', 'after ' + (Date.now() - t0) + 'ms'); busy = 0; launching = 0; });
        var pending = [];
        client.on('Runtime.executionContextCreated', function (m) {
          var origin = m.context.origin || '';
          if (!origin || /^file:/.test(origin)) {   // the launcher page: make sure it cannot exit()
            client.Runtime.evaluate({ expression: NOEXIT, contextId: m.context.id }).catch(function () {});
            if (TVAPP) {   // ...then boot Hulu's TV app there, after our script, with the D-pad helper off
              pending.push(Promise.all([scriptP, bundleP]).then(function (res) {
                var script = res[0] || ctx.liveScript || ctx.CFG.script;
                return client.Runtime.evaluate({ expression: 'window.__tvabNav=1;' + script + ';\n' + TVAPP_BOOT, contextId: m.context.id, returnByValue: true })
                  .then(function (r) { ctx.report('tvapp', (r && r.exceptionDetails ? 'EXC ' + JSON.stringify(r.exceptionDetails).slice(0, 200) : 'boot ' + (r.result && r.result.value)) + ' script ' + script.length); })
                  .catch(function (e) { ctx.report('tvapp-err', e.message); });
              }));
            }
            return;
          }
          pending.push(Promise.all([scriptP, bundleP]).then(function (res) {
            var script = res[0] || ctx.liveScript || ctx.CFG.script, ls = (res[1] && res[1].ls) || {};
            var seed = 'try{var L=' + JSON.stringify(ls) + ';for(var o in L){if(location.origin===o){var kv=L[o];for(var k in kv){try{localStorage.setItem(k,kv[k]);}catch(e){}}}}}catch(e){};';
            return client.Runtime.evaluate({ expression: seed + script, contextId: m.context.id })
              .then(function (r) { ctx.report('injected', origin + (r && r.exceptionDetails ? ' EXC ' + JSON.stringify(r.exceptionDetails).slice(0, 200) : ' ok ' + script.length)); })
              .catch(function (e) { ctx.report('inject-err', e.message); });
          }));
        });
        if (TVAPP) { client.Page.addScriptToEvaluateOnNewDocument({ source: LAUNCHER_GUARD }).catch(function () {}); }
        client.Runtime.enable(); client.Page.enable();
        client.Page.setBypassCSP({ enabled: true }).catch(function () {});
        var navDone = false;
        var nav = function () {
          if (navDone || !navigateTo) { return; } navDone = true;
          if (TVAPP) { ctx.report('nav', 'none: Hulu TV app in launcher page'); }
          else {
            client.Page.navigate({ url: navigateTo }).then(function () { ctx.report('nav', navigateTo); })
              .catch(function (e) { ctx.report('nav-err', e.message); });
          }
          setTimeout(function () { busy = 0; launching = 0; }, 8000);   // launcher page is gone; next open from home works
          [15000, 40000, 90000].forEach(function (ms) {
            setTimeout(function () {
              client.Runtime.evaluate({ expression: STATE, returnByValue: true })
                .then(function (r) { ctx.report('state', (ms / 1000) + 's ' + (r.result && r.result.value)); })
                .catch(function (e) { ctx.report('state-err', e.message); });
            }, ms);
          });
        };
        setTimeout(nav, 6000); // navigation never waits on auth for long
        bundleP.then(function (bundle) {
          if (!bundle) { ctx.report('attached', host + ':' + port + ' ' + VERSION + ' no-auth'); nav(); return; }
          ctx.report('attached', host + ':' + port + ' ' + VERSION + (TVAPP ? ' tvapp' : '+auth'));
          return client.Network.enable().catch(function () {}).then(function () {
            var ck = bundle.cookies.map(function (c) {
              var o = { name: c.name, value: c.value, domain: c.domain, path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly };
              if (c.expires) { o.expires = c.expires; }
              return o;
            });
            if (TVAPP) {   // the TV app signs in with its own device token; the web cookies only bloat its requests
              return Promise.all(ck.map(function (c) { return client.Network.deleteCookies({ name: c.name, domain: c.domain, path: c.path }).catch(function () {}); }))
                .then(function () { ctx.report('cookies', 'removed ' + ck.length + ' ported web cookies'); });
            }
            return client.Network.setCookies({ cookies: ck })
              .then(function () { ctx.report('cookies', 'set ' + ck.length); })
              .catch(function (e) { ctx.report('cookie-err', (e && e.message) || e); });
          }).then(nav, nav);
        });
      }).on('error', function (e) { ctx.report('cdp-err', e.message); busy = 0; launching = 0; });
    }).catch(function () { if (++tries < 200) { setTimeout(attach, 150); } else { ctx.report('fail', 'debug port never answered'); busy = 0; launching = 0; } });
  })();
});

// ---- v10 probe: read the native Hulu app's stub (config.xml holds the URL of Hulu's own TV web app) ----
// Uses the TV's local sdbd sync protocol (LIST / RECV); results go to the T630 (/tvab/upload, reports.log).
function sdbSync(cmd, path, parse, done) {
  var client = ctx.adbhost.createConnection({ host: '127.0.0.1', port: 26101 });
  var buf = new Buffer(0), fin = false, acc = [];
  var t = setTimeout(function () { end('timeout'); }, 15000);
  function end(err) { if (fin) { return; } fin = true; clearTimeout(t); setTimeout(function () { try { client._stream.end(); } catch (e) {} }, 300); done(err, acc); }
  client._stream.on('error', function (e) { end('sdb ' + e.message); });
  var sh = client.createStream('sync:');
  client.once('_CNXN', function () {
    var p = new Buffer(path, 'utf8'), h = new Buffer(8); h.write(cmd, 0, 'ascii'); h.writeUInt32LE(p.length, 4);
    sh.write(Buffer.concat([h, p]));
  });
  sh.on('data', function (d) { buf = Buffer.concat([buf, d]); var r = parse(buf, acc); if (r) { buf = r.rest; if (r.end !== undefined) { end(r.end); } } });
  sh.on('end', function () { end('closed'); });
}
function parseRecv(buf, acc) {
  while (buf.length >= 8) {
    var id = buf.toString('ascii', 0, 4), n = buf.readUInt32LE(4);
    if (id === 'DATA') { if (buf.length < 8 + n) { return { rest: buf }; } acc.push(buf.slice(8, 8 + n)); buf = buf.slice(8 + n); }
    else if (id === 'DONE') { return { rest: buf, end: null }; }
    else if (id === 'FAIL') { return { rest: buf, end: 'FAIL ' + buf.toString('utf8', 8, Math.min(buf.length, 8 + n)) }; }
    else { return { rest: buf, end: 'bad reply ' + JSON.stringify(id) }; }
  }
  return { rest: buf };
}
function parseList(buf, acc) {
  while (buf.length >= 20) {
    var id = buf.toString('ascii', 0, 4);
    if (id === 'DENT') { var nl = buf.readUInt32LE(16); if (buf.length < 20 + nl) { return { rest: buf }; } acc.push([buf.toString('utf8', 20, 20 + nl), (buf.readUInt32LE(4) >>> 12).toString(8), buf.readUInt32LE(8)]); buf = buf.slice(20 + nl); }
    else if (id === 'DONE') { return { rest: buf, end: null }; }
    else if (id === 'FAIL') { return { rest: buf, end: 'FAIL ' + buf.toString('utf8', 8, Math.min(buf.length, 8 + buf.readUInt32LE(4))) }; }
    else { return { rest: buf, end: 'bad reply ' + JSON.stringify(id) }; }
  }
  return { rest: buf };
}
function upload(name, body) {
  return ctx.fetch(T630 + '/tvab/upload?name=' + encodeURIComponent(name), { method: 'POST', body: body })
    .then(function (r) { ctx.report('probe-up', name + ' ' + r.status); }).catch(function (e) { ctx.report('probe-up', name + ' ' + e.message); });
}
function probeNative() {
  var root = '/opt/usr/home/owner/apps_rw/LBUAQX1exg/data/';
  var queue = [[root, 0]], files = [], dirs = 0, listing = [];
  (function walk() {
    if (!queue.length || listing.length > 800) { return fetchFiles(); }
    var d = queue.shift();
    sdbSync('LIST', d[0], parseList, function (err, acc) {
      dirs++;
      acc.forEach(function (e) {
        if (e[0] === '.' || e[0] === '..') { return; }
        var full = d[0] + e[0];
        listing.push([full.slice(root.length), e[1], e[2]]);
        if (e[1] === '4' && d[1] < 8) { queue.push([full + '/', d[1] + 1]); }
        else if (e[1] === '10' && e[2] > 0 && e[2] < 2000000 && /cache|storage|index|journal|\.ldb$|\.log$|data_|f_0/i.test(full) && !/cookie|login|token|credential|secure/i.test(full)) { files.push([full, e[2]]); }
      });
      setTimeout(walk, 150);
    });
  })();
  function fetchFiles() {
    ctx.report('probe', 'walked ' + dirs + ' dirs, ' + listing.length + ' entries, ' + files.length + ' cache files');
    upload('data_listing.json', JSON.stringify(listing));
    var i = 0, total = 0;
    (function next() {
      if (i >= files.length || i >= 120 || total > 40000000) { ctx.report('probe', 'done ' + i + ' files ' + total + 'B'); return; }
      var f = files[i++];
      sdbSync('RECV', f[0], parseRecv, function (err, acc) {
        var body = Buffer.concat(acc); total += body.length;
        if (body.length) { upload('data_' + f[0].slice(root.length).replace(/[^A-Za-z0-9]+/g, '_'), body); }
        else { ctx.report('probe', 'RECV ' + f[0].slice(root.length) + ' ' + err); }
        setTimeout(next, 120);
      });
    })();
  }
}

ctx.set('debugLaunch', function (appId, onPort, onFail) {
  var attempt = 0;
  function tryOnce() {
    attempt++;
    var client = ctx.adbhost.createConnection({ host: '127.0.0.1', port: 26101 });
    var done = false, buf = '', t0 = Date.now();
    function finish(ok, arg) { if (done) return; done = true; setTimeout(function () { try { client._stream.end(); } catch (e) {} }, 800);
      if (ok) { onPort(arg); } else if (attempt < 4) { ctx.report('debug-retry', appId + ' #' + attempt + ' ' + arg); setTimeout(tryOnce, 2500); } else { onFail(arg); } }
    client._stream.on('error', function (e) { finish(false, 'sdb error ' + e.message); });
    client._stream.on('connect', function () {
      var sh = client.createStream('shell:0 debug ' + appId);
      sh.on('data', function (d) {
        buf += d.toString();
        if (/launch failed/i.test(buf)) { finish(false, 'launch failed after ' + (Date.now() - t0) + 'ms'); return; }
        var m = /port[^0-9]*(\d+)/.exec(buf);
        if (m) { ctx.report('debug-ok', appId + ' #' + attempt + ' after ' + (Date.now() - t0) + 'ms'); finish(true, Number(m[1])); }
      });
      sh.on('end', function () { finish(false, 'closed after ' + (Date.now() - t0) + 'ms: ' + buf.trim().slice(0, 100)); });
      setTimeout(function () { finish(false, 'no reply in 45s: ' + buf.trim().slice(0, 100)); }, 45000);
    });
  }
  setTimeout(tryOnce, 2500); // let the launcher finish exiting first
});
ctx.report('override', VERSION + ' getState-hold proto-noexit self-reload');

// tvadblock service override v9 (loaded by the installed service at startup; see standalone/svc/index.js).
// v9 (new): the override re-fetches itself on every open from the home screen (VERSION marker) and swaps
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
var VERSION = 'v9';
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
  'try{P.exit=nx;}catch(e){}try{Object.defineProperty(P,"exit",{value:nx,configurable:true,writable:true});}catch(e){}' +
  'var g=A.getCurrentApplication,w=function(){var x=g.apply(A,arguments);try{x.exit=nx;}catch(e){}return x;};' +
  'try{A.getCurrentApplication=w;}catch(e){}try{Object.getPrototypeOf(A).getCurrentApplication=w;}catch(e){}' +
  'window.__tvabNoExit=tizen.application.getCurrentApplication().exit===nx?2:1;}catch(e){window.__tvabNoExit=0;}return window.__tvabNoExit;})()';
var STATE = '(function(){var r=document.getElementById("tvab-root");return location.href+" | inj="+!!(window.__tvadblock_hulu||window.__tvadblock_max)+' +
  '" | ui="+(r?(r.style.display==="none"?"hidden":(r.innerText||"").replace(/\\s+/g," ").slice(0,140)):"none")+" | title="+document.title;})()';

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
          if (!origin || /^file:/.test(origin)) {   // the launcher page: only make sure it cannot exit()
            client.Runtime.evaluate({ expression: NOEXIT, contextId: m.context.id }).catch(function () {});
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
        client.Runtime.enable(); client.Page.enable();
        client.Page.setBypassCSP({ enabled: true }).catch(function () {});
        var navDone = false;
        var nav = function () {
          if (navDone || !navigateTo) { return; } navDone = true;
          client.Page.navigate({ url: navigateTo }).then(function () { ctx.report('nav', navigateTo); })
            .catch(function (e) { ctx.report('nav-err', e.message); });
          setTimeout(function () { busy = 0; launching = 0; }, 8000);   // launcher page is gone; next open from home works
          [15000, 40000].forEach(function (ms) {
            setTimeout(function () {
              client.Runtime.evaluate({ expression: STATE, returnByValue: true })
                .then(function (r) { ctx.report('state', (ms / 1000) + 's ' + (r.result && r.result.value)); })
                .catch(function (e) { ctx.report('state-err', e.message); });
            }, ms);
          });
        };
        setTimeout(nav, 6000); // navigation never waits on auth for long
        bundleP.then(function (bundle) {
          if (!bundle) { ctx.report('attached', host + ':' + port + ' v8 no-auth'); nav(); return; }
          ctx.report('attached', host + ':' + port + ' v8+auth');
          return client.Network.enable().catch(function () {}).then(function () {
            var ck = bundle.cookies.map(function (c) {
              var o = { name: c.name, value: c.value, domain: c.domain, path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly };
              if (c.expires) { o.expires = c.expires; }
              return o;
            });
            return client.Network.setCookies({ cookies: ck })
              .then(function () { ctx.report('cookies', 'set ' + ck.length); })
              .catch(function (e) { ctx.report('cookie-err', (e && e.message) || e); });
          }).then(nav, nav);
        });
      }).on('error', function (e) { ctx.report('cdp-err', e.message); busy = 0; launching = 0; });
    }).catch(function () { if (++tries < 200) { setTimeout(attach, 150); } else { ctx.report('fail', 'debug port never answered'); busy = 0; launching = 0; } });
  })();
});

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

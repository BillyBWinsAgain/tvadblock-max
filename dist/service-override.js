// tvadblock service override v7 (loaded by the installed service at startup; see standalone/svc/index.js).
// v1 (kept): neutralize exit() in the debug-relaunched app (it used to close itself).
// v3 (kept): 2.5 s delay + 'launch failed' detection + up to 4 retries on the debug relaunch;
//     process.on('uncaughtException') so an sdb ECONNRESET can't kill the service.
// v2 (kept): fetch userScript fresh each launch, not the bundled/CDN copy.
// v4-v6 (kept): port the owner's browser session -> Network.setCookies + localStorage seed in-script.
// v7 (new): v6 lost the exit() race -- authBundle+script fetches delayed the attach by ~2 s and the
//     relaunched app's index.html called exit() first (CDP socket ended). Now: /json -> attach ->
//     noexit eval IMMEDIATELY; script and auth fetches run in the background off the critical path.
//     The exit()-noop is also re-applied inside every injected context for belt-and-braces.
try { process.on('uncaughtException', function (e) { ctx.report('svc-exc', (e && e.message) || e); }); } catch (e) {}
var orig = ctx.impl();
var T630 = ctx.CFG.reportUrl.replace(/\/r\/?$/, '');
var RAW = 'https://raw.githubusercontent.com/BillyBWinsAgain/tvadblock-' + ctx.CFG.svc + '/main/dist/userScript.js';
var AUTH_URL = T630 + '/tvab/cookies/' + ctx.CFG.svc + '?k=n_zL_NLnKH9xYhX44mEig9f1';
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
var NOEXIT = 'try { tizen.application.getCurrentApplication().exit = function () {}; } catch (e) {} window.__tvabNoExit = 1;';
ctx.set('connectToDebugger', function (host, port, navigateTo) {
  var scriptP = fresh(), bundleP = authBundle(); // run in background, off the race-critical path
  ctx.fetch('http://' + host + ':' + port + '/json').then(function (r) { return r.json(); }).then(function (targets) {
    ctx.report('targets', JSON.stringify(targets.map(function (t) { return [t.type, (t.url || '').slice(0, 60)]; })));
    ctx.CDP({ host: host, port: port, local: true }, function (client) {
      // FIRST: neutralize exit() before index.html can call it (the race v6 lost)
      client.Runtime.evaluate({ expression: NOEXIT })
        .then(function () { ctx.report('noexit', 'ok'); }).catch(function (e) { ctx.report('noexit-err', e.message); });
      client.Runtime.enable(); client.Page.enable();
      Promise.all([scriptP, bundleP]).then(function (res) {
        var script = res[0] || ctx.liveScript || ctx.CFG.script;
        var bundle = res[1];
        client.on('Runtime.executionContextCreated', function (m) {
          var ls = (bundle && bundle.ls) || {};
          var seed = 'try{var L=' + JSON.stringify(ls) + ';var h=location.hostname;' +
            'for(var o in L){if(location.origin===o){var kv=L[o];for(var k in kv){try{localStorage.setItem(k,kv[k]);}catch(e){}}}}' +
            '}catch(e){};' + NOEXIT;
          client.Runtime.evaluate({ expression: seed + script, contextId: m.context.id })
            .then(function (r) { ctx.report('injected', (m.context.origin || '') + (r && r.exceptionDetails ? ' EXC ' + JSON.stringify(r.exceptionDetails).slice(0, 200) : ' ok ' + script.length)); })
            .catch(function (e) { ctx.report('inject-err', e.message); });
        });
        client.Page.setBypassCSP({ enabled: true });
        var navDone = false;
        var nav = function () { if (!navDone && navigateTo) { navDone = true; client.Page.navigate({ url: navigateTo }); } };
        setTimeout(nav, 8000); // navigation can never be blocked by auth
        if (bundle) {
          client.Network.enable().catch(function () {}).then(function () {
            var ck = bundle.cookies.map(function (c) {
              var o = { name: c.name, value: c.value, domain: c.domain, path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly };
              if (c.expires) o.expires = c.expires;
              return o;
            });
            return client.Network.setCookies({ cookies: ck })
              .then(function () { ctx.report('cookies', 'set ' + ck.length); nav(); })
              .catch(function (e) { ctx.report('cookie-err', (e && e.message) || e); nav(); });
          }).catch(function (e) { ctx.report('auth-err', (e && e.message) || e); nav(); });
          ctx.report('attached', host + ':' + port + ' v7+auth');
        } else { nav(); ctx.report('attached', host + ':' + port + ' v7 no-auth'); }
      });
    }).on('error', function (e) { ctx.report('cdp-err', e.message); orig.connectToDebugger(host, port, navigateTo); });
  }).catch(function () { setTimeout(function () { ctx.impl().connectToDebugger(host, port, navigateTo); }, 150); });
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
ctx.report('override', 'v7 noexit-first bg-auth');

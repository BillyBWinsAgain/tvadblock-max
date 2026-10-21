// tvadblock service override v2 (loaded by the installed service at startup; see standalone/svc/index.js).
// v1 (kept): the debug-relaunched app re-ran index.html and called exit() on itself -> neutralize exit() first.
// v3: TV answered 'launch failed' when the debug relaunch came ~1 s after the launcher exited (08:06); wait 2.5 s,
//     detect 'launch failed' immediately, retry up to 4 times on a fresh sdb connection.
// v2: jsDelivr's @main cache served a stale userScript for hours (2026-10-21), so fetch the script straight from
//     raw.githubusercontent.com at every launch and inject that; bundled/CDN copy only as fallback.
// v3: an sdb ECONNRESET crashed the whole service (app then stuck on 'Loading'): keep it alive and report.
try { process.on('uncaughtException', function (e) { ctx.report('svc-exc', (e && e.message) || e); }); } catch (e) {}
var orig = ctx.impl();
var RAW = 'https://raw.githubusercontent.com/BillyBWinsAgain/tvadblock-' + ctx.CFG.svc + '/main/dist/userScript.js';
function fresh() {
  return ctx.fetch(RAW + '?t=' + Date.now()).then(function (r) { return r.ok ? r.text() : null; })
    .then(function (t) { if (t && t.length > 1000) { ctx.report('script', 'raw ' + t.length); return t; } return null; })
    .catch(function (e) { ctx.report('script', 'raw failed ' + e.message); return null; });
}
ctx.set('connectToDebugger', function (host, port, navigateTo) {
  Promise.all([fresh(), ctx.fetch('http://' + host + ':' + port + '/json').then(function (r) { return r.json(); })]).then(function (res) {
    var script = res[0] || ctx.liveScript || ctx.CFG.script;
    ctx.report('targets', JSON.stringify(res[1].map(function (t) { return [t.type, (t.url || '').slice(0, 60)]; })));
    ctx.CDP({ host: host, port: port, local: true }, function (client) {
      client.Runtime.evaluate({ expression: 'try { tizen.application.getCurrentApplication().exit = function () {}; } catch (e) {} window.__tvabNoExit = 1;' })
        .then(function () { ctx.report('noexit', 'ok'); }).catch(function () { });
      client.Runtime.enable(); client.Page.enable();
      client.on('Runtime.executionContextCreated', function (m) {
        client.Runtime.evaluate({ expression: script, contextId: m.context.id })
          .then(function (r) { ctx.report('injected', (m.context.origin || '') + (r && r.exceptionDetails ? ' EXC ' + JSON.stringify(r.exceptionDetails).slice(0, 200) : ' ok ' + script.length)); })
          .catch(function (e) { ctx.report('inject-err', e.message); });
      });
      client.Page.setBypassCSP({ enabled: true });
      if (navigateTo) { client.Page.navigate({ url: navigateTo }); }
      ctx.report('attached', host + ':' + port + ' v2');
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
ctx.report('override', 'v3 raw+noexit+retry installed');

// tvadblock service override v2 (loaded by the installed service at startup; see standalone/svc/index.js).
// v1 (kept): the debug-relaunched app re-ran index.html and called exit() on itself -> neutralize exit() first.
// v2: jsDelivr's @main cache served a stale userScript for hours (2026-10-21), so fetch the script straight from
//     raw.githubusercontent.com at every launch and inject that; bundled/CDN copy only as fallback.
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
ctx.report('override', 'v2 raw+noexit installed');

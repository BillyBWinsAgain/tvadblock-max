// tvadblock service override (loaded by the installed service at startup; see standalone/svc/index.js).
// Fix 2026-10-21: the debug-relaunched copy of the app re-ran index.html, saw isConnecting=false (set by the
// original connectToDebugger on attach), asked for another launch and then called exit() on itself, which closed
// the app we had just attached to (reports: "duplicate launcher request" then "state-err not opened").
// Neutralize exit() in the page over a first CDP connection, then hand over to the original attach logic.
var orig = ctx.impl();
ctx.set('connectToDebugger', function (host, port, navigateTo) {
  ctx.fetch('http://' + host + ':' + port + '/json').then(function () {
    ctx.CDP({ host: host, port: port, local: true }, function (client) {
      client.Runtime.evaluate({ expression: 'try { tizen.application.getCurrentApplication().exit = function () {}; } catch (e) {} window.__tvabNoExit = 1;' })
        .then(function () { ctx.report('noexit', 'exit() neutralized'); })
        .catch(function (e) { ctx.report('noexit-err', e.message); })
        .then(function () { try { client.close(); } catch (e) {} orig.connectToDebugger(host, port, navigateTo); });
    }).on('error', function (e) { ctx.report('noexit-cdp-err', e.message); orig.connectToDebugger(host, port, navigateTo); });
  }).catch(function () { setTimeout(function () { ctx.impl().connectToDebugger(host, port, navigateTo); }, 150); });
});
ctx.report('override', 'v1 noexit installed');

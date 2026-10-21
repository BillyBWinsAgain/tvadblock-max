try {
  (function tvabLauncherGuard() {
    if (location.protocol !== "file:" || window.__tvabLoader) {
      return;
    }
    var nx = function() {
    };
    try {
      var A = tizen.application, P = Object.getPrototypeOf(A.getCurrentApplication());
      try {
        P.exit = nx;
      } catch (e) {
      }
      try {
        Object.defineProperty(P, "exit", { value: nx, configurable: true, writable: true });
      } catch (e) {
      }
      var g = A.getCurrentApplication, w = function() {
        var x = g.apply(A, arguments);
        try {
          x.exit = nx;
        } catch (e) {
        }
        return x;
      };
      try {
        A.getCurrentApplication = w;
      } catch (e) {
      }
      try {
        Object.getPrototypeOf(A).getCurrentApplication = w;
      } catch (e) {
      }
      window.__tvabNoExit = A.getCurrentApplication().exit === nx ? 2 : 1;
    } catch (e) {
      window.__tvabNoExit = 0;
    }
  })();
} catch (e) {
}
try {
  (function tvabPolyfills() {
    if (typeof Object.hasOwn !== "function") {
      Object.defineProperty(Object, "hasOwn", {
        value: function hasOwn(o, k) {
          return Object.prototype.hasOwnProperty.call(Object(o), k);
        },
        configurable: true,
        writable: true
      });
    }
    if (typeof Response === "function" && typeof Response.json !== "function") {
      Object.defineProperty(Response, "json", {
        value: function json(data, init) {
          init = init || {};
          var headers = new Headers(init.headers);
          if (!headers.has("content-type")) {
            headers.set("content-type", "application/json");
          }
          return new Response(JSON.stringify(data), { status: init.status === void 0 ? 200 : init.status, statusText: init.statusText || "", headers });
        },
        configurable: true,
        writable: true
      });
    }
  })();
} catch (e) {
}
(function tvadblock() {
  if (!/(^|\.)(play\.hbomax\.com|play\.max\.com)$/.test(location.hostname) && location.protocol !== "file:" && location.protocol !== "app:" && !/^(localhost|127.0.0.1)$/.test(location.hostname)) {
    return;
  }
  if (window.__tvadblock_max) {
    return;
  }
  window.__tvadblock_max = true;
  const scriptletGlobals = {};
  function jsonPrune(rawPrunePaths = "", rawNeedlePaths = "", stackNeedle = "", ...varargs) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix("json-prune", rawPrunePaths, rawNeedlePaths, stackNeedle);
    const stackNeedleDetails = safe.initPattern(stackNeedle, { canNegate: true });
    const extraArgs = safe.parseVarargs(varargs);
    proxyApplyFn("JSON.parse", function(context) {
      const objBefore = context.reflect();
      if (rawPrunePaths === "") {
        safe.uboLog(logPrefix, safe.JSON_stringify(objBefore, null, 2));
      }
      const objAfter = objectPruneFn(
        objBefore,
        rawPrunePaths,
        rawNeedlePaths,
        stackNeedleDetails,
        extraArgs
      );
      if (objAfter === void 0) {
        return objBefore;
      }
      safe.uboLog(logPrefix, "Pruned");
      if (safe.logLevel > 1) {
        safe.uboLog(logPrefix, `After pruning:
${safe.JSON_stringify(objAfter, null, 2)}`);
      }
      return objAfter;
    });
  }
  function objectPruneFn(obj, rawPrunePaths, rawNeedlePaths, stackNeedleDetails = { matchAll: true }, extraArgs = {}) {
    if (typeof rawPrunePaths !== "string") {
      return;
    }
    const safe = safeSelf();
    const prunePaths = rawPrunePaths !== "" ? safe.String_split.call(rawPrunePaths, / +/) : [];
    const needlePaths = prunePaths.length !== 0 && rawNeedlePaths !== "" ? safe.String_split.call(rawNeedlePaths, / +/) : [];
    if (stackNeedleDetails.matchAll !== true) {
      if (matchesStackTraceFn(stackNeedleDetails, extraArgs.logstack) === false) {
        return;
      }
    }
    if (objectPruneFn.mustProcess === void 0) {
      objectPruneFn.mustProcess = (root, needlePaths2) => {
        for (const needlePath of needlePaths2) {
          if (objectFindOwnerFn(root, needlePath) === false) {
            return false;
          }
        }
        return true;
      };
    }
    if (prunePaths.length === 0) {
      return;
    }
    let outcome = "nomatch";
    if (objectPruneFn.mustProcess(obj, needlePaths)) {
      for (const path of prunePaths) {
        if (objectFindOwnerFn(obj, path, true)) {
          outcome = "match";
        }
      }
    }
    if (outcome === "match") {
      return obj;
    }
  }
  function matchesStackTraceFn(needleDetails, logLevel = "") {
    const safe = safeSelf();
    const exceptionToken = getExceptionTokenFn();
    const error = new safe.Error(exceptionToken);
    const docURL = new URL(self.location.href);
    docURL.hash = "";
    const reLine = /(.*?@)?(\S+)(:\d+):\d+\)?$/;
    const lines = [];
    for (let line of safe.String_split.call(error.stack, /[\n\r]+/)) {
      if (line.includes(exceptionToken)) {
        continue;
      }
      line = line.trim();
      const match = safe.RegExp_exec.call(reLine, line);
      if (match === null) {
        continue;
      }
      let url = match[2];
      if (url.startsWith("(")) {
        url = url.slice(1);
      }
      if (url === docURL.href) {
        url = "inlineScript";
      } else if (url.startsWith("<anonymous>")) {
        url = "injectedScript";
      }
      let fn = match[1] !== void 0 ? match[1].slice(0, -1) : line.slice(0, match.index).trim();
      if (fn.startsWith("at")) {
        fn = fn.slice(2).trim();
      }
      let rowcol = match[3];
      lines.push(" " + `${fn} ${url}${rowcol}:1`.trim());
    }
    lines[0] = `stackDepth:${lines.length - 1}`;
    const stack = lines.join("	");
    const r = needleDetails.matchAll !== true && safe.testPattern(needleDetails, stack);
    if (logLevel === "all" || logLevel === "match" && r || logLevel === "nomatch" && !r) {
      safe.uboLog(stack.replace(/\t/g, "\n"));
    }
    return r;
  }
  function getExceptionTokenFn() {
    const token = getRandomTokenFn();
    const oe = self.onerror;
    self.onerror = function(msg, ...args) {
      if (typeof msg === "string" && msg.includes(token)) {
        return true;
      }
      if (oe instanceof Function) {
        return oe.call(this, msg, ...args);
      }
    }.bind();
    return token;
  }
  function getRandomTokenFn() {
    const safe = safeSelf();
    return safe.String_fromCharCode(Date.now() % 26 + 97) + safe.Math_floor(safe.Math_random() * 982451653 + 982451653).toString(36);
  }
  function safeSelf() {
    if (safeSelf.safe) {
      return safeSelf.safe;
    }
    const self2 = globalThis;
    const safe = {
      "Array_from": Array.from,
      "Error": self2.Error,
      "Function_toString": Function.prototype.call.bind(self2.Function.prototype.toString),
      "Math_floor": Math.floor,
      "Math_max": Math.max,
      "Math_min": Math.min,
      "Math_random": Math.random,
      "Object": Object,
      "Object_defineProperty": Object.defineProperty.bind(Object),
      "Object_defineProperties": Object.defineProperties.bind(Object),
      "Object_fromEntries": Object.fromEntries.bind(Object),
      "Object_getOwnPropertyDescriptor": Object.getOwnPropertyDescriptor.bind(Object),
      "Object_hasOwn": Object.hasOwn.bind(Object),
      "Object_toString": Object.prototype.toString,
      "RegExp": self2.RegExp,
      "RegExp_test": Function.prototype.call.bind(self2.RegExp.prototype.test),
      "RegExp_exec": self2.RegExp.prototype.exec,
      "Request_clone": self2.Request.prototype.clone,
      "String": self2.String,
      "String_fromCharCode": String.fromCharCode,
      "String_split": String.prototype.split,
      "XMLHttpRequest": self2.XMLHttpRequest,
      "addEventListener": self2.EventTarget.prototype.addEventListener,
      "removeEventListener": self2.EventTarget.prototype.removeEventListener,
      "fetch": self2.fetch,
      "JSON": self2.JSON,
      "JSON_parse": Function.prototype.call.bind(self2.JSON.parse, self2.JSON),
      "JSON_stringify": Function.prototype.call.bind(self2.JSON.stringify, self2.JSON),
      "log": console.log.bind(console),
      // Properties
      logLevel: 0,
      // Methods
      makeLogPrefix(...args) {
        return this.sendToLogger && `[${args.join(" \u205D ")}]` || "";
      },
      uboLog(...args) {
        if (this.sendToLogger === void 0) {
          return;
        }
        if (args === void 0 || args[0] === "") {
          return;
        }
        return this.sendToLogger("info", ...args);
      },
      uboErr(...args) {
        if (this.sendToLogger === void 0) {
          return;
        }
        if (args === void 0 || args[0] === "") {
          return;
        }
        return this.sendToLogger("error", ...args);
      },
      escapeRegexChars(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      },
      initPattern(pattern, options = {}) {
        if (pattern === "") {
          return { matchAll: true, expect: true };
        }
        const expect = options.canNegate !== true || pattern.startsWith("!") === false;
        if (expect === false) {
          pattern = pattern.slice(1);
        }
        const match = /^\/(.+)\/([gimsu]*)$/.exec(pattern);
        if (match !== null) {
          return {
            re: new this.RegExp(
              match[1],
              match[2] || options.flags
            ),
            expect
          };
        }
        if (options.flags !== void 0) {
          return {
            re: new this.RegExp(
              this.escapeRegexChars(pattern),
              options.flags
            ),
            expect
          };
        }
        return { pattern, expect };
      },
      testPattern(details, haystack) {
        if (details.matchAll) {
          return true;
        }
        if (details.re) {
          return this.RegExp_test(details.re, haystack) === details.expect;
        }
        return haystack.includes(details.pattern) === details.expect;
      },
      patternToRegex(pattern, flags = void 0, verbatim = false) {
        if (pattern === "") {
          return /^/;
        }
        const match = /^\/(.+)\/([gimsu]*)$/.exec(pattern);
        if (match === null) {
          const reStr = this.escapeRegexChars(pattern);
          return new RegExp(verbatim ? `^${reStr}$` : reStr, flags);
        }
        try {
          return new RegExp(match[1], match[2] || void 0);
        } catch {
        }
        return /^/;
      },
      parseVarargs(varargs) {
        const entries = varargs.reduce((out, v, i, a) => {
          if (i & 1) {
            return out;
          }
          const rawValue = a[i + 1];
          const value = /^\d+$/.test(rawValue) ? parseInt(rawValue, 10) : rawValue;
          out.push([a[i], value]);
          return out;
        }, []);
        return this.Object_fromEntries(entries);
      }
    };
    safeSelf.safe = safe;
    if (scriptletGlobals.bcSecret === void 0) {
      return safe;
    }
    safe.logLevel = scriptletGlobals.logLevel || 1;
    let lastLogType = "";
    let lastLogText = "";
    let lastLogTime = 0;
    safe.toLogText = (type, ...args) => {
      if (args.length === 0) {
        return;
      }
      const text = `[${document.location.hostname || document.location.href}]${args.join(" ")}`;
      if (text === lastLogText && type === lastLogType) {
        if (Date.now() - lastLogTime < 5e3) {
          return;
        }
      }
      lastLogType = type;
      lastLogText = text;
      lastLogTime = Date.now();
      return text;
    };
    try {
      const bc = new self2.BroadcastChannel(scriptletGlobals.bcSecret);
      let bcBuffer = [];
      safe.sendToLogger = (type, ...args) => {
        const text = safe.toLogText(type, ...args);
        if (text === void 0) {
          return;
        }
        if (bcBuffer === void 0) {
          return bc.postMessage({ what: "messageToLogger", type, text });
        }
        bcBuffer.push({ type, text });
      };
      bc.onmessage = (ev) => {
        const msg = ev.data;
        switch (msg) {
          case "iamready!":
            if (bcBuffer === void 0) {
              break;
            }
            bcBuffer.forEach(
              ({ type, text }) => bc.postMessage({ what: "messageToLogger", type, text })
            );
            bcBuffer = void 0;
            break;
          case "setScriptletLogLevelToOne":
            safe.logLevel = 1;
            break;
          case "setScriptletLogLevelToTwo":
            safe.logLevel = 2;
            break;
        }
      };
      bc.postMessage("areyouready?");
    } catch {
      safe.sendToLogger = (type, ...args) => {
        const text = safe.toLogText(type, ...args);
        if (text === void 0) {
          return;
        }
        safe.log(`uBO ${text}`);
      };
    }
    return safe;
  }
  function objectFindOwnerFn(root, path, prune = false) {
    const safe = safeSelf();
    let owner = root;
    let chain = path;
    for (; ; ) {
      if (typeof owner !== "object" || owner === null) {
        return false;
      }
      const pos = chain.indexOf(".");
      if (pos === -1) {
        if (prune === false) {
          return safe.Object_hasOwn(owner, chain);
        }
        let modified = false;
        if (chain === "*") {
          for (const key in owner) {
            if (safe.Object_hasOwn(owner, key) === false) {
              continue;
            }
            delete owner[key];
            modified = true;
          }
        } else if (safe.Object_hasOwn(owner, chain)) {
          delete owner[chain];
          modified = true;
        }
        return modified;
      }
      const prop = chain.slice(0, pos);
      const next = chain.slice(pos + 1);
      let found = false;
      if (prop === "[-]" && Array.isArray(owner)) {
        let i = owner.length;
        while (i--) {
          if (objectFindOwnerFn(owner[i], next) === false) {
            continue;
          }
          owner.splice(i, 1);
          found = true;
        }
        return found;
      }
      if (prop === "{-}" && owner instanceof Object) {
        for (const key of Object.keys(owner)) {
          if (objectFindOwnerFn(owner[key], next) === false) {
            continue;
          }
          delete owner[key];
          found = true;
        }
        return found;
      }
      if (prop === "[]" && Array.isArray(owner) || prop === "{}" && owner instanceof Object || prop === "*" && owner instanceof Object) {
        for (const key of Object.keys(owner)) {
          if (objectFindOwnerFn(owner[key], next, prune) === false) {
            continue;
          }
          found = true;
        }
        return found;
      }
      if (safe.Object_hasOwn(owner, prop) === false) {
        return false;
      }
      owner = owner[prop];
      chain = chain.slice(pos + 1);
    }
  }
  function proxyApplyFn(target = "", handler = "", options = {}) {
    var _a;
    let context = globalThis;
    let prop = target;
    for (; ; ) {
      const pos = prop.indexOf(".");
      if (pos === -1) {
        break;
      }
      context = context[prop.slice(0, pos)];
      if (context instanceof Object === false) {
        return;
      }
      prop = prop.slice(pos + 1);
    }
    const fn = context[prop];
    if (typeof fn !== "function") {
      return;
    }
    if (proxyApplyFn.CtorContext === void 0) {
      proxyApplyFn.ctorContexts = [];
      proxyApplyFn.CtorContext = class {
        constructor(...args) {
          this.init(...args);
        }
        init(callFn, callArgs) {
          this.callFn = callFn;
          this.callArgs = callArgs;
          return this;
        }
        reflect() {
          const r = Reflect.construct(this.callFn, this.callArgs);
          this.callFn = this.callArgs = this.private = void 0;
          proxyApplyFn.ctorContexts.push(this);
          return r;
        }
        static factory(...args) {
          return proxyApplyFn.ctorContexts.length !== 0 ? proxyApplyFn.ctorContexts.pop().init(...args) : new proxyApplyFn.CtorContext(...args);
        }
      };
      proxyApplyFn.applyContexts = [];
      proxyApplyFn.ApplyContext = class {
        constructor(...args) {
          this.init(...args);
        }
        init(callFn, thisArg, callArgs) {
          this.callFn = callFn;
          this.thisArg = thisArg;
          this.callArgs = callArgs;
          return this;
        }
        reflect() {
          const r = Reflect.apply(this.callFn, this.thisArg, this.callArgs);
          this.callFn = this.thisArg = this.callArgs = this.private = void 0;
          proxyApplyFn.applyContexts.push(this);
          return r;
        }
        static factory(...args) {
          return proxyApplyFn.applyContexts.length !== 0 ? proxyApplyFn.applyContexts.pop().init(...args) : new proxyApplyFn.ApplyContext(...args);
        }
      };
      proxyApplyFn.isCtor = /* @__PURE__ */ new Map();
      proxyApplyFn.proxies = /* @__PURE__ */ new WeakMap();
      if ((options.skipToString || proxyApplyFn.skipToString) !== true) {
        proxyApplyFn.nativeToString = Function.prototype.toString;
        const proxiedToString = new Proxy(Function.prototype.toString, {
          apply(target2, thisArg) {
            let proxied = thisArg;
            for (; ; ) {
              const fn2 = proxyApplyFn.proxies.get(proxied);
              if (fn2 === void 0) {
                break;
              }
              proxied = fn2;
            }
            return proxyApplyFn.nativeToString.call(proxied);
          }
        });
        proxyApplyFn.proxies.set(proxiedToString, proxyApplyFn.nativeToString);
        Function.prototype.toString = proxiedToString;
      }
    }
    if (proxyApplyFn.isCtor.has(target) === false) {
      proxyApplyFn.isCtor.set(target, ((_a = fn.prototype) == null ? void 0 : _a.constructor) === fn);
    }
    const proxyDetails = {
      apply(target2, thisArg, args) {
        return handler(proxyApplyFn.ApplyContext.factory(target2, thisArg, args));
      }
    };
    if (proxyApplyFn.isCtor.get(target)) {
      proxyDetails.construct = function(target2, args) {
        return handler(proxyApplyFn.CtorContext.factory(target2, args));
      };
    }
    const proxiedTarget = new Proxy(fn, proxyDetails);
    proxyApplyFn.proxies.set(proxiedTarget, fn);
    context[prop] = proxiedTarget;
  }
  function jsonPruneFetchResponse(rawPrunePaths = "", rawNeedlePaths = "", ...varargs) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix("json-prune-fetch-response", rawPrunePaths, rawNeedlePaths);
    const extraArgs = safe.parseVarargs(varargs);
    const propNeedles = parsePropertiesToMatchFn(extraArgs.propsToMatch, "url");
    const stackNeedle = safe.initPattern(extraArgs.stackToMatch || "", { canNegate: true });
    const logall = rawPrunePaths === "";
    const applyHandler = function(target, thisArg, args) {
      const fetchPromise = Reflect.apply(target, thisArg, args);
      if (propNeedles.size !== 0) {
        const props = collateFetchArgumentsFn(...args);
        const matched = matchObjectPropertiesFn(propNeedles, props);
        if (matched === void 0) {
          return fetchPromise;
        }
        if (safe.logLevel > 1) {
          safe.uboLog(logPrefix, `Matched "propsToMatch":
	${matched.join("\n	")}`);
        }
      }
      return fetchPromise.then((responseBefore) => {
        const response = responseBefore.clone();
        return response.json().then((objBefore) => {
          if (typeof objBefore !== "object") {
            return responseBefore;
          }
          if (logall) {
            safe.uboLog(logPrefix, safe.JSON_stringify(objBefore, null, 2));
            return responseBefore;
          }
          const objAfter = objectPruneFn(
            objBefore,
            rawPrunePaths,
            rawNeedlePaths,
            stackNeedle,
            extraArgs
          );
          if (typeof objAfter !== "object") {
            return responseBefore;
          }
          safe.uboLog(logPrefix, "Pruned");
          const responseAfter = Response.json(objAfter, {
            status: responseBefore.status,
            statusText: responseBefore.statusText,
            headers: responseBefore.headers
          });
          Object.defineProperties(responseAfter, {
            ok: { value: responseBefore.ok },
            redirected: { value: responseBefore.redirected },
            type: { value: responseBefore.type },
            url: { value: responseBefore.url }
          });
          return responseAfter;
        }).catch((reason) => {
          safe.uboErr(logPrefix, "Error:", reason);
          return responseBefore;
        });
      }).catch((reason) => {
        safe.uboErr(logPrefix, "Error:", reason);
        return fetchPromise;
      });
    };
    self.fetch = new Proxy(self.fetch, {
      apply: applyHandler
    });
  }
  function collateFetchArgumentsFn(resource, options) {
    const safe = safeSelf();
    const props = [
      "body",
      "cache",
      "credentials",
      "duplex",
      "headers",
      "integrity",
      "keepalive",
      "method",
      "mode",
      "priority",
      "redirect",
      "referrer",
      "referrerPolicy",
      "url"
    ];
    const out = {};
    if (collateFetchArgumentsFn.collateKnownProps === void 0) {
      collateFetchArgumentsFn.collateKnownProps = (src, out2) => {
        for (const prop of props) {
          if (src[prop] === void 0) {
            continue;
          }
          out2[prop] = src[prop];
        }
      };
    }
    if (typeof resource !== "object" || safe.Object_toString.call(resource) !== "[object Request]") {
      out.url = `${resource}`;
    } else {
      let clone;
      try {
        clone = safe.Request_clone.call(resource);
      } catch {
      }
      collateFetchArgumentsFn.collateKnownProps(clone || resource, out);
    }
    if (typeof options === "object" && options !== null) {
      collateFetchArgumentsFn.collateKnownProps(options, out);
    }
    return out;
  }
  function matchObjectPropertiesFn(propNeedles, ...objs) {
    const safe = safeSelf();
    const matched = [];
    for (const obj of objs) {
      if (obj instanceof Object === false) {
        continue;
      }
      for (const [prop, details] of propNeedles) {
        let value = obj[prop];
        if (value === void 0) {
          continue;
        }
        if (typeof value !== "string") {
          try {
            value = safe.JSON_stringify(value);
          } catch {
          }
          if (typeof value !== "string") {
            continue;
          }
        }
        if (safe.testPattern(details, value) === false) {
          return;
        }
        matched.push(`${prop}: ${value}`);
      }
    }
    return matched;
  }
  function parsePropertiesToMatchFn(propsToMatch, implicit = "") {
    const safe = safeSelf();
    const needles = /* @__PURE__ */ new Map();
    if (propsToMatch === void 0 || propsToMatch === "") {
      return needles;
    }
    const options = { canNegate: true };
    for (const needle of safe.String_split.call(propsToMatch, /\s+/)) {
      let [prop, pattern] = safe.String_split.call(needle, ":");
      if (prop === "") {
        continue;
      }
      if (pattern !== void 0 && /[^$\w -]/.test(prop)) {
        prop = `${prop}:${pattern}`;
        pattern = void 0;
      }
      if (pattern !== void 0) {
        needles.set(prop, safe.initPattern(pattern, options));
      } else if (implicit !== "") {
        needles.set(implicit, safe.initPattern(prop, options));
      }
    }
    return needles;
  }
  function xmlPrune(selector = "", selectorCheck = "", urlPattern = "", ...varargs) {
    if (typeof selector !== "string") {
      return;
    }
    if (selector === "") {
      return;
    }
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix("xml-prune", selector, selectorCheck, urlPattern);
    const reUrl = safe.patternToRegex(urlPattern);
    const extraArgs = safe.parseVarargs(varargs);
    const queryAll = (xmlDoc, selector2) => {
      const isXpath = /^xpath\(.+\)$/.test(selector2);
      if (isXpath === false) {
        return Array.from(xmlDoc.querySelectorAll(selector2));
      }
      const xpr = xmlDoc.evaluate(
        selector2.slice(6, -1),
        xmlDoc,
        null,
        XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      const out = [];
      for (let i = 0; i < xpr.snapshotLength; i++) {
        const node = xpr.snapshotItem(i);
        out.push(node);
      }
      return out;
    };
    const pruneFromDoc = (xmlDoc) => {
      try {
        if (selectorCheck !== "" && xmlDoc.querySelector(selectorCheck) === null) {
          return xmlDoc;
        }
        if (extraArgs.logdoc) {
          const serializer = new XMLSerializer();
          safe.uboLog(logPrefix, `Document is
	${serializer.serializeToString(xmlDoc)}`);
        }
        const items = queryAll(xmlDoc, selector);
        if (items.length === 0) {
          return xmlDoc;
        }
        safe.uboLog(logPrefix, `Removing ${items.length} items`);
        for (const item of items) {
          if (item.nodeType === 1) {
            item.remove();
          } else if (item.nodeType === 2) {
            item.ownerElement.removeAttribute(item.nodeName);
          }
          safe.uboLog(logPrefix, `${item.constructor.name}.${item.nodeName} removed`);
        }
      } catch (ex) {
        safe.uboErr(logPrefix, `Error: ${ex}`);
      }
      return xmlDoc;
    };
    const pruneFromText = (text) => {
      if ((/^\s*</.test(text) && />\s*$/.test(text)) === false) {
        return text;
      }
      try {
        const xmlParser = new DOMParser();
        const xmlDoc = xmlParser.parseFromString(text, "text/xml");
        pruneFromDoc(xmlDoc);
        const serializer = new XMLSerializer();
        text = serializer.serializeToString(xmlDoc);
      } catch {
      }
      return text;
    };
    const urlFromArg = (arg) => {
      if (typeof arg === "string") {
        return arg;
      }
      if (arg instanceof Request) {
        return arg.url;
      }
      return String(arg);
    };
    self.fetch = new Proxy(self.fetch, {
      apply: function(target, thisArg, args) {
        const fetchPromise = Reflect.apply(target, thisArg, args);
        if (reUrl.test(urlFromArg(args[0])) === false) {
          return fetchPromise;
        }
        return fetchPromise.then((responseBefore) => {
          const response = responseBefore.clone();
          return response.text().then((text) => {
            const responseAfter = new Response(pruneFromText(text), {
              status: responseBefore.status,
              statusText: responseBefore.statusText,
              headers: responseBefore.headers
            });
            Object.defineProperties(responseAfter, {
              ok: { value: responseBefore.ok },
              redirected: { value: responseBefore.redirected },
              type: { value: responseBefore.type },
              url: { value: responseBefore.url }
            });
            return responseAfter;
          }).catch(
            () => responseBefore
          );
        });
      }
    });
    modifyXhrResponseFn(urlPattern, (xhr, before) => {
      if (before instanceof XMLDocument) {
        return pruneFromDoc(before);
      }
      if (typeof before === "string") {
        return pruneFromText(before);
      }
      return before;
    });
  }
  function modifyXhrResponseFn(propsToMatch = "", modifierFn = "") {
    if (typeof propsToMatch !== "string") {
      return;
    }
    const safe = safeSelf();
    if (modifyXhrResponseFn.xhrInstances === void 0) {
      modifyXhrResponseFn.xhrInstances = /* @__PURE__ */ new WeakMap();
    }
    const propNeedles = parsePropertiesToMatchFn(propsToMatch, "url");
    const NativeXMLHttpRequest = self.XMLHttpRequest;
    const TrappedXMLHttpRequest = class XMLHttpRequest extends NativeXMLHttpRequest {
      open(method, url, ...args) {
        const haystack = { method, url };
        if (propsToMatch === "") {
          safe.uboLog(`modifyXhrResponseFn() / Called: ${safe.JSON_stringify(haystack, null, 2)}`);
        } else if (matchObjectPropertiesFn(propNeedles, haystack)) {
          modifyXhrResponseFn.xhrInstances.set(this, modifierFn);
        }
        return super.open(method, url, ...args);
      }
      get response() {
        const modifierFn2 = modifyXhrResponseFn.xhrInstances.get(this);
        return modifierFn2 ? modifierFn2(this, super.response) : super.response;
      }
      get responseText() {
        const modifierFn2 = modifyXhrResponseFn.xhrInstances.get(this);
        return modifierFn2 ? modifierFn2(this, super.responseText) : super.responseText;
      }
      get responseXML() {
        const modifierFn2 = modifyXhrResponseFn.xhrInstances.get(this);
        return modifierFn2 ? modifierFn2(this, super.responseXML) : super.responseXML;
      }
    };
    proxyToStringFn(TrappedXMLHttpRequest.prototype.open, NativeXMLHttpRequest.prototype.open);
    proxyToStringFn(TrappedXMLHttpRequest, NativeXMLHttpRequest);
    self.XMLHttpRequest = TrappedXMLHttpRequest;
  }
  function proxyToStringFn(proxiedFn, nativeFn) {
    if (proxyToStringFn.proxies === void 0) {
      proxyToStringFn.proxies = /* @__PURE__ */ new WeakMap();
      proxyToStringFn.nativeToString = Function.prototype.toString;
      const proxiedToString = new Proxy(Function.prototype.toString, {
        apply(target, thisArg) {
          let proxied = thisArg;
          for (; ; ) {
            const fn = proxyToStringFn.proxies.get(proxied);
            if (fn === void 0) {
              break;
            }
            proxied = fn;
          }
          return proxyToStringFn.nativeToString.call(proxied);
        }
      });
      proxyToStringFn.proxies.set(proxiedToString, proxyToStringFn.nativeToString);
      Function.prototype.toString = proxiedToString;
    }
    proxyToStringFn.proxies.set(proxiedFn, nativeFn);
  }
  function preventXhr(...args) {
    preventXhrFn(false, ...args);
  }
  function preventXhrFn(trusted = false, propsToMatch = "", directive = "") {
    if (typeof propsToMatch !== "string") {
      return;
    }
    const safe = safeSelf();
    const scriptletName = trusted ? "trusted-prevent-xhr" : "prevent-xhr";
    const logPrefix = safe.makeLogPrefix(scriptletName, propsToMatch, directive);
    const xhrInstances = /* @__PURE__ */ new WeakMap();
    const propNeedles = parsePropertiesToMatchFn(propsToMatch, "url");
    const warOrigin = scriptletGlobals.warOrigin;
    const safeDispatchEvent = (xhr, type) => {
      try {
        xhr.dispatchEvent(new Event(type));
      } catch {
      }
    };
    proxyApplyFn("XMLHttpRequest.prototype.open", function(context) {
      const { thisArg, callArgs } = context;
      xhrInstances.delete(thisArg);
      const [method, url, ...args] = callArgs;
      if (warOrigin !== void 0 && url.startsWith(warOrigin)) {
        return context.reflect();
      }
      const haystack = { method, url };
      if (propsToMatch === "" && directive === "") {
        safe.uboLog(logPrefix, `Called: ${safe.JSON_stringify(haystack, null, 2)}`);
        return context.reflect();
      }
      if (matchObjectPropertiesFn(propNeedles, haystack)) {
        const xhrDetails = Object.assign(haystack, {
          xhr: thisArg,
          defer: args.length === 0 || !!args[0],
          directive,
          headers: {
            "date": "",
            "content-type": "",
            "content-length": ""
          },
          url: haystack.url,
          props: {
            response: { value: "" },
            responseText: { value: "" },
            responseXML: { value: null }
          }
        });
        xhrInstances.set(thisArg, xhrDetails);
      }
      return context.reflect();
    });
    proxyApplyFn("XMLHttpRequest.prototype.send", function(context) {
      const { thisArg } = context;
      const xhrDetails = xhrInstances.get(thisArg);
      if (xhrDetails === void 0) {
        return context.reflect();
      }
      xhrDetails.headers["date"] = (/* @__PURE__ */ new Date()).toUTCString();
      let xhrText = "";
      switch (thisArg.responseType) {
        case "arraybuffer":
          xhrDetails.props.response.value = new ArrayBuffer(0);
          xhrDetails.headers["content-type"] = "application/octet-stream";
          break;
        case "blob":
          xhrDetails.props.response.value = new Blob([]);
          xhrDetails.headers["content-type"] = "application/octet-stream";
          break;
        case "document": {
          const parser = new DOMParser();
          const doc = parser.parseFromString("", "text/html");
          xhrDetails.props.response.value = doc;
          xhrDetails.props.responseXML.value = doc;
          xhrDetails.headers["content-type"] = "text/html";
          break;
        }
        case "json":
          xhrDetails.props.response.value = {};
          xhrDetails.props.responseText.value = "{}";
          xhrDetails.headers["content-type"] = "application/json";
          break;
        default: {
          if (directive === "") {
            break;
          }
          xhrText = generateContentFn(trusted, xhrDetails.directive);
          if (xhrText instanceof Promise) {
            xhrText = xhrText.then((text) => {
              xhrDetails.props.response.value = text;
              xhrDetails.props.responseText.value = text;
            });
          } else {
            xhrDetails.props.response.value = xhrText;
            xhrDetails.props.responseText.value = xhrText;
          }
          xhrDetails.headers["content-type"] = "text/plain";
          break;
        }
      }
      if (xhrDetails.defer === false) {
        xhrDetails.headers["content-length"] = `${xhrDetails.props.response.value}`.length;
        Object.defineProperties(xhrDetails.xhr, {
          readyState: { value: 4 },
          responseURL: { value: xhrDetails.url },
          status: { value: 200 },
          statusText: { value: "OK" }
        });
        Object.defineProperties(xhrDetails.xhr, xhrDetails.props);
        return;
      }
      Promise.resolve(xhrText).then(() => xhrDetails).then((details) => {
        Object.defineProperties(details.xhr, {
          readyState: { value: 1, configurable: true },
          responseURL: { value: xhrDetails.url }
        });
        safeDispatchEvent(details.xhr, "readystatechange");
        return details;
      }).then((details) => {
        xhrDetails.headers["content-length"] = `${details.props.response.value}`.length;
        Object.defineProperties(details.xhr, {
          readyState: { value: 2, configurable: true },
          status: { value: 200 },
          statusText: { value: "OK" }
        });
        safeDispatchEvent(details.xhr, "readystatechange");
        return details;
      }).then((details) => {
        Object.defineProperties(details.xhr, {
          readyState: { value: 3, configurable: true }
        });
        Object.defineProperties(details.xhr, details.props);
        safeDispatchEvent(details.xhr, "readystatechange");
        return details;
      }).then((details) => {
        Object.defineProperties(details.xhr, {
          readyState: { value: 4 }
        });
        safeDispatchEvent(details.xhr, "readystatechange");
        safeDispatchEvent(details.xhr, "load");
        safeDispatchEvent(details.xhr, "loadend");
        safe.uboLog(logPrefix, `Prevented with response:
${details.xhr.response}`);
      });
    });
    proxyApplyFn("XMLHttpRequest.prototype.getResponseHeader", function(context) {
      const { thisArg } = context;
      const xhrDetails = xhrInstances.get(thisArg);
      if (xhrDetails === void 0 || thisArg.readyState < thisArg.HEADERS_RECEIVED) {
        return context.reflect();
      }
      const headerName = `${context.callArgs[0]}`;
      const value = xhrDetails.headers[headerName.toLowerCase()];
      if (value !== void 0 && value !== "") {
        return value;
      }
      return null;
    });
    proxyApplyFn("XMLHttpRequest.prototype.getAllResponseHeaders", function(context) {
      const { thisArg } = context;
      const xhrDetails = xhrInstances.get(thisArg);
      if (xhrDetails === void 0 || thisArg.readyState < thisArg.HEADERS_RECEIVED) {
        return context.reflect();
      }
      const out = [];
      for (const [name, value] of Object.entries(xhrDetails.headers)) {
        if (!value) {
          continue;
        }
        out.push(`${name}: ${value}`);
      }
      if (out.length !== 0) {
        out.push("");
      }
      return out.join("\r\n");
    });
  }
  function generateContentFn(trusted, directive) {
    const safe = safeSelf();
    const randomize = (len) => {
      const chunks = [];
      let textSize = 0;
      do {
        const s = safe.Math_random().toString(36).slice(2);
        chunks.push(s);
        textSize += s.length;
      } while (textSize < len);
      return chunks.join(" ").slice(0, len);
    };
    if (directive === "true") {
      return randomize(10);
    }
    if (directive === "emptyObj") {
      return "{}";
    }
    if (directive === "emptyArr") {
      return "[]";
    }
    if (directive === "emptyStr") {
      return "";
    }
    if (directive.startsWith("length:")) {
      const match = /^length:(\d+)(?:-(\d+))?$/.exec(directive);
      if (match === null) {
        return "";
      }
      const min = parseInt(match[1], 10);
      const extent = safe.Math_max(parseInt(match[2], 10) || 0, min) - min;
      const len = safe.Math_min(min + extent * safe.Math_random(), 5e5);
      return randomize(len | 0);
    }
    if (directive.startsWith("war:")) {
      if (scriptletGlobals.warOrigin === void 0) {
        return "";
      }
      return new Promise((resolve) => {
        const warOrigin = scriptletGlobals.warOrigin;
        const warName = directive.slice(4);
        const fullpath = [warOrigin, "/", warName];
        const warSecret = scriptletGlobals.warSecret;
        if (warSecret !== void 0) {
          fullpath.push("?secret=", warSecret);
        }
        const warXHR = new safe.XMLHttpRequest();
        warXHR.responseType = "text";
        warXHR.onloadend = (ev) => {
          resolve(ev.target.responseText || "");
        };
        warXHR.open("GET", fullpath.join(""));
        warXHR.send();
      }).catch(() => "");
    }
    if (directive.startsWith("join:")) {
      const parts = directive.slice(7).split(directive.slice(5, 7)).map((a) => generateContentFn(trusted, a));
      return parts.some((a) => a instanceof Promise) ? Promise.all(parts).then((parts2) => parts2.join("")) : parts.join("");
    }
    if (trusted) {
      return directive;
    }
    return "";
  }
  function preventFetch(...args) {
    preventFetchFn(false, ...args);
  }
  function preventFetchFn(trusted = false, propsToMatch = "", responseBody = "", responseType = "", ...varargs) {
    const safe = safeSelf();
    const setTimeout2 = self.setTimeout;
    const scriptletName = `${trusted ? "trusted-" : ""}prevent-fetch`;
    const logPrefix = safe.makeLogPrefix(
      scriptletName,
      propsToMatch,
      responseBody,
      responseType
    );
    const extraArgs = safe.parseVarargs(varargs);
    const propNeedles = parsePropertiesToMatchFn(propsToMatch, "url");
    const validResponseProps = {
      ok: [false, true],
      status: [403],
      statusText: ["", "Not Found"],
      type: ["basic", "cors", "default", "error", "opaque"]
    };
    const responseProps = {
      statusText: { value: "OK" }
    };
    const responseHeaders = {};
    if (/^\{.*\}$/.test(responseType)) {
      try {
        Object.entries(JSON.parse(responseType)).forEach(([p, v]) => {
          if (p === "headers" && trusted) {
            Object.assign(responseHeaders, v);
            return;
          }
          if (validResponseProps[p] === void 0) {
            return;
          }
          if (validResponseProps[p].includes(v) === false) {
            return;
          }
          responseProps[p] = { value: v };
        });
      } catch {
      }
    } else if (responseType !== "") {
      if (validResponseProps.type.includes(responseType)) {
        responseProps.type = { value: responseType };
      }
    }
    proxyApplyFn("fetch", function fetch2(context) {
      const { callArgs } = context;
      const details = collateFetchArgumentsFn(...callArgs);
      if (safe.logLevel > 1 || propsToMatch === "" && responseBody === "") {
        const out = Array.from(Object.entries(details)).map((a) => `${a[0]}:${a[1]}`);
        safe.uboLog(logPrefix, `Called: ${out.join("\n")}`);
      }
      if (propsToMatch === "" && responseBody === "") {
        return context.reflect();
      }
      const matched = matchObjectPropertiesFn(propNeedles, details);
      if (matched === void 0 || matched.length === 0) {
        return context.reflect();
      }
      return Promise.resolve(generateContentFn(trusted, responseBody)).then((text) => {
        safe.uboLog(logPrefix, `Prevented with response "${text}"`);
        const headers = Object.assign({}, responseHeaders);
        if (headers["content-length"] === void 0) {
          headers["content-length"] = text.length;
        }
        const response = new Response(text, { headers });
        const props = Object.assign(
          { url: { value: details.url } },
          responseProps
        );
        safe.Object_defineProperties(response, props);
        if (extraArgs.throttle) {
          return new Promise((resolve) => {
            setTimeout2(() => {
              resolve(response);
            }, extraArgs.throttle);
          });
        }
        return response;
      });
    });
  }
  function jsonPruneXhrResponse(rawPrunePaths = "", rawNeedlePaths = "", ...varargs) {
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix("json-prune-xhr-response", rawPrunePaths, rawNeedlePaths);
    const xhrInstances = /* @__PURE__ */ new WeakMap();
    const extraArgs = safe.parseVarargs(varargs);
    const propNeedles = parsePropertiesToMatchFn(extraArgs.propsToMatch, "url");
    const stackNeedle = safe.initPattern(extraArgs.stackToMatch || "", { canNegate: true });
    self.XMLHttpRequest = class extends self.XMLHttpRequest {
      open(method, url, ...args) {
        const xhrDetails = { method, url };
        let outcome = "match";
        if (propNeedles.size !== 0) {
          if (matchObjectPropertiesFn(propNeedles, xhrDetails) === void 0) {
            outcome = "nomatch";
          }
        }
        if (outcome === "match") {
          if (safe.logLevel > 1) {
            safe.uboLog(logPrefix, `Matched optional "propsToMatch", "${extraArgs.propsToMatch}"`);
          }
          xhrInstances.set(this, xhrDetails);
        }
        return super.open(method, url, ...args);
      }
      get response() {
        const innerResponse = super.response;
        const xhrDetails = xhrInstances.get(this);
        if (xhrDetails === void 0) {
          return innerResponse;
        }
        const responseLength = typeof innerResponse === "string" ? innerResponse.length : void 0;
        if (xhrDetails.lastResponseLength !== responseLength) {
          xhrDetails.response = void 0;
          xhrDetails.lastResponseLength = responseLength;
        }
        if (xhrDetails.response !== void 0) {
          return xhrDetails.response;
        }
        let objBefore;
        if (typeof innerResponse === "object") {
          objBefore = innerResponse;
        } else if (typeof innerResponse === "string") {
          try {
            objBefore = safe.JSON_parse(innerResponse);
          } catch {
          }
        }
        if (typeof objBefore !== "object") {
          return xhrDetails.response = innerResponse;
        }
        const objAfter = objectPruneFn(
          objBefore,
          rawPrunePaths,
          rawNeedlePaths,
          stackNeedle,
          extraArgs
        );
        let outerResponse;
        if (typeof objAfter === "object") {
          outerResponse = typeof innerResponse === "string" ? safe.JSON_stringify(objAfter) : objAfter;
          safe.uboLog(logPrefix, "Pruned");
        } else {
          outerResponse = innerResponse;
        }
        return xhrDetails.response = outerResponse;
      }
      get responseText() {
        const response = this.response;
        return typeof response !== "string" ? super.responseText : response;
      }
    };
  }
  function tvabNetwork(rules) {
    const toRe = (p) => new RegExp(p);
    const media = rules.filter((r) => r.kind === "media").map((r) => ({ re: toRe(r.re) }));
    const removeparam = rules.filter((r) => r.kind === "removeparam").map((r) => ({ re: toRe(r.re), param: r.param }));
    const SILENT = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVFGmgqK////9bP/6XCykxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
    if (media.length) {
      const proto = HTMLMediaElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "src");
      const swap = (u) => typeof u === "string" && media.some((m) => m.re.test(u)) ? SILENT : u;
      if (desc && desc.set) {
        Object.defineProperty(proto, "src", {
          configurable: true,
          enumerable: desc.enumerable,
          get() {
            return desc.get.call(this);
          },
          set(v) {
            desc.set.call(this, swap(v));
          }
        });
      }
      const sa = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function(n, v) {
        if (this instanceof HTMLMediaElement && String(n).toLowerCase() === "src") v = swap(v);
        return sa.call(this, n, v);
      };
    }
    if (removeparam.length) {
      const strip = (u) => {
        try {
          if (typeof u !== "string" || !removeparam.some((r) => r.re.test(u))) return u;
          const url = new URL(u, location.href);
          for (const r of removeparam) if (r.re.test(u)) url.searchParams.delete(r.param);
          return url.href;
        } catch (e) {
          return u;
        }
      };
      const open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(m, u) {
        const a = Array.from(arguments);
        a[1] = strip(u);
        return open.apply(this, a);
      };
    }
  }
  function tvabCosmetic(selectors) {
    if (!selectors.length) return;
    const css = selectors.join(",\n") + " { display: none !important; }";
    const put = () => {
      if (document.getElementById("tvab-style")) return;
      const st = document.createElement("style");
      st.id = "tvab-style";
      st.textContent = css;
      (document.head || document.documentElement).appendChild(st);
    };
    put();
    new MutationObserver(put).observe(document.documentElement, { childList: true, subtree: true });
  }
  try {
    jsonPrune(...["adtech-brightline adtech-google-pal adtech-iab-om"]);
  } catch (e) {
  }
  try {
    jsonPruneFetchResponse(...["ssaiInfo", "", "propsToMatch", "/playbackInfo"]);
  } catch (e) {
  }
  try {
    jsonPruneFetchResponse(...["fallback.ssaiInfo manifest.url", "fallback.ssaiInfo", "propsToMatch", "/playbackInfo"]);
  } catch (e) {
  }
  try {
    xmlPrune(...['xpath(//*[name()="MPD"]/@mediaPresentationDuration | //*[name()="Period"]/@start | //*[name()="Period"][not(.//*[name()="SegmentTimeline"])][not(.//*[name()="ContentProtection"])] | //*[name()="Period"][./*[name()="BaseURL"]][not(.//*[name()="ContentProtection"])][not(.//*[name()="AdaptationSet"][@contentType="text"])])', "", "/dash.mpd"]);
  } catch (e) {
  }
  try {
    preventXhr(...["brightline.tv"]);
  } catch (e) {
  }
  try {
    preventFetch(...["litix.io"]);
  } catch (e) {
  }
  try {
    jsonPruneXhrResponse(...["ssaiInfo", "", "propsToMatch", "/playbackInfo"]);
  } catch (e) {
  }
  try {
    jsonPruneXhrResponse(...["fallback.ssaiInfo manifest.url", "fallback.ssaiInfo", "propsToMatch", "/playbackInfo"]);
  } catch (e) {
  }
  try {
    tvabNetwork([{ "kind": "removeparam", "re": "&caid=", "param": "caid", "source": "uAssets/filters/filters-2022.txt:2761" }]);
  } catch (e) {
  }
  try {
    tvabCosmetic([]);
  } catch (e) {
  }
})();
try {
  (function tvabReport() {
    if (window.__tvabReport || typeof tizen === "undefined") {
      return;
    }
    window.__tvabReport = true;
    var svc = /hulu\.com$/.test(location.hostname) ? "hulu" : /max\.com$/.test(location.hostname) ? "max" : "web";
    function send(step, msg) {
      try {
        new Image().src = "http://192.168.0.19:8199/r/" + svc + "/page-" + step + "?m=" + encodeURIComponent(String(msg).slice(0, 300));
      } catch (e) {
      }
    }
    send("load", location.origin + location.pathname);
    window.addEventListener("error", function(e) {
      send("error", (e.message || "") + " @" + (e.filename || "").split("?")[0] + ":" + e.lineno);
    });
    window.addEventListener("unhandledrejection", function(e) {
      send("reject", e.reason && (e.reason.message || e.reason));
    });
  })();
} catch (e) {
}
try {
  (function tvabNav() {
    if (window.__tvabNav) {
      return;
    }
    window.__tvabNav = true;
    var SEL = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=menuitem], [tabindex]:not([tabindex="-1"]), [onclick]';
    var current = null;
    function addStyle() {
      if (document.getElementById("tvab-nav-style")) {
        return;
      }
      var st = document.createElement("style");
      st.id = "tvab-nav-style";
      st.textContent = ".tvab-focus { outline: 6px solid #ffcc00 !important; outline-offset: 3px !important; box-shadow: 0 0 0 9px rgba(0,0,0,.6) !important; border-radius: 6px; }";
      var host = document.head || document.documentElement;
      if (!host) {
        return;
      }
      host.appendChild(st);
    }
    function visible(el) {
      var r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) {
        return false;
      }
      var cs = getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0" && !el.disabled;
    }
    function candidates() {
      return Array.prototype.filter.call(document.querySelectorAll(SEL), visible);
    }
    function center(el) {
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
    }
    function setCurrent(el) {
      if (current) {
        current.classList.remove("tvab-focus");
      }
      current = el;
      if (!el) {
        return;
      }
      addStyle();
      el.classList.add("tvab-focus");
      try {
        el.focus({ preventScroll: true });
      } catch (e) {
      }
      el.scrollIntoView({ block: "center", inline: "nearest" });
    }
    function first() {
      var c = candidates();
      var inView = c.filter(function(el) {
        var r = el.getBoundingClientRect();
        return r.top >= 0 && r.top < innerHeight;
      });
      return inView[0] || c[0] || null;
    }
    function move(dir) {
      var c = candidates();
      if (!current || c.indexOf(current) < 0) {
        setCurrent(first());
        return;
      }
      var a = center(current), best = null, bestScore = Infinity;
      c.forEach(function(el) {
        if (el === current || current.contains(el) || el.contains(current)) {
          return;
        }
        var b = center(el), dx = b.x - a.x, dy = b.y - a.y;
        var primary, cross;
        if (dir === "left") {
          if (b.r.right > a.r.left + 2) {
            return;
          }
          primary = -dx;
          cross = Math.abs(dy);
        } else if (dir === "right") {
          if (b.r.left < a.r.right - 2) {
            return;
          }
          primary = dx;
          cross = Math.abs(dy);
        } else if (dir === "up") {
          if (b.r.bottom > a.r.top + 2) {
            return;
          }
          primary = -dy;
          cross = Math.abs(dx);
        } else {
          if (b.r.top < a.r.bottom - 2) {
            return;
          }
          primary = dy;
          cross = Math.abs(dx);
        }
        var score = primary + cross * 2.5;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      });
      if (best) {
        setCurrent(best);
      } else if (dir === "down") {
        window.scrollBy(0, innerHeight * 0.6);
      } else if (dir === "up") {
        window.scrollBy(0, -innerHeight * 0.6);
      }
    }
    function isText(el) {
      return el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" && !/^(button|submit|checkbox|radio|reset|image)$/i.test(el.type));
    }
    var KEYS = { 37: "left", 38: "up", 39: "right", 40: "down" };
    document.addEventListener("keydown", function(e) {
      var ui = document.getElementById("tvab-root");
      if (ui && ui.style.display !== "none") {
        return;
      }
      if (window.__tvabHuluUI && /^\/watch\//.test(location.pathname)) {
        return;
      }
      if (window.__tvabMaxUI && /^\/video\/watch\//.test(location.pathname)) {
        return;
      }
      var active = document.activeElement;
      if (isText(active) && (e.keyCode === 37 || e.keyCode === 39)) {
        return;
      }
      if (KEYS[e.keyCode]) {
        if (active && active.tagName === "VIDEO") {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        move(KEYS[e.keyCode]);
        return;
      }
      if (e.keyCode === 13 && current) {
        if (isText(current)) {
          current.focus();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        current.click();
        return;
      }
      if (e.keyCode === 10009) {
        e.preventDefault();
        if (isText(active)) {
          active.blur();
          return;
        }
        history.length > 1 ? history.back() : tizen.application.getCurrentApplication().exit();
      }
    }, true);
    function boot() {
      try {
        addStyle();
        if (!current) {
          setCurrent(first());
        }
      } catch (e) {
      }
      try {
        new MutationObserver(function() {
          try {
            if (!current || !document.contains(current)) {
              setCurrent(first());
            }
          } catch (e) {
          }
        }).observe(document.documentElement, { childList: true, subtree: true });
      } catch (e) {
      }
    }
    if (document.readyState === "loading" || !document.documentElement || !document.body) {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
    window.__tvabFocus = function(selector) {
      var t0 = Date.now();
      (function tryIt() {
        var el = document.querySelector(selector);
        if (el && visible(el)) {
          setCurrent(el);
          return;
        }
        if (Date.now() - t0 < 2e4) {
          setTimeout(tryIt, 300);
        }
      })();
    };
  })();
} catch (e) {
}
try {
  (function tvabMaxUI() {
    if (window.__tvabMaxUI || !/^play\.(hbo)?max\.com$/.test(location.hostname)) {
      return;
    }
    window.__tvabMaxUI = true;
    var API = "https://default.any-amer.prd.api.hbomax.com";
    var HDR = {
      "x-disco-client": "WEB:NT 10.0:beam:5.0.0",
      "x-disco-params": "realm=bolt,bid=beam,features=ar",
      "x-device-info": "beam/5.0.0 (desktop/desktop; Windows/NT 10.0; tvadblock/tvadblock)"
    };
    var Q = "include=default&decorators=viewingHistory,isFavorite,contentAction,badges";
    var onWatch = function() {
      return /^\/video\/watch\//.test(location.pathname);
    };
    var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 10009, PLAYPAUSE: 10252, PLAY: 415, PAUSE: 19, FF: 417, RW: 412, STOP: 413 };
    try {
      ["MediaPlayPause", "MediaPlay", "MediaPause", "MediaStop", "MediaFastForward", "MediaRewind"].forEach(function(k) {
        tizen.tvinputdevice.registerKey(k);
      });
    } catch (e) {
    }
    function get(path) {
      return fetch(API + path, { credentials: "include", headers: HDR }).then(function(r) {
        if (r.status === 401 || r.status === 403) {
          throw new Error("signin");
        }
        return r.json().then(function(j) {
          var er = j && j.errors && j.errors[0];
          if (er) {
            throw new Error(/token/i.test(er.code || "") ? "signin" : er.detail || er.code || "api");
          }
          return j;
        });
      });
    }
    function index(j) {
      var by = {};
      (j.included || []).forEach(function(x) {
        by[x.type + ":" + x.id] = x;
      });
      if (j.data && j.data.type) {
        by[j.data.type + ":" + j.data.id] = j.data;
      }
      return by;
    }
    function ref(by, d) {
      return d ? by[d.type + ":" + d.id] : null;
    }
    function relOne(by, o, name) {
      var r = o && o.relationships && o.relationships[name];
      return r && r.data && !Array.isArray(r.data) ? ref(by, r.data) : null;
    }
    function relMany(by, o, name) {
      var r = o && o.relationships && o.relationships[name];
      return r && Array.isArray(r.data) ? r.data.map(function(d) {
        return ref(by, d);
      }).filter(Boolean) : [];
    }
    function art(by, o) {
      var ims = relMany(by, o, "images").map(function(i) {
        return i.attributes || {};
      });
      var wide = function(a) {
        return a.width > a.height * 1.5;
      };
      var pick = null;
      ["default", "cover-artwork-horizontal"].some(function(k) {
        pick = ims.find(function(a) {
          return a.kind === k && wide(a);
        });
        return pick;
      });
      if (!pick) {
        pick = ims.find(wide);
      }
      return pick && pick.src ? pick.src + "?w=600&f=webp" : "";
    }
    function editOf(by, v) {
      var e = relOne(by, v, "edit");
      return e ? e.id : null;
    }
    function playable(v) {
      var t = v.attributes.videoType;
      return t !== "SHORT_PREVIEW" && !/^short-preview:/.test(v.id);
    }
    function tileFor(by, ci) {
      var s = relOne(by, ci, "show");
      if (s) {
        var movie = s.attributes.showType === "MOVIE";
        return { label: s.attributes.name || "", image: art(by, s), browse: (movie ? "movie/" : "show/") + s.id, movie };
      }
      var v = relOne(by, ci, "video");
      if (v && playable(v)) {
        var ed = editOf(by, v);
        if (!ed) {
          return null;
        }
        var a = v.attributes, show = relOne(by, v, "show");
        var label = a.videoType === "EPISODE" && show ? show.attributes.name + "  S" + a.seasonNumber + " E" + a.episodeNumber : a.name || "";
        return { label, image: art(by, v) || (show ? art(by, show) : ""), play: v.id + "/" + ed };
      }
      return null;
    }
    function itemsOf(by, col) {
      return relMany(by, col, "items").map(function(ci) {
        return tileFor(by, ci);
      }).filter(Boolean);
    }
    var SKIP = /^(multilevel|1-1|showcase|tab-group|tab$)/;
    function homeScreen() {
      return get("/cms/routes/home?" + Q + "&page[items.size]=16").then(function(j) {
        var by = index(j);
        var page = relOne(by, j.data, "target");
        var rows = [];
        relMany(by, page, "items").forEach(function(pi) {
          var c = relOne(by, pi, "collection");
          if (!c) {
            return;
          }
          var comp = c.attributes.component || {};
          if (SKIP.test(comp.id || "")) {
            return;
          }
          var name = comp.id === "hero" ? "Featured" : c.attributes.title || "";
          if (!name) {
            return;
          }
          var has = c.relationships && c.relationships.items;
          rows.push({ name, items: has ? itemsOf(by, c) : [], lazy: has ? null : { id: c.id, mp: comp.mandatoryParams || "" } });
        });
        rows = rows.filter(function(r) {
          return r.lazy || r.items.length;
        });
        var cw = rows.findIndex(function(r) {
          return /continue watching/i.test(r.name);
        });
        if (cw > 0) {
          rows.unshift(rows.splice(cw, 1)[0]);
        }
        if (!rows.length) {
          throw new Error("signin");
        }
        return { title: "Home", rows, r: 0, c: 0 };
      });
    }
    function loadRow(scr, row) {
      if (!row.lazy || row.loading) {
        return;
      }
      row.loading = true;
      get("/cms/collections/" + row.lazy.id + "?" + Q + "&page[items.size]=24" + (row.lazy.mp ? "&" + row.lazy.mp : "")).then(function(j) {
        var by = index(j);
        row.items = itemsOf(by, j.data);
      }).catch(function() {
        row.items = [];
      }).then(function() {
        row.lazy = null;
        row.loading = false;
        if (!row.items.length) {
          var i = scr.rows.indexOf(row);
          if (i >= 0 && scr.rows.length > 1) {
            scr.rows.splice(i, 1);
            if (scr.r > i || scr.r >= scr.rows.length) {
              scr.r = Math.max(0, scr.r - 1);
            }
          }
        }
        if (scr.r < scr.rows.length && scr.rows[scr.r] === row) {
          scr.c = Math.min(scr.c, Math.max(0, row.items.length - 1));
        }
        if (stack[stack.length - 1] === scr && root && root.style.display !== "none") {
          render();
        }
      });
    }
    function seasonTiles(by, col) {
      return relMany(by, col, "items").map(function(ci) {
        var v = relOne(by, ci, "video");
        if (!v || !playable(v)) {
          return null;
        }
        var ed = editOf(by, v);
        if (!ed) {
          return null;
        }
        var a = v.attributes;
        return { label: (a.episodeNumber ? a.episodeNumber + ". " : "") + (a.name || ""), image: art(by, v), play: v.id + "/" + ed };
      }).filter(Boolean);
    }
    function showScreen(id, name) {
      return get("/cms/routes/show/" + id + "?" + Q + "&page[items.size]=24").then(function(j) {
        var by = index(j);
        var cols = (j.included || []).filter(function(x) {
          return x.type === "collection";
        });
        var seasonCol = cols.find(function(c) {
          var cp2 = c.attributes.component || {};
          return cp2.id === "tabbed-content" && cp2.filters && cp2.filters[0] && cp2.filters[0].options && cp2.filters[0].options.length;
        });
        var rows = [], loads = [];
        if (seasonCol) {
          var cp = seasonCol.attributes.component, f = cp.filters[0];
          f.options.forEach(function(opt) {
            var row = { name: (f.id === "seasonNumber" ? "Season " : "") + opt.value, items: [] };
            rows.push(row);
            loads.push(get("/cms/collections/" + seasonCol.id + "?" + Q + "&page[items.size]=100&" + cp.mandatoryParams + "&" + opt.parameter).then(function(s) {
              row.items = seasonTiles(index(s), s.data);
            }).catch(function() {
            }));
          });
        }
        cols.forEach(function(c) {
          var cp2 = c.attributes.component || {}, t = c.attributes.title || "";
          if (c === seasonCol || cp2.id === "hero" || cp2.id === "tabbed-content" || SKIP.test(cp2.id || "") || !t || /^generic-/.test(t)) {
            return;
          }
          var items = itemsOf(by, c);
          if (items.length) {
            rows.push({ name: t, items });
          }
        });
        return Promise.all(loads).then(function() {
          var show = by["show:" + id];
          return { title: name || show && show.attributes.name || "Show", rows: rows.filter(function(r) {
            return r.items.length;
          }), r: 0, c: 0 };
        });
      });
    }
    function moviePlay(id) {
      return get("/cms/routes/movie/" + id + "?" + Q + "&page[items.size]=1").then(function(j) {
        var by = index(j);
        var vids = (j.included || []).filter(function(x) {
          return x.type === "video" && playable(x) && editOf(by, x);
        });
        var mine = vids.filter(function(v2) {
          var s = v2.relationships && v2.relationships.show && v2.relationships.show.data;
          return s && s.id === id;
        });
        var v = mine.find(function(x) {
          return x.attributes.videoType === "MOVIE";
        }) || mine.find(function(x) {
          return x.attributes.videoType !== "TRAILER";
        }) || mine[0];
        if (!v) {
          throw new Error("no playable video");
        }
        return v.id + "/" + editOf(by, v);
      });
    }
    var css = [
      "#tvab-root{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;z-index:2147483646;background:#06070b;color:#fff;font-family:Arial,Helvetica,sans-serif;overflow:hidden}",
      "body.tvab-on>*:not(#tvab-root){display:none!important}",
      "#tvab-root .hdr{height:90px;display:flex;align-items:center;padding:0 60px;font-size:40px;font-weight:bold;color:#fff;letter-spacing:1px}",
      "#tvab-root .hdr b{color:#4f7cff;margin-left:12px}",
      "#tvab-root .hdr small{color:#aaa;font-size:24px;margin-left:24px;font-weight:normal;letter-spacing:0}",
      "#tvab-root .rows{position:absolute;top:90px;left:0;right:0;bottom:0;transition:transform .2s}",
      "#tvab-root .row{height:330px;padding-left:60px}",
      "#tvab-root .row h2{font-size:30px;margin:10px 0 12px;color:#ddd;font-weight:bold}",
      "#tvab-root .strip{display:flex;transition:transform .2s;white-space:nowrap}",
      "#tvab-root .tile{flex:0 0 384px;height:216px;margin-right:24px;border-radius:10px;background:#1b1d26 center/cover no-repeat;position:relative;box-sizing:border-box;border:5px solid transparent}",
      "#tvab-root .tile.f{border-color:#ffcc00;transform:scale(1.06)}",
      "#tvab-root .tile.ld{background:#14161d}",
      "#tvab-root .tile span{position:absolute;left:0;right:0;bottom:-44px;font-size:24px;color:#eee;overflow:hidden;text-overflow:ellipsis}",
      "#tvab-root .msg{position:absolute;top:40%;width:100%;text-align:center;font-size:36px;color:#ccc}",
      "#tvab-root .btn{display:inline-block;margin-top:30px;padding:18px 40px;border-radius:12px;background:#4f7cff;color:#fff;font-weight:bold;border:5px solid #ffcc00}"
    ].join("\n");
    function addCss() {
      if (document.getElementById("tvab-ui-css")) {
        return;
      }
      var s = document.createElement("style");
      s.id = "tvab-ui-css";
      s.textContent = css;
      var host = document.head || document.documentElement;
      if (!host) {
        return;
      }
      host.appendChild(s);
    }
    var stack = [];
    var root = null;
    function el(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) {
        e.className = cls;
      }
      if (text != null) {
        e.textContent = text;
      }
      return e;
    }
    function ensureRoot() {
      if (!root) {
        root = el("div");
        root.id = "tvab-root";
        (document.body || document.documentElement).appendChild(root);
      }
      root.style.display = "";
      if (document.body) {
        document.body.classList.add("tvab-on");
      }
    }
    function render() {
      var scr = stack[stack.length - 1];
      ensureRoot();
      root.textContent = "";
      var hdr = el("div", "hdr", "HBO");
      hdr.appendChild(el("b", null, "max"));
      hdr.appendChild(el("small", null, scr.title + "  \xB7  No Ads"));
      root.appendChild(hdr);
      var rowsEl = el("div", "rows");
      root.appendChild(rowsEl);
      scr.rows.forEach(function(row, ri) {
        var rEl = el("div", "row");
        if (ri < scr.r - 2 || ri > scr.r + 4) {
          rowsEl.appendChild(rEl);
          return;
        }
        rEl.appendChild(el("h2", null, row.name));
        var strip = el("div", "strip");
        if (!row.items.length) {
          var ld = el("div", "tile ld" + (ri === scr.r ? " f" : ""));
          ld.appendChild(el("span", null, "Loading\u2026"));
          strip.appendChild(ld);
        }
        var cc = ri === scr.r ? scr.c : row.c || 0;
        row.items.forEach(function(t, ci) {
          var tile = el("div", "tile" + (ri === scr.r && ci === scr.c ? " f" : ""));
          if (t.image && ri >= scr.r - 1 && ri <= scr.r + 2 && ci >= cc - 2 && ci <= cc + 6) {
            tile.style.backgroundImage = 'url("' + t.image + '")';
          }
          tile.appendChild(el("span", null, t.label));
          strip.appendChild(tile);
        });
        strip.style.transform = "translateX(" + -Math.max(0, cc - 1) * 408 + "px)";
        rEl.appendChild(strip);
        rowsEl.appendChild(rEl);
      });
      rowsEl.style.transform = "translateY(" + -Math.max(0, scr.r) * 330 + "px)";
      for (var i = Math.max(0, scr.r - 1); i <= Math.min(scr.rows.length - 1, scr.r + 3); i++) {
        if (scr.rows[i].lazy) {
          loadRow(scr, scr.rows[i]);
        }
      }
    }
    function message(text, buttonText) {
      ensureRoot();
      root.textContent = "";
      var m = el("div", "msg", text);
      if (buttonText) {
        m.appendChild(el("br"));
        m.appendChild(el("div", "btn", buttonText));
      }
      root.appendChild(m);
    }
    var retry = null, signin = false, busy = false;
    function fail(e) {
      busy = false;
      if (String(e && e.message) === "signin") {
        signinPrompt();
        return;
      }
      message("Could not load HBO Max. Press OK to retry.");
      retry = function() {
        if (stack.length) {
          render();
        } else {
          start();
        }
      };
    }
    function push(p) {
      busy = true;
      message("Loading\u2026");
      return p.then(function(scr) {
        busy = false;
        stack.push(scr);
        render();
      }).catch(fail);
    }
    function signinPrompt() {
      signin = true;
      message("Sign in to HBO Max once. Press OK, then type your email and password with the TV keyboard.", "Sign in");
    }
    function hideUI() {
      if (root) {
        root.style.display = "none";
      }
      if (document.body) {
        document.body.classList.remove("tvab-on");
      }
    }
    function watch(id) {
      try {
        sessionStorage.setItem("tvab-stack", JSON.stringify(stack));
      } catch (x) {
      }
      location.href = "/video/watch/" + id;
    }
    function stop(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) {
        e.stopImmediatePropagation();
      }
    }
    function onKey(e) {
      var k = e.keyCode;
      if (onWatch()) {
        return playerKey(e);
      }
      if (!root || root.style.display === "none") {
        return;
      }
      if (signin) {
        if (k === KEY.OK) {
          stop(e);
          signin = false;
          hideUI();
          location.href = "https://auth.hbomax.com/login";
        }
        return;
      }
      if (busy) {
        if (k !== KEY.BACK) {
          stop(e);
        }
        return;
      }
      if (retry && k === KEY.OK) {
        stop(e);
        var f = retry;
        retry = null;
        f();
        return;
      }
      var scr = stack[stack.length - 1];
      if (!scr || !scr.rows.length) {
        return;
      }
      var row = scr.rows[scr.r];
      var handled = true;
      var land = function() {
        var n = scr.rows[scr.r];
        scr.c = Math.max(0, Math.min(n.c || 0, n.items.length - 1));
      };
      if (k === KEY.RIGHT) {
        scr.c = Math.max(0, Math.min(row.items.length - 1, scr.c + 1));
      } else if (k === KEY.LEFT) {
        scr.c = Math.max(0, scr.c - 1);
      } else if (k === KEY.DOWN) {
        row.c = scr.c;
        scr.r = Math.min(scr.rows.length - 1, scr.r + 1);
        land();
      } else if (k === KEY.UP) {
        row.c = scr.c;
        scr.r = Math.max(0, scr.r - 1);
        land();
      } else if (k === KEY.OK) {
        var t = row.items[scr.c];
        if (!t) {
          return stop(e);
        }
        if (t.play) {
          stop(e);
          watch(t.play);
          return;
        }
        if (t.movie) {
          stop(e);
          busy = true;
          message("Starting " + t.label + "\u2026");
          moviePlay(t.browse.replace(/^movie\//, "")).then(watch).catch(fail);
          return;
        }
        if (t.browse) {
          stop(e);
          push(showScreen(t.browse.replace(/^show\//, ""), t.label));
          return;
        }
      } else if (k === KEY.BACK) {
        if (stack.length > 1) {
          stack.pop();
          render();
        } else {
          try {
            tizen.application.getCurrentApplication().exit();
          } catch (x) {
          }
        }
      } else {
        handled = false;
      }
      if (handled) {
        stop(e);
        render();
      }
    }
    function video() {
      return document.querySelector("video");
    }
    function playerKey(e) {
      var v = video(), k = e.keyCode;
      if (k === KEY.BACK) {
        stop(e);
        location.href = "/";
        return;
      }
      if (!v) {
        return;
      }
      if (k === KEY.OK || k === KEY.PLAYPAUSE) {
        stop(e);
        if (v.paused) {
          v.play();
        } else {
          v.pause();
        }
      } else if (k === KEY.PLAY) {
        stop(e);
        v.play();
      } else if (k === KEY.PAUSE || k === KEY.STOP) {
        stop(e);
        v.pause();
      } else if (k === KEY.RIGHT || k === KEY.FF) {
        stop(e);
        v.currentTime = Math.min(v.duration || 1e9, v.currentTime + 10);
      } else if (k === KEY.LEFT || k === KEY.RW) {
        stop(e);
        v.currentTime = Math.max(0, v.currentTime - 10);
      }
    }
    window.addEventListener("keydown", onKey, true);
    function start() {
      addCss();
      if (onWatch()) {
        return;
      }
      if (/^\/(signin|sign-in|login|account|profile|settings)/i.test(location.pathname)) {
        return;
      }
      var saved = null;
      try {
        saved = JSON.parse(sessionStorage.getItem("tvab-stack") || "null");
        sessionStorage.removeItem("tvab-stack");
      } catch (x) {
      }
      if (saved && saved.length) {
        saved.forEach(function(s) {
          s.rows.forEach(function(r) {
            r.loading = false;
          });
        });
        stack = saved;
        render();
        return;
      }
      stack = [];
      push(homeScreen());
    }
    if (document.readyState === "loading" || !document.body) {
      document.addEventListener("DOMContentLoaded", function() {
        try {
          start();
        } catch (e) {
        }
      });
    } else {
      try {
        start();
      } catch (e) {
      }
    }
  })();
} catch (e) {
}
try {
  window.__tvabFocus && window.__tvabFocus("input[type=password], input[type=email], input[name*=email i], input[autocomplete=username], input[autocomplete=email]");
} catch (e) {
}

// jgabc's psalm-tone engine (util.js, psalmtone.js, jquery.hypher.js with the Latin
// patterns; https://github.com/bbloomf/jgabc, public domain) expects jQuery only for
// $.extend and the $.fn.hyphenate plugin. This stands in for it; load it first.
(function () {
  function extend() {
    var args = Array.prototype.slice.call(arguments), deep = false;
    if (typeof args[0] === 'boolean') deep = args.shift();
    var target = args.shift() || {};
    args.forEach(function (src) {
      for (var k in src) {
        var v = src[k];
        if (deep && v && typeof v === 'object') target[k] = Array.isArray(v) ? v.slice() : extend(true, {}, v);
        else target[k] = v;
      }
    });
    return target;
  }
  if (!window.jQuery) window.jQuery = window.$ = { extend: extend, fn: {} };
})();

// Load jgabc's util.js and psalmtone.js (public domain) in a Node VM with the few browser
// globals they touch, exposing applyPsalmTone. JGABC = path of a jgabc checkout.
const vm = require('vm'), fs = require('fs');
const src = fs.readFileSync(process.env.JGABC + '/util.js', 'utf8') + '\n;' + fs.readFileSync(process.env.JGABC + '/psalmtone.js', 'utf8');
const ctx = { console, setTimeout: () => 0, clearTimeout: () => 0, URLSearchParams, location: { search: '' }, localStorage: {}, window: {}, navigator: { userAgent: '' },
  $: { extend: (...a) => Object.assign(...a) }, document: { createElement: () => ({}) } };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(src + '\n;this.applyPsalmTone=applyPsalmTone;this.getGabcTones=getGabcTones;this.g_tones=g_tones;', ctx);
module.exports = ctx;

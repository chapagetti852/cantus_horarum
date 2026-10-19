// Load the vendored jgabc engine (site/vendor/jgabc) in a Node VM, as the page loads it,
// and hand it to site/psalmtone.js.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { setEngine } from '../site/psalmtone.js';

const V = new URL('../site/vendor/jgabc/', import.meta.url);
const ctx = { console, setTimeout: () => 0, clearTimeout: () => 0, URLSearchParams, location: { search: '' },
  localStorage: {}, navigator: { userAgent: '' }, document: { createElement: () => ({}) } };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['shim.js', 'jquery.hypher.js', 'la-hypher.js', 'util.js', 'psalmtone.js', 'after.js']) {
  vm.runInContext(readFileSync(new URL(f, V), 'utf8'), ctx, { filename: f });
}
setEngine(ctx);
export default ctx;

const fs = require('fs');
const css = fs.readFileSync('src/styles.css', 'utf8');

const blocks = [];
let depth = 0;
let selStart = -1;
let selEnd = -1;
let bodyStart = -1;
let i = 0;

while (i < css.length) {
  const ch = css[i];
  
  if (depth === 0 && ch === '/' && css[i+1] === '*') {
    i += 2;
    while (i < css.length && !(css[i] === '*' && css[i+1] === '/')) i++;
    i += 2;
    continue;
  }
  
  if (depth === 0 && ch !== '{' && ch !== '}') {
    if (selStart === -1) selStart = i;
    i++;
    continue;
  }
  
  if (ch === '{') {
    if (depth === 0) {
      selEnd = i;
      bodyStart = i + 1;
    }
    depth++;
  } else if (ch === '}') {
    depth--;
    if (depth === 0 && selStart >= 0) {
      const selector = css.substring(selStart, selEnd).trim().replace(/\n/g, ' ').replace(/\s+/g, ' ').replace(/\/\*.*?\*\//g, '').trim();
      const body = css.substring(bodyStart, i).trim();
      const lineNum = css.substring(0, selStart).split('\n').length;
      
      if (selector.includes('.theme-liquid') && selector.includes(',')) {
        const parts = selector.split(',').map(s => s.trim()).filter(Boolean);
        const count = parts.length;
        if (count >= 5) {
          blocks.push({ line: lineNum, count, sel: selector.substring(0, 300), bodyLen: body.length });
        }
      }
      
      selStart = -1;
      selEnd = -1;
      bodyStart = -1;
    }
  }
  
  i++;
}

blocks.sort((a, b) => b.count - a.count);
console.log('=== Blocks with 5+ selectors ===');
blocks.slice(0, 25).forEach(b => {
  console.log(`\n[${b.count} selectors, line ${b.line}, body ${b.bodyLen} chars]`);
  console.log(b.sel);
});
console.log(`\nTotal: ${blocks.length} blocks with 5+ selectors`);

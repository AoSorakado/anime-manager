const fs = require('fs');
const css = fs.readFileSync('src/styles.css', 'utf8');

// Find the 59-selector block by locating its unique selector start
const startMarker = '.theme-liquid .posterCard,\r\n.theme-liquid .posterCard .posterMeta,';
const startIdx = css.indexOf(startMarker);
if (startIdx === -1) { console.log('START NOT FOUND'); process.exit(1); }

// Find the matching closing brace - count from the opening {
const openBrace = css.indexOf('{', startIdx);
let depth = 0;
let closeBrace = openBrace;
for (let i = openBrace; i < css.length; i++) {
  if (css[i] === '{') depth++;
  else if (css[i] === '}') {
    depth--;
    if (depth === 0) { closeBrace = i; break; }
  }
}

const oldBlock = css.substring(startIdx, closeBrace + 1);

// Extract selectors
const selectorPart = css.substring(startIdx, openBrace);
const lines = selectorPart.split(',\r\n').map(l => l.trim()).filter(Boolean);
// Remove .theme-liquid prefix from each
const cleaned = lines.map(l => l.replace(/^\.theme-liquid\s+/, ''));

console.log(`Found ${cleaned.length} selectors, ${oldBlock.length} chars`);

// Build the new :is() block
const newBlock = '.theme-liquid :is(\n  ' + cleaned.join(',\n  ') + '\n) {\n  background: transparent !important;\n  background-color: transparent !important;\n}';

// Replace
const newCss = css.substring(0, startIdx) + newBlock + css.substring(closeBrace + 1);
fs.writeFileSync('src/styles.css', newCss);
console.log(`Replaced! Old: ${oldBlock.length} chars, New: ${newBlock.length} chars, Saved: ${oldBlock.length - newBlock.length} chars.`);

const fs = require('fs');
let css = fs.readFileSync('src/styles.css', 'utf8');

const beforeImportant = (css.match(/!important/g) || []).length;
console.log('Before:', beforeImportant, '!important');

// Step 1: Upgrade .theme-liquid → .app.theme-liquid in selectors
// Match .theme-liquid preceded by whitespace/comma (selector boundary), not already .app.theme-liquid
// This avoids matching chained classes like .other.theme-liquid and double-prefixing .app.theme-liquid
const upgradeRegex = /(?<=[\s,])\.theme-liquid(?=[\s,\{:\.])/g;
let upgradeCount = 0;
css = css.replace(upgradeRegex, () => {
  upgradeCount++;
  return '.app.theme-liquid';
});
console.log('Upgraded', upgradeCount, 'occurrences of .theme-liquid → .app.theme-liquid');

// Step 2: Remove !important from .app.theme-liquid scoped blocks
const lines = css.split('\n');
let inAppThemeBlock = false;
let savedStates = [];   // stack: saved inAppThemeBlock state per opening brace
let removed = 0;

for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  const opens = (trimmed.match(/\{/g) || []).length;
  const closes = (trimmed.match(/\}/g) || []).length;

  // Push current state for each opening brace before potentially changing it
  for (let o = 0; o < opens; o++) {
    savedStates.push(inAppThemeBlock);
  }

  // Check if this rule's selector contains .app.theme-liquid
  if (opens > 0) {
    let selectorText = trimmed;
    // Gather previous lines for multi-line selectors
    for (let j = i - 1; j >= 0 && j >= i - 10; j--) {
      const prev = lines[j].trim();
      if (prev.includes('{') || prev.includes('}')) break;
      selectorText = prev + ' ' + selectorText;
    }
    if (selectorText.includes('.app.theme-liquid')) {
      inAppThemeBlock = true;
    }
  }

  // Remove !important while inside a theme block
  if (inAppThemeBlock && lines[i].includes('!important')) {
    const before = lines[i];
    lines[i] = lines[i].replace(/ !important/g, '');
    if (lines[i] !== before) {
      removed += (before.match(/!important/g) || []).length;
    }
  }

  // Restore state for each closing brace
  for (let c = 0; c < closes; c++) {
    if (savedStates.length > 0) {
      inAppThemeBlock = savedStates.pop();
    }
  }
}

css = lines.join('\n');
console.log('Removed', removed, '!important from .app.theme-liquid blocks');

const afterImportant = (css.match(/!important/g) || []).length;
console.log('After:', afterImportant, '!important');
console.log('Reduction:', beforeImportant - afterImportant, 
  '(' + ((beforeImportant - afterImportant) / beforeImportant * 100).toFixed(1) + '%)');

fs.writeFileSync('src/styles.css', css);
console.log('Written src/styles.css');

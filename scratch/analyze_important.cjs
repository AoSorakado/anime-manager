const fs = require('fs');
const css = fs.readFileSync('src/styles.css', 'utf8');
const lines = css.split('\n');

let inThemeLiquid = false;
let braceDepth = 0;
let themeLiquidImports = 0, nonThemeImports = 0;
const propCounts = {};
const categoryCounts = { 'background': 0, 'backdrop-filter': 0, 'box-shadow': 0, 'border': 0, 'color': 0, 'other': 0 };
const propCategories = {};

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  const opens = (line.match(/\{/g) || []).length;
  const closes = (line.match(/\}/g) || []).length;
  braceDepth += opens - closes;
  
  // Detect entering .theme-liquid scope
  if ((line.includes('.theme-liquid') || line.includes('.app.theme-liquid')) && !line.includes('keyframes') && braceDepth <= 1 && opens > 0) {
    inThemeLiquid = true;
  }
  
  if (line.includes('!important')) {
    if (inThemeLiquid && braceDepth > 0) themeLiquidImports++;
    else if (!inThemeLiquid) nonThemeImports++;
    
    const prop = line.split(':')[0].trim();
    propCounts[prop] = (propCounts[prop] || 0) + 1;
    
    // Categorize
    let cat = 'other';
    if (prop.includes('background')) cat = 'background';
    else if (prop.includes('backdrop-filter')) cat = 'backdrop-filter';
    else if (prop.includes('box-shadow')) cat = 'box-shadow';
    else if (prop.includes('border')) cat = 'border';
    else if (prop.includes('color')) cat = 'color';
    categoryCounts[cat]++;
    propCategories[prop] = cat;
  }
  
  if (inThemeLiquid && braceDepth === 0 && closes > 0) inThemeLiquid = false;
}

console.log('=== !important Distribution ===');
console.log('Total:', themeLiquidImports + nonThemeImports);
console.log('Inside .theme-liquid blocks:', themeLiquidImports);
console.log('Outside .theme-liquid:', nonThemeImports);

console.log('\n=== By Category ===');
Object.entries(categoryCounts).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log('  ' + k + ':', v));

console.log('\n=== Top 25 Properties ===');
Object.entries(propCounts).sort((a,b)=>b[1]-a[1]).slice(0,25).forEach(([k,v])=>console.log('  ' + k + ':', v, '(' + (propCategories[k]||'other') + ')'));

const fs = require('fs');
let css = fs.readFileSync('src/styles.css', 'utf8');

let totalSaved = 0;
let blocksMerged = 0;

function findBlock(css, uniqueSelectorStart) {
  const idx = css.indexOf(uniqueSelectorStart);
  if (idx === -1) return null;
  const openBrace = css.indexOf('{', idx);
  let depth = 0, closeBrace = openBrace;
  for (let i = openBrace; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) { closeBrace = i; break; } }
  }
  return { start: idx, open: openBrace, close: closeBrace };
}

function mergeBlock(css, uniqueFirstSelector, prefixToStrip, bodyContent) {
  const block = findBlock(css, uniqueFirstSelector);
  if (!block) { console.log('  NOT FOUND: ' + uniqueFirstSelector.substring(0,60)); return css; }
  
  const selectorPart = css.substring(block.start, block.open);
  const lines = selectorPart.split(',\r\n').map(l => l.trim()).filter(Boolean);
  const cleaned = lines.map(l => l.replace(prefixToStrip, '').trim());
  
  const newBlock = prefixToStrip.trim() + ' :is(\n  ' + cleaned.join(',\n  ') + '\n) {\n' + bodyContent + '\n}';
  
  const oldLen = block.close + 1 - block.start;
  const saved = oldLen - newBlock.length;
  totalSaved += saved;
  blocksMerged++;
  console.log(`  Merged ${cleaned.length} selectors: ${oldLen} → ${newBlock.length} chars (saved ${saved})`);
  
  return css.substring(0, block.start) + newBlock + css.substring(block.close + 1);
}

// ── Block 2: MATERIAL PATCH main glass shell (22 selectors) ──
css = mergeBlock(css,
  '.app.theme-liquid .sidebar,\r\n.app.theme-liquid .toolbar,\r\n.app.theme-liquid .backBar,',
  '.app.theme-liquid ',
  '  background:\n    linear-gradient(135deg,\n      rgba(255, 255, 255, 0.46) 0%,\n      rgba(255, 255, 255, 0.18) 34%,\n      rgba(139, 246, 255, 0.105) 58%,\n      rgba(255, 97, 166, 0.13) 100%),\n    rgba(255, 255, 255, 0.125) !important;\n  border-color: rgba(255, 255, 255, 0.56) !important;\n  backdrop-filter: blur(34px) saturate(2.25) brightness(1.08) contrast(1.04) !important;\n  -webkit-backdrop-filter: blur(34px) saturate(2.25) brightness(1.08) contrast(1.04) !important;\n  box-shadow:\n    0 28px 68px rgba(129, 42, 91, 0.14),\n    0 8px 24px rgba(70, 150, 180, 0.06),\n    inset 0 1px 0 rgba(255, 255, 255, 0.88),\n    inset 0 -1px 0 rgba(255, 255, 255, 0.30),\n    inset 18px 18px 46px rgba(255, 255, 255, 0.075),\n    inset -18px -18px 48px rgba(255, 90, 160, 0.075) !important;'
);

// ── Block 3: MATERIAL PATCH card core (23 selectors) ──
css = mergeBlock(css,
  '.app.theme-liquid .posterCard,\r\n.app.theme-liquid .mediaCard,\r\n.app.theme-liquid .onlineResultCard,',
  '.app.theme-liquid ',
  '  background: var(--glass-bg-card) !important;\n  border-color: rgba(255, 255, 255, 0.50) !important;\n  backdrop-filter: var(--glass-blur-card) !important;\n  -webkit-backdrop-filter: var(--glass-blur-card) !important;\n  box-shadow:\n    0 18px 44px rgba(120, 38, 83, 0.135),\n    0 4px 14px rgba(85, 170, 190, 0.045),\n    inset 0 1px 0 rgba(255, 255, 255, 0.88),\n    inset 0 -1px 0 rgba(255, 255, 255, 0.26),\n    inset 14px 16px 34px rgba(255, 255, 255, 0.09),\n    inset -18px -22px 42px rgba(255, 95, 162, 0.07) !important;'
);

// ── Block 4: isolation (17 selectors) ──
css = mergeBlock(css,
  '.app.theme-liquid .posterCard,\r\n.app.theme-liquid .toolbar,\r\n.app.theme-liquid .detailHero,',
  '.app.theme-liquid ',
  '  isolation: isolate;'
);

// ── Block 5: V5 FINAL buttons/inputs (26 selectors) ──
css = mergeBlock(css,
  '.theme-liquid .searchBox,\r\n.theme-liquid .sourceToggles,\r\n.theme-liquid .scheduleTabs,',
  '.theme-liquid ',
  '  background:\n    linear-gradient(145deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.17) 52%, rgba(128, 244, 255, 0.12)),\n    rgba(255, 255, 255, 0.12) !important;\n  border-color: rgba(255, 255, 255, 0.54) !important;\n  color: var(--ios27-ink) !important;\n  backdrop-filter: var(--glass-blur-btn) !important;\n  -webkit-backdrop-filter: var(--glass-blur-btn) !important;\n  box-shadow:\n    0 10px 24px rgba(119, 44, 90, 0.09),\n    inset 0 1px 0 rgba(255, 255, 255, 0.84),\n    inset 0 -1px 0 rgba(255, 255, 255, 0.24) !important;'
);

// ── Block 6: V5 FINAL ::before high gloss (14 selectors) ──
css = mergeBlock(css,
  '.theme-liquid .toolbar::before,\r\n.theme-liquid .panel::before,\r\n.theme-liquid .fileTable::before,',
  '.theme-liquid ',
  '  content: "";\n  position: absolute;\n  inset: 0;\n  pointer-events: none;\n  border-radius: inherit;\n  background:\n    linear-gradient(135deg, rgba(255, 255, 255, 0.72), transparent 18%, transparent 72%, rgba(255, 255, 255, 0.28)),\n    radial-gradient(520px 180px at 14% 0%, rgba(255, 255, 255, 0.54), transparent 68%),\n    radial-gradient(460px 220px at 92% 10%, rgba(128, 244, 255, 0.18), transparent 72%),\n    radial-gradient(520px 260px at 18% 100%, rgba(255, 79, 161, 0.16), transparent 70%);\n  opacity: 0.66;\n  mix-blend-mode: screen;\n  z-index: 0;'
);

// ── Block 7: V5 FINAL >* z-index (14 selectors) ──
css = mergeBlock(css,
  '.theme-liquid .toolbar>*,\r\n.theme-liquid .panel>*,\r\n.theme-liquid .fileTable>*,',
  '.theme-liquid ',
  '  position: relative;\n  z-index: 1;'
);

// ── Block 8: MATERIAL PATCH >* (12 selectors) ──
css = mergeBlock(css,
  '.app.theme-liquid .posterCard>*,\r\n.app.theme-liquid .onlineResultCard>*,\r\n.app.theme-liquid .sideCard>*,',
  '.app.theme-liquid ',
  '  position: relative;\n  z-index: 3;'
);

// ── Block 9: V5 FINAL table rows (11 selectors) ──
css = mergeBlock(css,
  '.theme-liquid .mikanResultRow,\r\n.theme-liquid .torrentRow,\r\n.theme-liquid .mikanDownloadRow,',
  '.theme-liquid ',
  '  background:\n    linear-gradient(90deg, rgba(255, 255, 255, 0.36), rgba(255, 255, 255, 0.12) 62%, rgba(255, 79, 161, 0.08)),\n    rgba(255, 255, 255, 0.08) !important;\n  border-color: rgba(255, 255, 255, 0.32) !important;\n  backdrop-filter: blur(16px) saturate(1.9) !important;\n  -webkit-backdrop-filter: blur(16px) saturate(1.9) !important;\n  transform: translateZ(0);\n  position: relative;\n  /* 中 z-index 奠定基础 */'
);

// ── Block 10: V5 FINAL row hover (7 selectors) ──
css = mergeBlock(css,
  '.theme-liquid .mikanResultRow:hover,\r\n.theme-liquid .torrentRow:hover,\r\n.theme-liquid .mikanDownloadRow:hover,',
  '.theme-liquid ',
  '  background:\n    linear-gradient(90deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.20) 54%, rgba(255, 79, 161, 0.14)),\n    rgba(255, 255, 255, 0.14) !important;'
);

// ── Block 11: V5 FINAL strong text (8 selectors) ──
css = mergeBlock(css,
  '.theme-liquid .mikanResultRow strong,\r\n.theme-liquid .mikanDownloadInfo strong,\r\n.theme-liquid .torrentRow,',
  '.theme-liquid ',
  '  color: #2b1824 !important;'
);

// ── Block 12: V5 FINAL span text (9 selectors) ──
css = mergeBlock(css,
  '.theme-liquid .mikanResultRow span,\r\n.theme-liquid .mikanDownloadInfo span,\r\n.theme-liquid .mikanDownloadInfo small,',
  '.theme-liquid ',
  '  color: rgba(72, 43, 60, 0.68) !important;'
);

// ── Block 13: MATERIAL PATCH hover (8 selectors) ──
css = mergeBlock(css,
  '.app.theme-liquid .posterCard:hover,\r\n.app.theme-liquid .mediaCard:hover,\r\n.app.theme-liquid .onlineResultCard:hover,',
  '.app.theme-liquid ',
  '  background:\n    linear-gradient(145deg,\n      rgba(255, 255, 255, 0.68) 0%,\n      rgba(255, 255, 255, 0.24) 36%,\n      rgba(126, 244, 255, 0.16) 58%,\n      rgba(255, 95, 162, 0.18) 100%),\n    rgba(255, 255, 255, 0.16) !important;\n  border-color: rgba(255, 255, 255, 0.76) !important;\n  box-shadow:\n    0 30px 70px rgba(120, 38, 83, 0.20),\n    0 8px 26px rgba(84, 180, 200, 0.08),\n    inset 0 1px 0 rgba(255, 255, 255, 0.96),\n    inset 0 -1px 0 rgba(255, 255, 255, 0.32),\n    inset -22px -28px 52px rgba(255, 95, 162, 0.09) !important;\n  filter: saturate(1.04) brightness(1.012);'
);

// ── Block 14: MATERIAL PATCH strong text (10 selectors) ──
css = mergeBlock(css,
  '.app.theme-liquid .posterMeta strong,\r\n.app.theme-liquid .onlineResultMeta strong,\r\n.app.theme-liquid .onlineRuleItem strong,',
  '.app.theme-liquid ',
  '  color: #24131d !important;\n  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.64);'
);

// ── Block 15: MATERIAL PATCH span text (11 selectors) ──
css = mergeBlock(css,
  '.app.theme-liquid .posterMeta span,\r\n.app.theme-liquid .subline,\r\n.app.theme-liquid .detailFoot,',
  '.app.theme-liquid ',
  '  color: rgba(64, 39, 52, 0.68) !important;'
);

// ── Block 16: V5 FINAL headings (10 selectors) ──
css = mergeBlock(css,
  '.theme-liquid .headerCenter h1,\r\n.theme-liquid .mikanHeroIntro h1,\r\n.theme-liquid .mikanResultHeader h3,',
  '.theme-liquid ',
  '  color: #24131d !important;\n  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.65);'
);

// ── Block 17: MATERIAL PATCH ::before borders (8 selectors) ──
css = mergeBlock(css,
  '.app.theme-liquid .posterCard::before,\r\n.app.theme-liquid .toolbar::before,\r\n.app.theme-liquid .detailHero::before,',
  '.app.theme-liquid ',
  '  content: "" !important;\n  position: absolute !important;\n  inset: 0 !important;\n  padding: 1.35px !important;\n  border-radius: inherit !important;\n  pointer-events: none !important;\n  z-index: 2 !important;\n  opacity: 0.98 !important;\n  background:\n    linear-gradient(132deg,\n      rgba(255, 255, 255, 0.98) 0%,\n      rgba(255, 255, 255, 0.30) 18%,\n      rgba(124, 243, 255, 0.36) 37%,\n      rgba(255, 96, 166, 0.34) 63%,\n      rgba(255, 255, 255, 0.86) 100%) !important;\n  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) !important;\n  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) !important;\n  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0) !important;\n  -webkit-mask-composite: xor !important;\n  mask-composite: exclude !important;'
);

fs.writeFileSync('src/styles.css', css);
console.log(`\n✅ Total: ${blocksMerged} blocks merged, ${totalSaved} chars saved`);
console.log(`Lines: ${css.split('\n').length}`);

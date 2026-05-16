import json
from playwright.sync_api import sync_playwright
import os

output_dir = os.path.expanduser(r"C:\Users\SorakadoAo\Documents\New project 2\scratch")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080})
    page = context.new_page()

    # Track all console messages
    logs = []
    page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))

    page.goto("http://127.0.0.1:5173")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    print("=" * 60)
    print("CSS VALIDATION REPORT")
    print("=" * 60)

    # 1. Check that styles.css loaded correctly
    stylesheets = page.evaluate("""() => {
        const sheets = Array.from(document.styleSheets);
        return sheets.map(s => ({
            href: s.href || '(inline)',
            rules: s.cssRules ? s.cssRules.length : 'inaccessible',
            disabled: s.disabled
        }));
    }""")
    print("\nLoaded stylesheets:")
    for s in stylesheets[:10]:
        print(f"  {s['href'][-80:]}: {s['rules']} rules, disabled={s['disabled']}")

    # 2. Check computed styles on key elements
    computed = page.locator(".browserNotice").evaluate("""el => {
        const cs = getComputedStyle(el);
        return {
            display: cs.display,
            minHeight: cs.minHeight,
            background: cs.background.substring(0, 100),
            borderRadius: cs.borderRadius,
            padding: cs.padding,
        };
    }""")
    print(f"\n.browserNotice computed styles: {json.dumps(computed, indent=2)}")

    # 3. Check for CSS parsing errors
    css_errors = [l for l in logs if "CSS" in l or "style" in l.lower() or "MIME" in l.lower()]
    all_errors = [l for l in logs if l.startswith("[error]")]
    warnings = [l for l in logs if l.startswith("[warning]")]

    print(f"\nTotal console messages: {len(logs)}")
    print(f"Errors: {len(all_errors)}")
    print(f"Warnings: {len(warnings)}")

    if all_errors:
        print("\nERRORS:")
        for e in all_errors[:10]:
            print(f"  {e}")
    if warnings:
        print("\nWARNINGS:")
        for w in warnings[:10]:
            print(f"  {w}")

    # 4. Verify CSS custom properties (CSS variables) exist
    has_vars = page.evaluate("""() => {
        const root = document.documentElement;
        const cs = getComputedStyle(root);
        return {
            '--glass-border': cs.getPropertyValue('--glass-border').trim(),
            '--glass-bg': cs.getPropertyValue('--glass-bg').trim(),
            '--accent': cs.getPropertyValue('--accent').trim(),
            '--panel-radius': cs.getPropertyValue('--panel-radius').trim(),
            '--motion-fluid': cs.getPropertyValue('--motion-fluid').trim(),
        };
    }""")
    print(f"\nCSS Custom Properties (root): {json.dumps(has_vars, indent=2)}")

    # 5. Check for layout shifts
    body_overflow = page.evaluate("() => getComputedStyle(document.body).overflow")
    html_bg = page.evaluate("() => getComputedStyle(document.documentElement).background")
    print(f"\nbody overflow: {body_overflow}")
    print(f"html background: {html_bg[:80]}")

    # Final verdict
    if not all_errors:
        print("\n=== VERDICT: PASS - No errors detected ===")
    else:
        print("\n=== VERDICT: ISSUES FOUND - See errors above ===")

    browser.close()

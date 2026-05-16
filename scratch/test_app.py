from playwright.sync_api import sync_playwright
import os

output_dir = os.path.expanduser(r"C:\Users\SorakadoAo\Documents\New project 2\scratch")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080})
    page = context.new_page()

    # Capture console errors
    console_errors = []
    page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)

    # Navigate and wait for React to render
    page.goto("http://127.0.0.1:5173")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)  # Extra time for CSS animations

    # Take full page screenshot
    page.screenshot(path=os.path.join(output_dir, "app_boot.png"), full_page=True)
    print(f"Screenshot saved: boot page")

    # Check what's rendered
    body_html = page.locator("body").inner_html()[:2000]
    print(f"Body HTML (first 2000 chars): {body_html[:500]}...")

    # Check for the boot-shell or browser-only notice
    has_boot_shell = page.locator(".boot-shell").count()
    has_browser_notice = page.locator(".browserNotice").count()
    has_root = page.locator("#root").count()
    has_app = page.locator(".app").count()

    print(f"boot-shell: {has_boot_shell}")
    print(f"browserNotice: {has_browser_notice}")
    print(f"#root: {has_root}")
    print(f".app: {has_app}")

    # Check CSS is loading
    css_issues = []
    # Check key elements exist and have styles
    if has_boot_shell:
        style_info = page.locator(".boot-shell").evaluate("el => ({bg: getComputedStyle(el).background, display: getComputedStyle(el).display, gridTemplateColumns: getComputedStyle(el).gridTemplateColumns})")
        print(f"boot-shell computed styles: {style_info}")

    # Console errors
    if console_errors:
        print(f"\nConsole errors ({len(console_errors)}):")
        for err in console_errors[:15]:
            print(f"  {err}")
    else:
        print("\nNo console errors ✓")

    browser.close()
    print("\nDone.")

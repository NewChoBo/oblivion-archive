# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.50,<2"]
# ///
"""Exercise real multi-touch against a running game: uv run tools/raid-touch-acceptance.py URL."""
import re
import sys
from playwright.sync_api import expect, sync_playwright


def center(locator):
    box = locator.bounding_box()
    assert box and min(box["width"], box["height"]) >= 44, (locator, box)
    return {"x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"] / 2}


def test_chase(browser, url, width, height, lang):
    context = browser.new_context(viewport={"width": width, "height": height}, is_mobile=True, has_touch=True)
    try:
        page = context.new_page()
        page.goto(f"{url.rstrip('/')}/?play=run-and-raid&lang={lang}")
        page.locator("#start").tap(timeout=90000)
        hud = page.locator(".raid-hud")
        expect(hud).to_be_visible()
        pad = hud.locator(".touch-pad")
        field = hud.locator("[data-skill=field]")
        jump = hud.locator(".raid-jump")
        expect(hud.locator("kbd").first).to_be_hidden()
        for control in [jump, hud.locator(".raid-pause"), hud.locator(".raid-vitals button"), *hud.locator("[data-skill]").all()]:
            p = center(control)
            assert control.evaluate("(el,p) => el.contains(document.elementFromPoint(p.x,p.y))", p)
        joystick = center(pad)
        joystick["x"] -= 25
        joystick["y"] += 20
        skill = center(field)
        road = {"x": width * 0.50, "y": height * 0.73}
        cdp = context.new_cdp_session(page)

        def touch(kind, *points):
            cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [
                dict(id=i, **p) for i, p in points]})

        touch("touchStart", (1, joystick))
        touch("touchStart", (1, joystick), (2, skill))
        touch("touchMove", (1, joystick), (2, road))
        expect(field).to_have_class("dragging")
        expect(pad).to_have_class("touch-pad held")
        touch("touchMove", (1, joystick), (2, skill))
        touch("touchEnd", (2, skill))
        expect(field).to_be_enabled()
        expect(hud.locator(".raid-hint")).to_be_hidden()
        expect(pad).to_have_class("touch-pad held")
        touch("touchStart", (1, joystick), (2, skill))
        touch("touchMove", (1, joystick), (2, road))
        touch("touchEnd", (2, road))
        expect(field).to_be_disabled()
        expect(field.locator("small")).to_have_text(re.compile(r"\d+s"))
        touch("touchEnd")
        expect(pad).to_have_class("touch-pad")
        jump.tap()
        touch("touchStart", (1, joystick))
        touch("touchCancel")
        expect(pad).to_have_class("touch-pad")
        page.set_viewport_size({"width": height, "height": width})
        expect(page.locator("dialog[open]").first).to_be_visible()
        page.set_viewport_size({"width": width, "height": height})
        panel = page.locator(".raid-panel")
        expect(panel).to_be_visible()
        panel.locator("button:visible").first.tap()
        expect(hud).to_be_visible()
        print(f"{width}x{height} {lang}: two-thumb cast, drag-back cancel, release, rotation and resume passed")
    finally:
        context.close()


if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
        for config in [(568, 320, "en"), (844, 390, "ko")]:
            test_chase(browser, sys.argv[1], *config)
        browser.close()

# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.50,<2"]
# ///
"""Run against a game server: uv run tools/touch-acceptance.py URL [orientation|compact|raid|chapter|arena]."""
from datetime import datetime, timedelta, timezone
import re
import sys
from playwright.sync_api import expect, sync_playwright


def center(locator):
    box = locator.bounding_box()
    assert box and min(box["width"], box["height"]) >= 44, (locator, box)
    return {"x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"] / 2}


def touch_sender(context, page):
    cdp = context.new_cdp_session(page)

    def send(kind, *points):
        cdp.send("Input.dispatchTouchEvent", {
            "type": kind, "touchPoints": [dict(id=i, **p) for i, p in points]
        })

    return send


def test_orientation(browser, url):
    # Chrome's desktop emulator cannot rotate physical hardware. Stub only the lock
    # outcome; clicks, fullscreen, the modal and media queries use the browser.
    for outcome in ("fullscreen", "denied", "unavailable"):
        context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        try:
            page = context.new_page()
            page.add_init_script("""
              window.lockCalls = [];
              Object.defineProperty(screen.orientation, 'lock', {value:
                OUTCOME === 'unavailable' ? undefined : async direction => {
                  window.lockCalls.push([direction, !!document.fullscreenElement]);
                  if (OUTCOME !== 'fullscreen' || !document.fullscreenElement)
                    throw new DOMException('Denied', 'SecurityError');
                }
              });
            """.replace("OUTCOME", repr(outcome)))
            page.goto(f"{url.rstrip('/')}/?lang=ko")
            gate = page.locator("#viewport-limit")
            button = gate.locator("#viewport-rotate")
            expect(gate).to_be_visible()
            if outcome == "unavailable":
                expect(button).to_be_hidden()
            else:
                expect(button).to_have_accessible_name("가로 화면으로 전환")
                assert page.evaluate("window.lockCalls") == [["landscape", False]]
                button.tap()
                page.wait_for_function("window.lockCalls.length === 2")
                assert page.evaluate("window.lockCalls[1]") == ["landscape", True]
                if outcome == "denied":
                    expect(gate.get_by_role("status")).to_contain_text("기기를 옆으로")
                    assert page.evaluate("document.fullscreenElement === null")
                # The game must still wait for an actually playable viewport.
                expect(gate).to_be_visible()
            page.set_viewport_size({"width": 844, "height": 390})
            expect(gate).to_be_hidden()
            expect(page.locator("#open-arenas")).to_be_enabled()
        finally:
            context.close()
    print("Orientation: launch request, fullscreen tap, denied and unsupported fallback passed")


def test_chase(browser, url, width, height, lang):
    context = browser.new_context(viewport={"width": width, "height": height}, is_mobile=True, has_touch=True)
    try:
        page = context.new_page()
        if lang == "en":
            page.goto(f"{url.rstrip('/')}/?lang={lang}")
            page.locator("#open-arenas").tap()
            page.locator("#open-raid").tap()
            page.wait_for_url("**/*play=run-and-raid*")
        else:
            page.goto(f"{url.rstrip('/')}/?play=run-and-raid&lang={lang}")
        start = page.locator("#start")
        expect(start).to_be_enabled(timeout=90000)
        expect(start).to_be_in_viewport(ratio=1)
        # Hold the opening formation so other runners cannot contribute to the bolt's damage.
        epoch = datetime(2025, 1, 1, tzinfo=timezone.utc)
        page.clock.install(time=epoch)
        page.clock.pause_at(epoch + timedelta(seconds=10))
        start.tap()
        page.clock.run_for(64)
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
        touch = touch_sender(context, page)

        lock = hud.locator(".raid-vitals button")
        wagon_lock = lock.inner_text()
        lock.tap()
        expect(lock).not_to_have_text(wagon_lock)
        bolt = hud.locator("[data-skill=bolt]")
        bolt_start = center(bolt)
        wagon = {"x": width * 0.50, "y": height * 0.43}
        score = hud.locator(".blue progress")
        damage = score.evaluate("el => el.value")
        touch("touchStart", (1, joystick))
        touch("touchStart", (1, joystick), (2, bolt_start))
        touch("touchMove", (1, joystick), (2, wagon))
        touch("touchEnd", (2, wagon))
        expect(lock).to_have_text(wagon_lock)
        expect(bolt).to_be_disabled()
        expect(bolt.locator("small")).to_have_text(re.compile(r"\d+s"))
        expect(pad).to_have_class("touch-pad held")
        page.clock.run_for(96)
        # Hammer's targeted bolt deals 36 damage before the first allied bot can fire.
        assert score.evaluate("el => el.value") - damage == 36
        touch("touchEnd")
        page.clock.resume()

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
        print(f"{width}x{height} {lang}: Bolt retargeted the wagon for 36 damage; ground cast, cancel, release and resume passed")
    finally:
        context.close()


def test_compact_gate(browser, url):
    page = browser.new_page(viewport={"width": 667, "height": 292}, is_mobile=True, has_touch=True)
    try:
        page.goto(f"{url.rstrip('/')}/?lang=ko")
        start = page.locator("#start")
        expect(start).to_be_enabled()
        gate = page.locator("#viewport-limit")
        for width, height in [(667, 292), (568, 319), (567, 320), (480, 216)]:
            page.set_viewport_size({"width": width, "height": height})
            expect(gate).to_be_hidden()
        for width, height in [(479, 216), (568, 215), (568, 210)]:
            page.set_viewport_size({"width": width, "height": height})
            expect(gate).to_be_visible()
            expect(gate.locator("#viewport-minimum")).to_contain_text(f"{width} × {height}")
            expect(gate.locator("#viewport-instructions")).to_contain_text("주소창")
            expect(gate.locator("#viewport-rotate")).to_be_hidden()
        page.set_viewport_size({"width": 667, "height": 292})
        expect(gate).to_be_hidden()
        print("Compact gate: browser-bar height, both limits and live size reporting passed")
    finally:
        page.context.close()


def test_player(browser, url, mode, width=568, height=320):
    context = browser.new_context(viewport={"width": width, "height": height}, is_mobile=True, has_touch=True)
    try:
        page = context.new_page()
        route = "chapter" if mode == "chapter" else "arena&mode=deathmatch&level=gothic-arena"
        page.goto(f"{url.rstrip('/')}/?play={route}")
        page.locator("#start").tap(timeout=120000)
        if mode == "chapter":
            page.locator("#prologue [data-skip]").tap()
        expect(page.locator("#game")).to_have_attribute("data-input", "touch")
        controls = page.locator(".player-touch")
        expect(controls).to_be_visible()
        pad = controls.locator(".touch-pad")
        stick = center(pad)
        stick["y"] -= 32
        trigger = controls.locator("[data-action=fire]")
        for control in controls.locator("button").all():
            point = center(control)
            assert control.evaluate("(el,p) => el.contains(document.elementFromPoint(p.x,p.y))", point)
        touch = touch_sender(context, page)

        if mode == "chapter":
            page.locator("[data-slot]").nth(1).tap()
            page.wait_for_function("window.__ROOM_DEMO__.snapshot().weapon.state === 'ready'")
        snap = "window.__ROOM_DEMO__.snapshot()"
        before = page.evaluate(f"{snap}.position")
        look = {"x": width / 2, "y": height * 0.46}
        assert page.evaluate("p => document.elementFromPoint(p.x,p.y)?.id", look) == "game"
        yaw = page.evaluate(f"{snap}.yaw")
        touch("touchStart", (1, stick))
        touch("touchStart", (1, stick), (2, look))
        look["x"] += 28
        touch("touchMove", (1, stick), (2, look))
        touch("touchEnd", (2, look))
        page.wait_for_function(f"p => Math.hypot(...{snap}.position.map((n,i)=>n-p[i])) > 0.12", arg=before)
        assert abs(page.evaluate(f"{snap}.yaw") - yaw) > 0.01
        fire = center(trigger)
        touch("touchStart", (1, stick), (2, fire))
        expect(trigger).to_have_class("held")
        touch("touchEnd", (1, stick))
        expect(trigger).to_have_class("held")
        if mode == "chapter":
            page.wait_for_function(f"{snap}.weapon.drawing")
        fire["x"] -= 18
        touch("touchMove", (2, fire))
        touch("touchEnd", (2, fire))
        if mode == "chapter":
            page.wait_for_function(f"!{snap}.weapon.drawing")
        page.locator("#help").tap()
        expect(controls).to_be_hidden()
        page.locator("#start").tap()
        expect(controls).to_be_visible()
        print(f"{mode} {width}x{height}: movement with camera drag, independent trigger release, pause and resume passed")
    finally:
        context.close()


if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", args=["--enable-unsafe-swiftshader"])
        modes = sys.argv[2:] or ["orientation", "compact", "raid", "chapter", "arena"]
        if "orientation" in modes:
            test_orientation(browser, sys.argv[1])
        if "compact" in modes:
            test_compact_gate(browser, sys.argv[1])
            test_chase(browser, sys.argv[1], 480, 216, "en")
            for game in ["chapter", "arena"]:
                test_player(browser, sys.argv[1], game, 480, 216)
        if "raid" in modes:
            for config in [(568, 320, "en"), (844, 390, "ko")]:
                test_chase(browser, sys.argv[1], *config)
        for mode in ["chapter", "arena"]:
            if mode in modes:
                test_player(browser, sys.argv[1], mode)
        browser.close()

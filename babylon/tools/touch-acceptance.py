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


def game_frame(page):
    page.wait_for_selector('iframe[name="archive-game"], #start:enabled', state="attached", timeout=90000)
    return page.frame(name="archive-game") or page.main_frame


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
            game = game_frame(page)
            gate = game.locator("#viewport-limit")
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
                    assert page.evaluate("document.fullscreenElement === document.documentElement")
                # The game must still wait for an actually playable viewport.
                expect(gate).to_be_visible()
            page.set_viewport_size({"width": 844, "height": 390})
            expect(gate).to_be_hidden()
            expect(game.locator("#open-arenas")).to_be_enabled()
            if outcome == "fullscreen":
                # Browser fullscreen is real; only the OS rotation result was stubbed.
                game.locator("#open-arenas").tap()
                game.locator("#open-raid").tap()
                page.wait_for_url("**/*play=run-and-raid*")
                game.wait_for_url("**/*play=run-and-raid*")
                game.locator("#start").tap(timeout=90000)
                game.locator(".raid-pause").tap()
                game.locator(".raid-panel button:visible").first.tap()
                game.locator(".raid-pause").tap()
                assert page.evaluate("document.fullscreenElement === document.documentElement && lockCalls.length === 2")
                # Re-enter on an explicit resume tap if the system dropped fullscreen.
                page.evaluate("document.exitFullscreen()")
                game.locator(".raid-panel button:visible").first.tap()
                page.wait_for_function("document.fullscreenElement === document.documentElement && lockCalls.length === 3")
                # A foreground notification may renew the lock without another fullscreen prompt.
                page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
                page.wait_for_function("lockCalls.length === 4 && lockCalls[3][1]")
                game.locator(".raid-pause").tap()
                game.locator(".raid-panel button").last.tap()
                page.wait_for_url(lambda url: "play=" not in url)
                expect(game.locator("#open-arenas")).to_be_visible()
                assert page.evaluate("document.fullscreenElement === document.documentElement && lockCalls.length === 4")
                assert "play=" not in page.url
                page.go_back()
                expect(game.locator(".raid-setup")).to_be_visible(timeout=90000)
                assert "play=run-and-raid" in page.url
                page.go_forward()
                page.wait_for_url(lambda url: "play=" not in url)
                expect(game.locator("#open-arenas")).to_be_visible()
                assert page.evaluate("document.fullscreenElement === document.documentElement")
        finally:
            context.close()
    print("Orientation: fullscreen survived entry, pause/resume, menu return and history; denied and unsupported fallback passed")


def test_chase(browser, url, width, height, lang, *, target_wagon=False):
    context = browser.new_context(viewport={"width": width, "height": height}, is_mobile=True, has_touch=True)
    try:
        page = context.new_page()
        if lang == "en":
            page.goto(f"{url.rstrip('/')}/?lang={lang}")
            game = game_frame(page)
            game.locator("#open-arenas").tap()
            game.locator("#open-raid").tap()
            page.wait_for_url("**/*play=run-and-raid*")
        else:
            page.goto(f"{url.rstrip('/')}/?play=run-and-raid&lang={lang}")
            game = game_frame(page)
        start = game.locator("#start")
        expect(start).to_be_enabled(timeout=90000)
        expect(start).to_be_in_viewport(ratio=1)
        # Resolve each cast in the opening formation, before the allied bot attacks.
        epoch = datetime(2025, 1, 1, tzinfo=timezone.utc)
        page.clock.install(time=epoch)
        page.clock.pause_at(epoch + timedelta(seconds=10))
        start.tap()
        page.clock.run_for(64)
        hud = game.locator(".raid-hud")
        expect(hud).to_be_visible()
        pad = hud.locator(".touch-pad")
        field = hud.locator("[data-skill=field]")
        jump = hud.locator(".raid-jump")
        expect(hud.locator("kbd").first).to_be_hidden()
        for control in [jump, hud.locator(".raid-pause"), hud.locator(".raid-vitals button"), *hud.locator("[data-skill]").all()]:
            p = center(control)
            assert control.evaluate("(el,p) => el.contains(document.elementFromPoint(p.x,p.y))", p)
        expect(pad).to_be_hidden()
        fury = hud.locator("[data-skill=fury]")
        expect(fury.locator("small")).to_have_text("0%")
        expect(fury).to_be_disabled()
        expect(fury).to_have_css("--rage-fill", "0%")
        joystick = {"x": width * .27, "y": height * .64}
        touch = touch_sender(context, page)
        lock = hud.locator(".raid-vitals button")
        wagon_lock = lock.inner_text()
        if target_wagon:
            lock.tap()
            expect(lock).not_to_have_text(wagon_lock)
        bolt = hud.locator("[data-skill=bolt]")
        trackpad = hud.locator(".raid-aim-pad")
        cursor = hud.locator(".raid-aim-cursor")
        def snapshot():
            return game.evaluate("window.__ROOM_DEMO__.snapshot().raid")

        def steer_from(point):
            touch("touchStart", (1, point))
            expect(pad).to_be_visible()
            puck = pad.locator("i").bounding_box()
            assert abs(puck["x"] + puck["width"] / 2 - point["x"]) < 2
            assert abs(puck["y"] + puck["height"] / 2 - point["y"]) < 2
            assert snapshot()["movement"] == {"side": 0, "walk": False}

        def aim(control, dx, dy, *, valid=True):
            selection = center(control)
            before = snapshot()
            touch("touchStart", (1, joystick), (2, selection))
            touch("touchEnd", (2, selection))
            expect(trackpad).to_be_visible()
            expect(control).to_be_enabled()
            assert snapshot() == before
            box = trackpad.bounding_box()
            assert width / 2 <= box["x"] and box["x"] + box["width"] < width
            assert 0 < box["y"] and box["y"] + box["height"] < height
            gain = min(width / box["width"], height / box["height"])
            origin = {"x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"] / 2}
            touch("touchStart", (1, joystick), (2, origin))
            end = {"x": origin["x"] + height * dx / gain, "y": origin["y"] + height * dy / gain}
            assert width / 2 < end["x"] < width and 0 < end["y"] < height
            touch("touchMove", (1, joystick), (2, end))
            # A native touchmove can be coalesced until the next browser frame.
            game.wait_for_function("""([x,y]) => {
                const r = document.querySelector('.raid-aim-cursor').getBoundingClientRect();
                return Math.abs(r.x + r.width / 2 - x) < 3 && Math.abs(r.y + r.height / 2 - y) < 3;
            }""", arg=[width / 2 + height * dx, height / 2 + height * dy], polling=10)
            assert ("valid" in cursor.get_attribute("class").split()) == valid
            expect(pad).to_have_class("touch-pad held")
            expect(control).to_be_enabled()
            return end

        origin = {"x": width * .12, "y": height * .49}
        steer_from(origin)
        touch("touchMove", (1, {"x": origin["x"] + 30, "y": origin["y"]}))
        game.wait_for_function("window.__ROOM_DEMO__.snapshot().raid.movement.side === 1", polling=10)
        touch("touchEnd")
        expect(pad).to_be_hidden()
        steer_from(joystick)
        joystick = {"x": joystick["x"] - 28, "y": joystick["y"] + 25}
        touch("touchMove", (1, joystick))
        game.wait_for_function("""() => {
            const {side,walk} = window.__ROOM_DEMO__.snapshot().raid.movement;
            return side === -1 && walk;
        }""", polling=10)
        # Screen offsets from the central cursor to Longshot's torso or the wagon bed.
        bolt_offset = (.012, -.070) if target_wagon else (.170, .190)
        # The first patch covers Longshot alone; the second lies between both rivals.
        field_offset = (.024, .158) if target_wagon else (.265, .318)
        initial = snapshot()
        previous_lock = lock.inner_text()
        for control, offset in [(bolt, bolt_offset), (field, field_offset)]:
            sky = aim(control, -.30, -.44, valid=False)
            touch("touchEnd", (2, sky))
            expect(trackpad).to_be_hidden()
            expect(control).to_be_enabled()
            aim(control, *offset)
            cancel = center(hud.locator(".raid-aim-cancel"))
            touch("touchMove", (1, joystick), (2, cancel))
            touch("touchEnd", (2, cancel))
            expect(trackpad).to_be_hidden()
            expect(control).to_be_enabled()
            expect(control.locator("small")).to_be_empty()
            expect(lock).to_have_text(previous_lock)
        page.clock.run_for(32)
        assert snapshot()["health"] == initial["health"] and snapshot()["damage"] == initial["damage"]

        target = aim(bolt, *bolt_offset)
        touch("touchEnd", (2, target))
        expect(trackpad).to_be_hidden()
        expect(bolt).to_be_disabled()
        expect(bolt.locator("small")).to_have_text(re.compile(r"\d+s"))
        page.clock.run_for(48)
        after_bolt = snapshot()
        if target_wagon:
            expect(lock).to_have_text(wagon_lock)
            assert after_bolt["health"][2:] == initial["health"][2:]
        else:
            expect(lock).to_contain_text("롱샷" if lang == "ko" else "Longshot")
            assert after_bolt["health"][2:] == [initial["health"][2] - 36, initial["health"][3]]
        assert after_bolt["damage"][0] - initial["damage"][0] == (36 if target_wagon else 0)

        ground = aim(field, *field_offset)
        touch("touchEnd", (2, ground))
        expect(trackpad).to_be_hidden()
        expect(field).to_be_disabled()
        expect(field.locator("small")).to_have_text(re.compile(r"\d+s"))
        page.clock.run_for(48)
        after_field = snapshot()
        assert after_field["health"][2] == after_bolt["health"][2] - 36
        assert after_bolt["health"][3] - after_field["health"][3] == (0 if target_wagon else 36)
        assert after_field["damage"][0] == after_bolt["damage"][0]
        touch("touchEnd")
        expect(pad).to_be_hidden()
        assert snapshot()["movement"] == {"side": 0, "walk": False}
        page.clock.resume()
        jump.tap()
        touch("touchStart", (1, joystick))
        touch("touchCancel")
        expect(pad).to_be_hidden()
        page.set_viewport_size({"width": height, "height": width})
        expect(game.locator("dialog[open]").first).to_be_visible()
        page.set_viewport_size({"width": width, "height": height})
        panel = game.locator(".raid-panel")
        expect(panel).to_be_visible()
        panel.locator("button:visible").first.tap()
        expect(hud).to_be_visible()
        print(f"{width}x{height} {lang}: rival HP {initial['health'][2:]} -> Bolt {after_bolt['health'][2:]} -> Ground strike {after_field['health'][2:]}; wagon damage {after_field['damage'][0]}, both cancels passed")
    finally:
        context.close()


def test_compact_gate(browser, url):
    page = browser.new_page(viewport={"width": 667, "height": 292}, is_mobile=True, has_touch=True)
    try:
        page.goto(f"{url.rstrip('/')}/?lang=ko")
        game = game_frame(page)
        start = game.locator("#start")
        expect(start).to_be_enabled()
        gate = game.locator("#viewport-limit")
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
        game = game_frame(page)
        game.locator("#start").tap(timeout=120000)
        if mode == "chapter":
            game.locator("#prologue [data-skip]").tap()
        expect(game.locator("#game")).to_have_attribute("data-input", "touch")
        controls = game.locator(".player-touch")
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
            game.locator("[data-slot]").nth(1).tap()
            game.wait_for_function("window.__ROOM_DEMO__.snapshot().weapon.state === 'ready'")
        snap = "window.__ROOM_DEMO__.snapshot()"
        before = game.evaluate(f"{snap}.position")
        look = {"x": width / 2, "y": height * 0.46}
        assert game.evaluate("p => document.elementFromPoint(p.x,p.y)?.id", look) == "game"
        yaw = game.evaluate(f"{snap}.yaw")
        touch("touchStart", (1, stick))
        touch("touchStart", (1, stick), (2, look))
        look["x"] += 28
        touch("touchMove", (1, stick), (2, look))
        touch("touchEnd", (2, look))
        game.wait_for_function(f"p => Math.hypot(...{snap}.position.map((n,i)=>n-p[i])) > 0.12", arg=before)
        assert abs(game.evaluate(f"{snap}.yaw") - yaw) > 0.01
        fire = center(trigger)
        touch("touchStart", (1, stick), (2, fire))
        expect(trigger).to_have_class("held")
        touch("touchEnd", (1, stick))
        expect(trigger).to_have_class("held")
        if mode == "chapter":
            game.wait_for_function(f"{snap}.weapon.drawing")
        fire["x"] -= 18
        touch("touchMove", (2, fire))
        touch("touchEnd", (2, fire))
        if mode == "chapter":
            game.wait_for_function(f"!{snap}.weapon.drawing")
        game.locator("#help").tap()
        expect(controls).to_be_hidden()
        game.locator("#start").tap()
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
            test_chase(browser, sys.argv[1], 480, 216, "en", target_wagon=True)
            for game in ["chapter", "arena"]:
                test_player(browser, sys.argv[1], game, 480, 216)
        if "raid" in modes:
            test_chase(browser, sys.argv[1], 568, 320, "en", target_wagon=True)
            test_chase(browser, sys.argv[1], 844, 390, "ko")
        for mode in ["chapter", "arena"]:
            if mode in modes:
                test_player(browser, sys.argv[1], mode)
        browser.close()

# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.50,<2"]
# ///
"""Run against a game server: uv run tools/touch-acceptance.py URL [orientation|compact|raid|raid-layout|chapter|arena]."""
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


def test_raid_heroes(browser, url):
    # Cast both aimed skills before the first bot turn. At this aspect the point
    # on the road at the flanking runner's feet is visible for all four loadouts.
    for hero, power, field in [
        ("hammer", 12, "지반 균열"), ("abyss", 10, "암흑 소용돌이"),
        ("longshot", 8, "화살비"), ("jade", 10, "치유의 숲"),
    ]:
        ctx = browser.new_context(viewport={"width": 1100, "height": 660})
        try:
            page = ctx.new_page()
            page.goto(f"{url.rstrip('/')}/?play=run-and-raid")
            start = page.locator("#start")
            expect(start).to_be_enabled(timeout=90000)
            page.locator(".raid-setup select").select_option(hero)
            epoch = datetime(2025, 1, 1, tzinfo=timezone.utc)
            page.clock.install(time=epoch)
            page.clock.pause_at(epoch + timedelta(seconds=10))
            start.click()
            page.clock.run_for(48)
            snapshot = "window.__ROOM_DEMO__.snapshot().raid"
            before = page.evaluate(snapshot)
            expect(page.locator("[data-skill=field] span")).to_have_text(field)
            page.keyboard.press("2")
            page.keyboard.press("3")
            # Hammer's radius reaches the rival from just inside the left steering region.
            page.mouse.click(535 if hero == "hammer" else 727, 506)
            page.clock.run_for(32)
            after = page.evaluate(snapshot)
            assert after["health"][2] == before["health"][2] - 3 * power
            assert after["damage"][0] == before["damage"][0] + 3 * power
            expect(page.locator("[data-skill=field]")).to_be_disabled()
            print(f"{hero}: target and ground casts resolved")
        finally:
            ctx.close()


def test_raid_render_resize(browser, url):
    ctx = browser.new_context(viewport={"width": 1280, "height": 720})
    try:
        page = ctx.new_page()
        # Hold a real model request so the viewport changes between engine and course creation.
        held = []
        page.route("**/assets/raid/hammer.glb", lambda route: held.append(route))
        with page.expect_request("**/assets/raid/hammer.glb", timeout=90000):
            page.goto(f"{url.rstrip('/')}/?play=run-and-raid", wait_until="domcontentloaded")
        page.set_viewport_size({"width": 844, "height": 390})
        page.wait_for_function("document.querySelector('#game').clientWidth === 844")
        held[0].continue_()
        start = page.locator("#start")
        expect(start).to_be_enabled(timeout=90000)
        start.click()
        for width, height in [(844, 390), (1024, 768), (1920, 720)]:
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_function("""([w,h]) => {
                const canvas = document.querySelector('#game');
                const box = canvas.getBoundingClientRect();
                const gl = canvas.getContext('webgl2');
                const [, , vw, vh] = gl.getParameter(gl.VIEWPORT);
                return box.width === w && box.height === h && gl.drawingBufferWidth === vw &&
                    gl.drawingBufferHeight === vh && Math.abs(vw * h / (vh * w) - 1) < .002;
            }""", arg=[width, height])
        print("The scene keeps its proportions when resized during model loading and during play")
    finally:
        ctx.close()


def test_raid_mouse(browser, url):
    width, height = 1280, 720
    ctx = browser.new_context(viewport={"width": width, "height": height}, has_touch=False)
    try:
        page = ctx.new_page()
        page.goto(f"{url.rstrip('/')}/?play=run-and-raid")
        start = page.locator("#start")
        expect(start).to_be_enabled(timeout=90000)
        epoch = datetime(2025, 1, 1, tzinfo=timezone.utc)
        page.clock.install(time=epoch)
        page.clock.pause_at(epoch + timedelta(seconds=10))
        start.click()
        page.clock.run_for(48)
        hud = page.locator(".raid-hud")
        jump = hud.locator(".raid-jump")
        bolt = hud.locator("[data-skill=bolt]")
        field = hud.locator("[data-skill=field]")
        for button in [jump, *hud.locator("[data-skill]").all()]:
            expect(button).to_have_css("border-radius", "50%")
            point = center(button)
            assert point["x"] > width / 2 and point["y"] > height / 2
        stick = hud.locator(".touch-pad")
        expect(stick).to_be_hidden()
        def snapshot():
            return page.evaluate("window.__ROOM_DEMO__.snapshot().raid")
        page.mouse.move(240, 420)
        page.mouse.down()
        expect(stick).to_be_visible()
        box = stick.bounding_box()
        travel_x, travel_y = box["width"] * .38, box["height"] * .54
        for side, brake in [(.25, 0), (-.5, .25), (0, .75), (0, 1)]:
            page.mouse.move(240 + side * travel_x, 420 + brake * travel_y)
            movement = snapshot()["movement"]
            assert abs(movement["side"] - side) < .03 and abs(movement["brake"] - brake) < .03, movement
        page.mouse.move(240 + 2 * travel_x, 420 + 2 * travel_y)
        movement = snapshot()["movement"]
        assert abs(movement["side"] - 2**-.5) < .02 and abs(movement["brake"] - 2**-.5) < .02
        page.keyboard.down("s")
        assert snapshot()["movement"]["brake"] == 1
        page.mouse.up()
        expect(stick).to_be_hidden()
        assert snapshot()["movement"] == {"side": 0, "brake": 1}
        page.keyboard.up("s")
        assert snapshot()["movement"] == {"side": 0, "brake": 0}

        pad = hud.locator(".raid-aim-pad")
        cursor = hud.locator(".raid-aim-cursor")
        def aim(button, dx, dy, *, ready=True):
            button.click()
            expect(pad).to_be_visible()
            expect(button).to_be_enabled()
            box = pad.bounding_box()
            assert box["x"] > width / 2
            gain = min(width / box["width"], height / box["height"])
            p = center(pad)
            page.mouse.move(p["x"], p["y"])
            page.mouse.down()
            page.mouse.move(p["x"] + height * dx / gain, p["y"] + height * dy / gain)
            if ready:
                expect(cursor).to_have_class(re.compile(r"\bvalid\b"))
                expect(pad).to_contain_text("시전 가능")
            else:
                expect(cursor).not_to_have_class(re.compile(r"\bvalid\b"))
                expect(pad).to_contain_text("사거리 밖")
            expect(button).to_be_enabled()

        before = snapshot()
        aim(field, 0, -.15, ready=False)
        page.mouse.up()
        expect(field).to_be_enabled()
        assert snapshot() == before
        # The cursor is just beyond the right edge of the wagon, inside the assist disc.
        aim(bolt, .18, -.070)
        expect(pad).to_contain_text("마차")
        expect(pad).to_contain_text("/ 16 m")
        cancel = center(hud.locator(".raid-aim-cancel"))
        page.mouse.move(cancel["x"], cancel["y"])
        page.mouse.up()
        expect(pad).to_be_hidden()
        expect(bolt).to_be_enabled()
        aim(bolt, .18, -.070)
        page.mouse.up()
        expect(bolt).to_be_disabled()
        aim(field, .106, .159)
        expect(pad).to_contain_text("적중 대상 1개")
        expect(pad).to_contain_text("반경 4.1 m")
        page.mouse.up()
        expect(field).to_be_disabled()
        expect(pad).to_be_hidden()
        page.clock.run_for(32)
        after = snapshot()
        assert after["damage"][0] - before["damage"][0] == 36
        assert after["health"][2:] == [before["health"][2] - 36, before["health"][3]]
        pulse = hud.locator("[data-skill=pulse]")
        pulse.click()
        expect(pad).to_contain_text("사거리 3.5 m")
        expect(cursor).to_be_hidden()
        expect(pulse).to_be_enabled()
        pad.click()
        expect(pulse).to_be_disabled()
        original = bolt.bounding_box()["width"]
        hud.locator(".raid-pause").click()
        slider = page.locator(".raid-panel").get_by_role("slider")
        slider.focus()
        slider.press("End")
        expect(slider).to_have_value("140")
        page.locator(".raid-panel button:visible").first.click()
        assert bolt.bounding_box()["width"] > original
        print("1280x720 mouse: circular HUD, floating stick, targeting and ground casts on release, cancel and skill sizing passed")
    finally:
        ctx.close()


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
            page.goto(f"{url.rstrip('/')}/?play=run-and-raid")
            game = game_frame(page)
        expect(game.locator("html")).to_have_attribute("lang", lang)
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
        original_jump = jump.bounding_box()["width"]
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
        # A skill lock may select both the flanking Longshot and Jade behind the runner.
        lock.tap()
        expect(lock).to_contain_text("롱샷" if lang == "ko" else "Longshot")
        lock.tap()
        expect(lock).to_contain_text("제이드" if lang == "ko" else "Jade")
        lock.tap()
        expect(lock).to_have_text(wagon_lock)
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
            assert snapshot()["movement"] == {"side": 0, "brake": 0}

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
            if control == field and valid:
                expect(trackpad).to_contain_text("4.1 m")
            expect(pad).to_have_class("touch-pad held")
            expect(control).to_be_enabled()
            return end

        origin = {"x": width * .12, "y": height * .49}
        steer_from(origin)
        touch("touchMove", (1, {"x": origin["x"] + 30, "y": origin["y"]}))
        game.wait_for_function("""() => {
            const {side, brake} = window.__ROOM_DEMO__.snapshot().raid.movement;
            return side > .35 && side < .6 && brake === 0;
        }""", polling=10)
        touch("touchEnd")
        expect(pad).to_be_hidden()
        steer_from(joystick)
        joystick = {"x": joystick["x"] - 28, "y": joystick["y"] + 25}
        touch("touchMove", (1, joystick))
        game.wait_for_function("""() => {
            const {side, brake} = window.__ROOM_DEMO__.snapshot().raid.movement;
            return side < -.3 && side > -.6 && brake > .4 && brake < .7;
        }""", polling=10)
        # Aim at the wagon ahead or Jade's torso behind the runner.
        bolt_offset = (.075, -.070) if target_wagon else (.502, .285)
        # The first patch covers Longshot alone; the second lies between both rivals.
        field_offset = (.106, .159) if target_wagon else (.374, .322)
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
            expect(lock).to_contain_text("제이드" if lang == "ko" else "Jade")
            assert after_bolt["health"][2:] == [initial["health"][2], initial["health"][3] - 36]
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
        assert snapshot()["movement"] == {"side": 0, "brake": 0}
        if not target_wagon:
            page.clock.run_for(100)
            expect(fury.locator("small")).to_have_text("100%")
            expect(fury).to_be_enabled()
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
        slider = panel.get_by_role("slider")
        expect(slider).to_have_value("100")
        slider_box = slider.bounding_box()
        for expected, offset in [(80, 1), (140, slider_box["width"] - 1)]:
            slider.tap(position={"x": offset, "y": slider_box["height"] / 2})
            expect(slider).to_have_value(str(expected))
            panel.locator("button:visible").first.tap()
            expect(hud).to_be_visible()
            diameter = bolt.bounding_box()["width"]
            if expected == 80:
                smallest = diameter
            else:
                assert diameter > smallest >= 44
            assert abs(jump.bounding_box()["width"] - original_jump) < 1
            for control in [jump, hud.locator(".raid-pause"), lock, *hud.locator("[data-skill]").all()]:
                p = center(control)
                assert control.evaluate("(el,p) => el.contains(document.elementFromPoint(p.x,p.y))", p)
            hud.locator(".raid-pause").tap()
        page.reload()
        game = game_frame(page)
        game.locator("#start").tap(timeout=90000)
        hud = game.locator(".raid-hud")
        panel = game.locator(".raid-panel")
        expect(hud).to_be_visible()
        assert abs(game.locator("[data-skill=bolt]").bounding_box()["width"] - diameter) < 1
        game.locator(".raid-pause").tap()
        expect(panel.get_by_role("slider")).to_have_value("140")
        panel.locator("button:visible").first.tap()
        expect(hud).to_be_visible()
        print(f"{width}x{height} {lang}: rival HP {initial['health'][2:]} -> Bolt {after_bolt['health'][2:]} -> Ground strike {after_field['health'][2:]}; wagon damage {after_field['damage'][0]}, both cancels passed")
    finally:
        context.close()


def test_raid_layout(browser, url, touch, sizes):
    ctx = browser.new_context(viewport={"width": sizes[0][0], "height": sizes[0][1]},
                              is_mobile=touch, has_touch=touch, device_scale_factor=2 if touch else 1)
    try:
        page = ctx.new_page()
        page.goto(f"{url.rstrip('/')}/?play=run-and-raid")
        game = game_frame(page)
        start = game.locator("#start")
        expect(start).to_be_enabled(timeout=90000)
        for width, height in sizes:
            page.set_viewport_size({"width": width, "height": height})
            expect(start).to_be_in_viewport(ratio=1)
            expect(game.locator(".raid-setup select")).to_be_in_viewport(ratio=1)

        epoch = datetime(2025, 1, 1, tzinfo=timezone.utc)
        page.clock.install(time=epoch)
        page.clock.pause_at(epoch + timedelta(seconds=10))
        def activate(button):
            if touch:
                button.tap()
            else:
                button.click()
        activate(start)
        page.clock.run_for(48)
        hud = game.locator(".raid-hud")
        panel = game.locator(".raid-panel")
        pause = hud.locator(".raid-pause")
        slider = panel.get_by_role("slider")
        for percent, key in [(100, None), (80, "Home"), (140, "End")]:
            if key:
                activate(pause)
                slider.press(key)
                expect(slider).to_have_value(str(percent))
                activate(panel.locator("button:visible").first)
            for width, height in sizes:
                page.set_viewport_size({"width": width, "height": height})
                # The browser delivers element resize observations after layout.
                game.wait_for_function("""([w,h]) => {
                    const canvas = document.querySelector('#game');
                    const box = canvas.getBoundingClientRect();
                    return box.width === w && box.height === h &&
                        Math.abs(canvas.width * h / (canvas.height * w) - 1) < .002;
                }""", arg=[width, height], polling=10)
                page.clock.run_for(32)
                for aiming in (False, True):
                    if aiming:
                        activate(hud.locator("[data-skill=field]"))
                        expect(hud.locator(".raid-aim-pad"), f"{width}x{height} at {percent}%").to_be_visible()
                    errors = hud.evaluate("""(hud) => {
                        const errors = [];
                        if (document.documentElement.scrollWidth > innerWidth) errors.push('horizontal overflow');
                        const canvas = document.querySelector('#game');
                        const box = canvas.getBoundingClientRect();
                        if (Math.abs(canvas.width * box.height / (canvas.height * box.width) - 1) > .002)
                            errors.push('scene is stretched');
                        for (const b of hud.querySelectorAll('button')) {
                            if (!b.checkVisibility({visibilityProperty: true})) continue;
                            const r = b.getBoundingClientRect();
                            const name = b.getAttribute('aria-label') || b.textContent;
                            if (r.width < 44 || r.height < 44 || r.left < 0 || r.top < 0 ||
                                r.right > innerWidth || r.bottom > innerHeight) errors.push(name + ' bounds');
                            if (b.matches('[data-skill], .raid-jump, .raid-aim-pad') && r.left < innerWidth/2)
                                errors.push(name + ' crosses steering area');
                            for (const [x,y] of [[.5,.5],[.08,.5],[.92,.5],[.5,.08],[.5,.92]]) {
                                const hit = document.elementFromPoint(r.left+x*r.width,r.top+y*r.height);
                                if (!b.contains(hit)) errors.push(name + ' covered by ' + hit?.className);
                            }
                            for (const label of b.querySelectorAll('span, small:not(:empty)')) {
                                const text = document.createRange();
                                text.selectNodeContents(label);
                                for (const line of text.getClientRects())
                                    if (line.left < r.left || line.right > r.right ||
                                        line.top < r.top || line.bottom > r.bottom) errors.push(name + ' clipped text');
                            }
                        }
                        const score = hud.querySelector('.raid-score').getBoundingClientRect();
                        const vitals = hud.querySelector('.raid-vitals').getBoundingClientRect();
                        if (vitals.right > score.left) errors.push('score overlaps health');
                        return errors;
                    }""")
                    assert not errors, (width, height, percent, aiming, errors)
                    if aiming:
                        activate(hud.locator(".raid-aim-cancel"))
                        expect(hud.locator(".raid-aim-pad")).to_be_hidden()
        print(f"Raid HUD {'touch' if touch else 'mouse'}: {sizes} passed at 80%, 100% and 140%, including aim and cancel")
    finally:
        ctx.close()


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
        modes = sys.argv[2:] or ["orientation", "compact", "raid", "raid-layout", "chapter", "arena"]
        if "orientation" in modes:
            test_orientation(browser, sys.argv[1])
        if "compact" in modes:
            test_compact_gate(browser, sys.argv[1])
            test_chase(browser, sys.argv[1], 480, 216, "en", target_wagon=True)
            for game in ["chapter", "arena"]:
                test_player(browser, sys.argv[1], game, 480, 216)
        if "raid" in modes:
            test_raid_render_resize(browser, sys.argv[1])
            test_raid_heroes(browser, sys.argv[1])
            test_raid_mouse(browser, sys.argv[1])
            test_chase(browser, sys.argv[1], 568, 320, "en", target_wagon=True)
            test_chase(browser, sys.argv[1], 844, 390, "ko")
        if "raid-layout" in modes:
            test_raid_layout(browser, sys.argv[1], True, [
                (480, 216), (568, 270), (568, 271), (568, 319), (568, 320),
                (667, 375), (844, 390), (932, 430), (1024, 768),
            ])
            test_raid_layout(browser, sys.argv[1], False, [
                (568, 320), (568, 900), (1280, 720), (1920, 1080), (2560, 1080),
            ])
        for mode in ["chapter", "arena"]:
            if mode in modes:
                test_player(browser, sys.argv[1], mode)
        browser.close()

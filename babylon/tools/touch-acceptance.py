# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.50,<2"]
# ///
"""Run against a game server: uv run tools/touch-acceptance.py URL [orientation|compact|raid|raid-layout|chapter|arena]."""
from datetime import datetime, timedelta, timezone
import re
import sys
from time import monotonic
from playwright.sync_api import expect, sync_playwright


def center(locator):
    box = locator.bounding_box()
    assert box and min(box["width"], box["height"]) >= 44, (locator, box)
    return {"x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"] / 2}


def game_frame(page):
    page.wait_for_selector('iframe[name="archive-game"], #start:enabled', state="attached", timeout=90000)
    return page.frame(name="archive-game") or page.main_frame


def wait_for_raid_countdown(page, game):
    # Course initialization can schedule engine timers while the test clock is paused.
    deadline = monotonic() + 90
    while not game.evaluate("window.__ROOM_DEMO__.snapshot().started"):
        assert monotonic() < deadline, "Raid course did not open"
        page.clock.run_for(16)


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


def test_raid_countdown(browser, url):
    ctx = browser.new_context(viewport={"width": 844, "height": 390}, is_mobile=True, has_touch=True)
    try:
        page = ctx.new_page()
        model_requests = []
        def serve_model(route):
            name = route.request.url.split("/")[-1]
            model_requests.append(name)
            if name == "hammer.glb" and model_requests.count(name) == 1:
                route.fulfill(status=404, body='Missing model')
            else:
                route.continue_()
        page.route("**/assets/raid/*.glb", serve_model)
        page.goto(f"{url.rstrip('/')}/?play=run-and-raid&lang=ko")
        game = game_frame(page)
        start = game.locator("#start")
        expect(start).to_be_enabled(timeout=90000)
        epoch = datetime(2025, 1, 1, tzinfo=timezone.utc)
        page.clock.install(time=epoch)
        page.clock.pause_at(epoch + timedelta(seconds=10))
        start.tap()
        wait_for_raid_countdown(page, game)
        digit = game.get_by_role("status", name="추격 시작까지 남은 초")
        expect(digit).to_have_text("3")
        expect(digit).to_be_in_viewport(ratio=1)
        snapshot = "window.__ROOM_DEMO__.snapshot().raid"
        formation = game.evaluate(snapshot)
        assert formation["tick"] == 0
        expect(game.locator(".raid-score time")).to_have_text("3:00")
        jump = game.locator(".raid-jump")
        point = center(jump)
        page.touchscreen.tap(point["x"], point["y"])
        page.keyboard.press("2")
        page.keyboard.down("d")
        page.clock.fast_forward(1200)
        expect(digit).to_have_text("2")
        assert game.evaluate(snapshot) == formation

        page.set_viewport_size({"width": 390, "height": 844})
        expect(game.locator("dialog[open]").first).to_be_visible()
        page.clock.fast_forward(5000)
        page.set_viewport_size({"width": 844, "height": 390})
        resume = game.locator(".raid-panel [data-resume-raid]:visible")
        resume.tap()
        expect(digit).to_have_text("2")
        page.clock.fast_forward(1000)
        expect(digit).to_have_text("1")
        page.clock.fast_forward(740)
        expect(digit).to_have_text("1")
        assert game.evaluate(snapshot) == formation
        page.clock.run_for(160)
        expect(digit).to_be_hidden()
        running = game.evaluate(snapshot)
        assert 0 < running["tick"] < 6 and running["movement"] == formation["movement"]
        # The rival crossbow can reach the wagon on the first live tick.
        assert running["damage"] == [0, 8] and running["position"]["height"] == 0
        page.keyboard.up("d")
        jump.tap()
        page.clock.run_for(96)
        assert game.evaluate(snapshot)["position"]["height"] > 0

        game.locator(".raid-pause").tap()
        resume.tap()
        expect(digit).to_be_hidden()
        page.clock.fast_forward(181000)
        with page.expect_response("**/assets/raid/hammer.glb") as retry_model:
            game.get_by_role("button", name="다시 추격").tap()
        assert retry_model.value.ok
        assert sorted(model_requests) == ["abyss.glb", "hammer.glb", "hammer.glb", "jade.glb", "longshot.glb"]
        expect(digit).to_have_text("3")
        assert game.evaluate(snapshot) == formation
        print("Raid starts and retries at 3, preserves the countdown across rotation, and unlocks combat after 1")
    finally:
        ctx.close()


def restart_as_hammer(page):
    page.clock.resume()
    game = page.frame(name="archive-game") or page.main_frame
    lang = game.locator("html").get_attribute("lang")
    game.goto(game.url.split("?")[0] + f"?play=run-and-raid&lang={lang}", wait_until="domcontentloaded")
    start = game.locator("#start")
    expect(start).to_be_enabled(timeout=90000)
    game.locator(".raid-setup select").select_option("hammer")
    now = datetime.fromtimestamp(game.evaluate("Date.now()") / 1000, timezone.utc)
    page.clock.pause_at(now + timedelta(seconds=1))
    start.click()
    wait_for_raid_countdown(page, game)
    page.clock.fast_forward(3000)
    page.clock.run_for(48)
    return game


def test_raid_heroes(browser, url):
    # Cast both aimed skills before the first bot turn. At this aspect the point
    # on the road at the flanking runner's feet is visible for all four loadouts.
    for hero, power, field in [
        ("hammer", 12, "소용돌이"), ("abyss", 10, "암흑 소용돌이"),
        ("longshot", 8, "화살비"), ("jade", 10, "치유의 숲"),
        ("kaiken", 9, "만월"),
    ]:
        mobile = hero == "kaiken"
        viewport = {"width": 844, "height": 390} if mobile else {"width": 1100, "height": 660}
        ctx = browser.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile or hero == "abyss")
        try:
            page = ctx.new_page()
            page.goto(f"{url.rstrip('/')}/?play=run-and-raid")
            game = game_frame(page)
            start = game.locator("#start")
            expect(start).to_be_enabled(timeout=90000)
            selector = game.locator(".raid-setup select")
            selector.select_option(hero)
            reach = {"hammer": 3.1, "abyss": 8, "longshot": 12, "jade": 9, "kaiken": 3.3}[hero]
            expect(selector.locator("option:checked")).to_contain_text(f"평타 사거리 {reach} m")
            epoch = datetime(2025, 1, 1, tzinfo=timezone.utc)
            page.clock.install(time=epoch)
            page.clock.pause_at(epoch + timedelta(seconds=10))
            start.click()
            wait_for_raid_countdown(page, game)
            page.clock.fast_forward(3000)
            page.clock.run_for(48)
            snapshot = "window.__ROOM_DEMO__.snapshot().raid"
            before = game.evaluate(snapshot)
            assert before["damage"][0] == (power if hero == "longshot" else 0), (hero, before)
            expect(game.locator("[data-skill=field] .raid-skill-name")).to_have_text(field)
            if hero == "kaiken":
                # Face backwards with Crescent, then use the instant dash without a movement input.
                game.locator("[data-skill=pulse]").tap()
                origin = center(game.locator(".raid-aim-pad"))
                touch = touch_sender(ctx, page)
                touch("touchStart", (1, origin))
                touch("touchMove", (1, {**origin, "y": origin["y"] + 32}))
                touch("touchEnd")
                before = game.evaluate(snapshot)
                moon = game.locator("[data-skill=field]")
                expect(moon).to_have_accessible_name("만월 · 즉발")
                moon.tap()
                page.clock.run_for(128)
                expect(game.locator(".raid-aim-pad")).to_be_hidden()
                expect(moon).to_have_accessible_name("지금 베기 · 즉발")
                stop = game.evaluate(snapshot)
                elapsed = stop["tick"] - before["tick"]
                assert 0 < elapsed < 18
                ground_dz = stop["position"]["z"] - before["position"]["z"] + elapsed * 6 / 30
                assert abs(ground_dz + 5.5 * elapsed / 18) < 1e-6, (before, stop)
                moon.tap()
                page.clock.run_for(64)
                expect(moon).to_be_disabled()
                spin = game.evaluate(snapshot)
                elapsed = spin["tick"] - stop["tick"]
                assert 0 < elapsed < 16
                assert abs(spin["position"]["z"] + elapsed * 6 / 30 - stop["position"]["z"]) < 1e-6
                assert spin["position"]["x"] == stop["position"]["x"]
                continue
            if hero == "hammer":
                # Keyboard aiming also accepts unoccupied ground outside the running lane.
                page.keyboard.press("1")
                page.mouse.move(40, 310)
                expect(game.locator(".raid-hint")).to_contain_text("착지 시 주변 강타")
                expect(game.locator(".raid-hint")).to_contain_text("거리 10.0 / 10 m")
                page.mouse.down()
                assert game.evaluate(snapshot)["position"] == before["position"]
                page.mouse.up()
                page.clock.run_for(240)
                assert game.evaluate(snapshot)["position"]["height"] > 2
                page.clock.run_for(288)
                landing = game.evaluate(snapshot)
                assert landing["position"]["height"] == 0 and landing["position"]["x"] < -7
                # The road advances 3 m during the half-second leap. Allow one running tick after landing.
                distance = ((landing["position"]["x"] - before["position"]["x"]) ** 2 +
                            (landing["position"]["z"] + 3 - before["position"]["z"]) ** 2) ** .5
                assert abs(distance - 10) < .25, (after, landing)
                assert landing["health"][2:] == before["health"][2:]
                page.clock.run_for(160)
                expect(game.locator(".raid-skill-meta b")).to_have_text(["조준", "즉발", "즉발", "조준"])
                for key in ["bolt", "field"]:
                    btn = game.locator(f"[data-skill={key}]")
                    btn.click()
                    expect(btn).to_be_disabled()
                    expect(game.locator(".raid-aim-pad")).to_be_hidden()
                continue
            first_kind = "즉발" if hero == "abyss" else "조준"
            expect(game.locator(".raid-skill-meta b")).to_have_text([first_kind, "조준", "조준", "조준"])
            if hero == "jade":
                button = game.locator("[data-skill=bolt]")
                button.click()
                pad = game.locator(".raid-aim-pad")
                cursor = game.locator(".raid-aim-cursor")
                point = center(pad)
                stick = game.locator(".raid-aim-stick")
                expect(stick).to_be_hidden()
                expect(cursor).to_be_hidden()
                expect(pad).to_contain_text("발사 방향을 정하세요")
                pad.click()
                expect(button).to_be_enabled()
                button.click()
                page.mouse.move(point["x"], point["y"])
                page.mouse.down()
                expect(stick).to_have_css("border-radius", "50%")
                box = stick.bounding_box()
                assert abs(box["width"] - box["height"]) < 1
                assert center(stick) == point
                for dx, dy in [(-.4, .1), (.064, -.4)]:
                    page.mouse.move(point["x"] + box["width"] * dx, point["y"] + box["height"] * dy)
                    expect(pad).to_contain_text("조준한 방향으로 발사")
                    expect(pad).to_contain_text("사거리 16 m")
                    expect(pad).not_to_contain_text("마차")
                    expect(cursor).not_to_have_class(re.compile(r"\bvalid\b"))
                    expect(button).to_be_enabled()
                page.mouse.up()
                expect(button).to_be_disabled()
            else:
                page.keyboard.press("2")
                bolt = game.locator("[data-skill=bolt]")
                expect(bolt).to_be_enabled()
                page.mouse.move(600, 284)
                expect(game.locator(".raid-hint")).to_contain_text("시전 가능 · 마차")
                page.mouse.down()
                expect(bolt).to_be_enabled()
                page.mouse.up()
                expect(bolt).to_be_disabled()
            page.keyboard.press("3")
            if hero == "jade":
                # These pixels project onto the road plane outside the lane, then through the wagon.
                hint = game.locator(".raid-hint")
                page.mouse.move(964, 404)
                expect(game.locator("#game")).to_have_css("cursor", "none")
                expect(hint).to_contain_text("시전 가능")
                page.mouse.move(585, 290)
                expect(hint).to_contain_text("거리 15.0 / 15 m")
                expect(hint).to_contain_text("시전 가능")
                page.mouse.move(593, 323)
                expect(hint).to_contain_text("시전 가능")
                expect(hint).to_contain_text(re.compile(r"거리 1[23]\.\d / 15 m"))
                page.mouse.click(593, 323)
                expect(game.locator("#game")).not_to_have_css("cursor", "none")
            else:
                page.mouse.click(727, 506)
            page.clock.run_for(32)
            after = game.evaluate(snapshot)
            assert after["damage"][0] == before["damage"][0] + 3 * power, (hero, after)
            if hero == "jade":
                assert after["health"][2] == before["health"][2]
                page.clock.run_for(800)
                assert game.evaluate(snapshot)["damage"][0] >= after["damage"][0] + 3 * power
            else:
                assert after["health"][2] == before["health"][2] - 3 * power
            expect(game.locator("[data-skill=field]")).to_be_disabled()
            if hero == "abyss":
                pulse = game.locator("[data-skill=pulse]")
                expect(pulse).to_have_accessible_name("공허 파동 · 즉발")
                p = center(pulse)
                touch = touch_sender(ctx, page)
                touch("touchStart", (1, p))
                touch("touchCancel")
                expect(pulse).to_be_enabled()
                touch("touchStart", (1, p))
                expect(pulse).to_be_enabled()
                expect(game.locator(".raid-aim-pad")).to_be_hidden()
                touch("touchEnd")
                expect(pulse).to_be_disabled()
                expect(game.locator(".raid-aim-pad")).to_be_hidden()
            elif hero == "jade":
                ward = game.locator("[data-skill=pulse]")
                ward.click()
                point = center(pad)
                box = pad.bounding_box()
                assert box["width"] > box["height"]
                gain = min(1100 / box["width"], 660 / box["height"])
                page.mouse.move(point["x"], point["y"])
                page.mouse.down()
                page.mouse.move(point["x"], point["y"] + 660 * .20 / gain)
                expect(pad).to_contain_text("시전 가능 · 제이드")
                page.mouse.move(point["x"] - 660 * .35 / gain, point["y"] - 660 * .28 / gain)
                expect(pad).to_contain_text("표적을 조준하세요")
                page.mouse.up()
                expect(ward).to_be_enabled()
            print(f"{hero}: target and ground casts resolved")
        finally:
            ctx.close()


def test_raid_direction_stick(browser, url):
    ctx = browser.new_context(viewport={"width": 480, "height": 216}, is_mobile=True, has_touch=True)
    try:
        page = ctx.new_page()
        page.goto(f"{url.rstrip('/')}/?play=run-and-raid&lang=ko")
        game = game_frame(page)
        start = game.locator("#start")
        expect(start).to_be_enabled(timeout=90000)
        game.locator(".raid-setup select").select_option("longshot")
        epoch = datetime(2025, 1, 1, tzinfo=timezone.utc)
        page.clock.install(time=epoch)
        page.clock.pause_at(epoch + timedelta(seconds=10))
        start.tap()
        wait_for_raid_countdown(page, game)
        page.clock.fast_forward(3000)
        page.clock.run_for(64)
        shot = game.locator("[data-skill=pulse]")
        expect(shot).to_have_accessible_name("산탄 사격 · 조준")
        shot.tap()
        pad = game.locator(".raid-aim-pad")
        stick = game.locator(".raid-aim-stick")
        expect(stick).to_be_hidden()
        expect(game.locator(".raid-aim-cursor")).to_be_hidden()
        origin = {"x": 276, "y": 155}
        touch = touch_sender(ctx, page)
        touch("touchStart", (1, origin))
        expect(stick).to_be_visible()
        assert center(stick) == origin
        expect(pad).to_contain_text("발사 방향을 정하세요")
        for dx in [-24, 24]:
            touch("touchMove", (1, {"x": origin["x"] + dx, "y": origin["y"]}))
            page.clock.run_for(32)
            expect(pad).to_contain_text("조준한 방향으로 발사")
            offset = stick.evaluate("b => parseFloat(b.style.getPropertyValue('--thumb-x'))")
            assert offset * dx > 0
        touch("touchMove", (1, origin))
        expect(pad).to_contain_text("발사 방향을 정하세요")
        touch("touchEnd")
        expect(stick).to_be_hidden()
        expect(shot).to_be_enabled()
        shot.tap()
        origin = {"x": 450, "y": 175}
        touch("touchStart", (1, origin))
        assert center(stick) == origin
        touch("touchCancel")
        expect(pad).to_be_hidden()
        expect(shot).to_be_enabled()
        shot.tap()
        touch("touchStart", (1, origin))
        touch("touchMove", (1, center(game.locator(".raid-aim-cancel"))))
        touch("touchEnd")
        expect(shot).to_be_enabled()
        shot.tap()
        left = {"x": 110, "y": 165}
        end = {"x": origin["x"], "y": origin["y"] - 24}
        touch("touchStart", (1, left))
        touch("touchStart", (1, left), (2, origin))
        touch("touchMove", (1, left), (2, end))
        expect(shot).to_be_enabled()
        touch("touchEnd", (2, end))
        expect(shot).to_be_disabled()
        expect(game.locator(".touch-pad")).to_have_class("touch-pad held")
        touch("touchEnd")
        expect(shot.locator(".raid-skill-meta b")).to_have_text("조준")
        print("480x216: right stick anchors to each touch, reverses, cancels and fires on release")
    finally:
        ctx.close()


def test_raid_render_resize(browser, url):
    ctx = browser.new_context(viewport={"width": 1280, "height": 720})
    try:
        page = ctx.new_page()
        models = []
        held = []
        page.on("request", lambda request: models.append(request.url.split("/")[-1])
                if "/assets/raid/" in request.url and request.url.endswith(".glb") else None)
        page.route("**/assets/raid/hammer.glb", lambda route: held.append(route))
        page.goto(f"{url.rstrip('/')}/?play=run-and-raid")
        start = page.locator("#start")
        expect(start).to_be_enabled(timeout=90000)
        assert not models, models
        start.click()
        page.wait_for_function("window.__ROOM_DEMO__.snapshot().raid.tick > 0", timeout=90000)
        assert held and sorted(models) == ["abyss.glb", "hammer.glb", "jade.glb", "longshot.glb"], models
        page.set_viewport_size({"width": 844, "height": 390})
        page.wait_for_function("document.querySelector('#game').clientWidth === 844")
        held[0].continue_()
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


def test_raid_respawn(browser, url, width, height, lang, *, touch):
    ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=touch,
                              has_touch=touch, reduced_motion="reduce")
    try:
        page = ctx.new_page()
        page.goto(f"{url.rstrip('/')}/?play=run-and-raid&lang={lang}")
        game = game_frame(page)
        start = game.locator("#start")
        expect(start).to_be_enabled(timeout=90000)
        epoch = datetime(2025, 1, 1, tzinfo=timezone.utc)
        page.clock.install(time=epoch)
        page.clock.pause_at(epoch + timedelta(seconds=10))
        def activate(control):
            if touch:
                control.tap()
            else:
                control.click()
        game.locator(".raid-setup select").select_option("rime")
        activate(start)
        wait_for_raid_countdown(page, game)
        page.clock.fast_forward(3000)
        page.clock.run_for(64)
        canvas = game.locator("#game")
        banner = game.locator(".raid-respawn")
        enemies = game.locator(".raid-enemy-respawns")
        expect(banner).to_be_hidden()
        expect(enemies).to_be_hidden()
        expect(canvas).to_have_css("filter", "none")

        # Only the local runner's death should affect the view, in either knockout order.
        saw_ally_fall = False
        for _ in range(120):
            page.clock.fast_forward(200)
            hp = game.evaluate("window.__ROOM_DEMO__.snapshot().raid.health")
            if hp[0] == 0:
                break
            if hp[1] == 0:
                expect(banner).to_be_hidden()
                expect(canvas).to_have_css("filter", "none")
                saw_ally_fall = True
        assert hp[0] == 0, hp
        expect(banner).to_be_in_viewport(ratio=1)
        expect(banner).to_contain_text("전사했습니다" if lang == "ko" else "You were defeated")
        expect(canvas).to_have_css("filter", re.compile(r"grayscale\(0\.\d+\)"))
        def countdown(seconds):
            return f"{seconds}초 후 부활" if lang == "ko" else f"Respawn in {seconds}s"
        expect(banner).to_contain_text(countdown(8))
        activate(game.locator(".raid-pause"))
        expect(banner).to_be_hidden()
        page.clock.fast_forward(6000)
        activate(game.locator(".raid-panel [data-resume-raid]:visible").first)
        expect(banner).to_contain_text(countdown(8))
        for seconds in range(7, 0, -1):
            page.clock.fast_forward(1000)
            expect(banner).to_contain_text(countdown(seconds))
        page.clock.fast_forward(1000)
        expect(banner).to_be_hidden()
        expect(canvas).to_have_css("filter", "none")
        assert game.evaluate("window.__ROOM_DEMO__.snapshot().raid.health[0]") > 0
        # Track the two enemy lives independently, including their overlapping knockouts.
        for _ in range(40):
            if all(game.evaluate("window.__ROOM_DEMO__.snapshot().raid.health.slice(2)")):
                break
            page.clock.fast_forward(250)
        expect(enemies).to_be_hidden()
        names = ["어비스", "롱샷"] if lang == "ko" else ["Abyss", "Longshot"]
        seen = set()
        previous = {}
        saw_both = False
        saw_separate_times = False
        for _ in range(100):
            page.clock.fast_forward(500)
            health = game.evaluate("window.__ROOM_DEMO__.snapshot().raid.health")
            if health[0] > 0 and health[1] == 0:
                expect(banner).to_be_hidden()
                expect(canvas).to_have_css("filter", "none")
                saw_ally_fall = True
            dead = [i for i, hp in enumerate(health[2:]) if hp == 0]
            for team, fallen in [("blue", len(dead)), ("red", health[:2].count(0))]:
                bonus = game.locator(f".raid-team.{team} .raid-boss-bonus")
                assert bonus.is_visible() == bool(fallen)
                if fallen:
                    label = "보스 피해" if lang == "ko" else "Boss DMG"
                    expect(bonus).to_have_text(f"{label} +{fallen * 15}%")
            assert enemies.is_visible() == bool(dead)
            rows = enemies.get_by_role("listitem").all_text_contents()
            assert len(rows) == len(dead), (rows, health)
            current = {}
            for i, row in zip(dead, rows):
                label = re.fullmatch(rf"{names[i]} (\d+){'초' if lang == 'ko' else 's'}", row)
                assert label, row
                seconds = int(label[1])
                assert 1 <= seconds <= 8
                if i in previous:
                    assert previous[i] - seconds in (0, 1), (previous, row)
                else:
                    assert seconds == 8, row
                current[i] = seconds
            if len(dead) == 2:
                saw_separate_times |= current[0] != current[1]
            if len(dead) == 2 and not saw_both:
                expect(enemies.get_by_text("적 부활 대기" if lang == "ko" else "Enemy respawn")).to_be_visible()
                expect(enemies).to_be_in_viewport(ratio=1)
                box = enemies.bounding_box()
                score = game.locator(".raid-score").bounding_box()
                pause = game.locator(".raid-pause").bounding_box()
                assert score["x"] + score["width"] <= box["x"] and box["x"] + box["width"] <= pause["x"], (score, box, pause)
                orders = game.locator(".raid-orders").bounding_box()
                assert (orders["x"] + orders["width"] <= score["x"] or
                        score["x"] + score["width"] <= orders["x"] or
                        score["y"] + score["height"] <= orders["y"]), (score, orders)
                assert (box["x"] + box["width"] <= orders["x"] or
                        orders["x"] + orders["width"] <= box["x"] or
                        box["y"] + box["height"] <= orders["y"]), (box, orders)
                saw_both = True
            seen.add(tuple(dead))
            previous = current
            if saw_separate_times and saw_ally_fall and not dead:
                break
        assert saw_ally_fall
        assert saw_both and saw_separate_times and not previous and seen == {(), (0,), (0, 1), (1,)}, seen
        print(f"{width}x{height}: local respawn and both enemy countdowns through separate returns passed")
    finally:
        ctx.close()


def test_raid_target_leaves_cursor(browser, url):
    width, height = 1280, 720
    ctx = browser.new_context(viewport={"width": width, "height": height})
    try:
        page = ctx.new_page()
        page.goto(f"{url.rstrip('/')}/?play=run-and-raid")
        start = page.locator("#start")
        expect(start).to_be_enabled(timeout=90000)
        page.locator(".raid-setup select").select_option("abyss")
        epoch = datetime(2025, 1, 1, tzinfo=timezone.utc)
        page.clock.install(time=epoch)
        page.clock.pause_at(epoch + timedelta(seconds=10))
        start.click()
        wait_for_raid_countdown(page, page)
        page.clock.fast_forward(3000)
        page.clock.run_for(48)
        bolt = page.locator("[data-skill=bolt]")
        bolt.click()
        pad = page.locator(".raid-aim-pad")
        cursor = page.locator(".raid-aim-cursor")
        box = pad.bounding_box()
        p = center(pad)
        gain = min(width / box["width"], height / box["height"])
        page.mouse.move(p["x"], p["y"])
        page.mouse.down()
        page.mouse.move(p["x"] + height * .502 / gain, p["y"] + height * .285 / gain)
        expect(pad).to_contain_text("시전 가능 · 제이드")
        held = cursor.bounding_box()
        page.clock.run_for(650)
        expect(pad).to_contain_text("표적을 조준하세요")
        assert cursor.bounding_box() == held
        before = page.evaluate("window.__ROOM_DEMO__.snapshot().raid")
        page.mouse.up()
        expect(pad).to_be_hidden()
        expect(bolt).to_be_enabled()
        assert page.evaluate("window.__ROOM_DEMO__.snapshot().raid") == before
        print("A moving rival leaves a stationary cursor and release spends no cooldown")
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
        page.locator(".raid-setup select").select_option("abyss")
        epoch = datetime(2025, 1, 1, tzinfo=timezone.utc)
        page.clock.install(time=epoch)
        page.clock.pause_at(epoch + timedelta(seconds=10))
        start.click()
        wait_for_raid_countdown(page, page)
        page.clock.fast_forward(3000)
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
        def aim(button, dx, dy):
            button.click()
            expect(pad).to_be_visible()
            expect(button).to_be_enabled()
            box = pad.bounding_box()
            assert box["x"] > width / 2
            gain = min(width / box["width"], height / box["height"])
            p = center(pad)
            page.mouse.move(p["x"], p["y"])
            page.mouse.down()
            start = center(cursor)
            end = (p["x"] + (width / 2 + height * dx - start["x"]) / gain,
                   p["y"] + (height / 2 + height * dy - start["y"]) / gain)
            page.mouse.move(*end)
            expect(cursor).to_have_class(re.compile(r"\bvalid\b"))
            expect(pad).to_contain_text("떼면 도약" if button.get_attribute("data-skill") == "pulse" else "시전 가능")
            expect(button).to_be_enabled()
            return end

        before = snapshot()
        end = aim(field, 0, -.30)
        expect(pad).to_contain_text("거리 15.0 / 15 m")
        rim = center(cursor)
        assert rim["y"] > height * .20 + 10
        page.mouse.move(end[0], end[1] - 12)
        assert abs(center(cursor)["y"] - rim["y"]) < 1
        page.mouse.move(end[0], end[1] - 10)
        assert center(cursor)["y"] > rim["y"] + 3
        expect(pad).not_to_contain_text("거리 15.0 / 15 m")
        cancel = center(hud.locator(".raid-aim-cancel"))
        page.mouse.move(cancel["x"], cancel["y"])
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
        expect(pad).to_contain_text("반경 4.8 m")
        page.mouse.up()
        expect(field).to_be_disabled()
        expect(pad).to_be_hidden()
        page.clock.run_for(32)
        after = snapshot()
        assert after["damage"][0] - before["damage"][0] == 30
        assert after["health"][2:] == [before["health"][2] - 30, before["health"][3]]
        restart_as_hammer(page)
        pulse = hud.locator("[data-skill=pulse]")
        expect(pulse).to_have_accessible_name("도약 강타 · 조준")
        before_jump = snapshot()
        aim(pulse, .194, .122)
        expect(pad).to_contain_text("반경 3.5 m")
        assert snapshot() == before_jump
        page.mouse.up()
        expect(pulse).to_be_disabled()
        page.clock.run_for(240)
        apex = snapshot()
        assert apex["position"]["height"] > 2 and apex["position"]["x"] > before_jump["position"]["x"]
        assert apex["health"][2] == before_jump["health"][2]
        page.clock.run_for(272)
        landed = snapshot()
        assert landed["position"]["height"] == 0 and landed["position"]["x"] > apex["position"]["x"]
        assert landed["health"][2] == apex["health"][2] - 24
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
        game.locator(".raid-setup select").select_option("abyss")
        epoch = datetime(2025, 1, 1, tzinfo=timezone.utc)
        page.clock.install(time=epoch)
        page.clock.pause_at(epoch + timedelta(seconds=10))
        start.tap()
        wait_for_raid_countdown(page, game)
        page.clock.fast_forward(3000)
        page.clock.run_for(64)
        hud = game.locator(".raid-hud")
        expect(hud).to_be_visible()
        pad = hud.locator(".touch-pad")
        field = hud.locator("[data-skill=field]")
        jump = hud.locator(".raid-jump")
        original_jump = jump.bounding_box()["width"]
        expect(hud.locator("kbd").first).to_be_hidden()
        for control in [jump, hud.locator(".raid-pause"), *hud.locator(".raid-orders button, [data-skill]").all()]:
            p = center(control)
            assert control.evaluate("(el,p) => el.contains(document.elementFromPoint(p.x,p.y))", p)
        expect(pad).to_be_hidden()
        fury = hud.locator("[data-skill=fury]")
        expect(fury.locator("small")).to_have_text("0%")
        expect(fury).to_be_disabled()
        expect(fury).to_have_css("--rage-fill", "0%")
        joystick = {"x": width * .27, "y": height * .64}
        touch = touch_sender(context, page)
        lock = hud.get_by_role("button", name=re.compile("^평타 표적" if lang == "ko" else "^Basic target"))
        wagon_lock = lock.inner_text()
        # The basic attack preference is independent of the target under the skill cursor.
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

        def aim(control, dx, dy, *, valid=True, rim=False):
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
            start = center(cursor)
            end = {"x": origin["x"] + (width / 2 + height * dx - start["x"]) / gain,
                   "y": origin["y"] + (height / 2 + height * dy - start["y"]) / gain}
            assert width / 2 < end["x"] < width and 0 < end["y"] < height
            touch("touchMove", (1, joystick), (2, end))
            # A native touchmove can be coalesced until the next browser frame.
            if rim:
                expect(trackpad).to_contain_text("15.0 / 15 m")
                assert center(cursor)["y"] > height / 2 + height * dy + 5
            else:
                game.wait_for_function("""([x,y]) => {
                    const r = document.querySelector('.raid-aim-cursor').getBoundingClientRect();
                    return Math.abs(r.x + r.width / 2 - x) < 3 && Math.abs(r.y + r.height / 2 - y) < 3;
                }""", arg=[width / 2 + height * dx, height / 2 + height * dy], polling=10)
            assert ("valid" in cursor.get_attribute("class").split()) == valid
            if control == field and valid:
                expect(trackpad).to_contain_text("4.8 m")
            expect(pad).to_have_class("touch-pad held")
            expect(control).to_be_enabled()
            return end

        origin = {"x": width * .18, "y": height * .75}
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
        sky = aim(bolt, -.30, -.44, valid=False)
        touch("touchEnd", (2, sky))
        expect(trackpad).to_be_hidden()
        expect(bolt).to_be_enabled()
        for control in [bolt, field]:
            if control == field:
                aim(field, -.30, -.44, rim=True)
            else:
                aim(control, *bolt_offset)
            cancel = center(hud.locator(".raid-aim-cancel"))
            touch("touchMove", (1, joystick), (2, cancel))
            touch("touchEnd", (2, cancel))
            expect(trackpad).to_be_hidden()
            expect(control).to_be_enabled()
            expect(control.locator("small")).to_be_empty()
            expect(lock).to_have_text(previous_lock)
        page.clock.run_for(32)
        assert snapshot()["health"] == initial["health"] and snapshot()["damage"] == initial["damage"]

        aim(bolt, *bolt_offset)
        origin = center(trackpad)
        box = trackpad.bounding_box()
        gain = min(width / box["width"], height / box["height"])
        sky = {"x": origin["x"] - .30 * height / gain, "y": origin["y"] - .32 * height / gain}
        touch("touchMove", (1, joystick), (2, sky))
        expect(trackpad).to_contain_text("표적을 조준하세요" if lang == "ko" else "Aim at a target")
        touch("touchEnd", (2, sky))
        expect(bolt).to_be_enabled()
        expect(lock).to_have_text(previous_lock)
        assert snapshot()["health"] == initial["health"] and snapshot()["damage"] == initial["damage"]

        target = aim(bolt, *bolt_offset)
        touch("touchEnd", (2, target))
        expect(trackpad).to_be_hidden()
        expect(bolt).to_be_disabled()
        expect(bolt.locator("small")).to_have_text(re.compile(r"\d+s"))
        page.clock.run_for(48)
        after_bolt = snapshot()
        expect(lock).to_have_text(previous_lock)
        if target_wagon:
            assert after_bolt["health"][2:] == initial["health"][2:]
        else:
            assert after_bolt["health"][2:] == [initial["health"][2], initial["health"][3] - 30]
        assert after_bolt["damage"][0] - initial["damage"][0] == (30 if target_wagon else 0)

        ground = aim(field, *field_offset)
        touch("touchEnd", (2, ground))
        expect(trackpad).to_be_hidden()
        expect(field).to_be_disabled()
        expect(field.locator("small")).to_have_text(re.compile(r"\d+s"))
        page.clock.run_for(48)
        after_field = snapshot()
        assert after_field["health"][2] == after_bolt["health"][2] - 30
        assert after_bolt["health"][3] - after_field["health"][3] == (0 if target_wagon else 30)
        assert after_field["damage"][0] == after_bolt["damage"][0]
        touch("touchEnd")
        hud.locator("[data-skill=pulse]").tap()
        if not target_wagon:
            page.clock.run_for(100)
            expect(fury.locator("small")).to_have_text("100%")
            expect(fury).to_be_enabled()
        game = restart_as_hammer(page)
        hud = game.locator(".raid-hud")
        joystick = origin = {"x": width * .27, "y": height * .64}
        steer_from(joystick)
        leap_start = snapshot()
        pulse = hud.locator("[data-skill=pulse]")
        end = aim(pulse, .194, .122)
        expect(trackpad).to_contain_text("착지 시 주변 강타" if lang == "ko" else "slam on landing")
        assert snapshot()["position"] == leap_start["position"]
        touch("touchEnd", (2, end))
        expect(trackpad).to_be_hidden()
        expect(pulse).to_be_disabled()
        page.clock.run_for(240)
        airborne = snapshot()
        assert airborne["position"]["height"] > 2 and airborne["health"][2] == leap_start["health"][2]
        page.clock.run_for(288)
        landed = snapshot()
        assert landed["position"]["height"] == 0 and landed["position"]["x"] > airborne["position"]["x"]
        assert landed["health"][2] == airborne["health"][2] - 24
        touch("touchEnd")
        expect(pad).to_be_hidden()
        assert snapshot()["movement"] == {"side": 0, "brake": 0}
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
        wait_for_raid_countdown(page, game)
        page.clock.fast_forward(3000)
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
                        activate(hud.locator("[data-skill=pulse]"))
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
                            for (const label of b.querySelectorAll('span, .raid-skill-meta b, small:not(:empty)')) {
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
            test_raid_countdown(browser, sys.argv[1])
            test_raid_respawn(browser, sys.argv[1], 480, 216, "ko", touch=True)
            test_raid_respawn(browser, sys.argv[1], 480, 216, "en", touch=True)
            test_raid_respawn(browser, sys.argv[1], 1280, 720, "en", touch=False)
            test_raid_render_resize(browser, sys.argv[1])
            test_raid_heroes(browser, sys.argv[1])
            test_raid_direction_stick(browser, sys.argv[1])
            test_raid_mouse(browser, sys.argv[1])
            test_raid_target_leaves_cursor(browser, sys.argv[1])
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

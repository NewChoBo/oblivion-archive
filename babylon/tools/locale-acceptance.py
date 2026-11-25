# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.50,<2"]
# ///
"""Run against a game server with: uv run tools/locale-acceptance.py http://localhost:5173/"""

import argparse
import re
from dataclasses import dataclass
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from playwright.sync_api import Page, Route, expect, sync_playwright


TITLES = {"en": "Oblivion Archive", "ko": "망각의 서재"}


@dataclass(frozen=True)
class ChapterCopy:
    mode: str
    progress: str
    heading: str
    objective: str
    interaction: str
    minimap: str


CHAPTER = {
    "en": ChapterCopy("Deathmatch", "Chapter 1 · 1 / 5", "The Missing Face",
                      "Examine the faded photograph on the central reading desk.", "E interact", "Minimap."),
    "ko": ChapterCopy("데스매치", "제1장 · 1 / 5", "사진에서 지워진 사람",
                      "중앙 기록대의 빛바랜 사진을 조사하세요.", "E 상호작용", "미니맵."),
}


def title_url(url: str, language: str | None = None) -> str:
    parts = urlsplit(url)
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True)
             if key not in {"lang", "play", "mode", "level"}]
    if language is not None:
        query.append(("lang", language))
    return urlunsplit(parts._replace(query=urlencode(query)))


def check_title(page: Page, language: str) -> None:
    expect(page.locator("html")).to_have_attribute("lang", language)
    expect(page.get_by_role("heading", level=1)).to_have_text(TITLES[language])
    expect(page).to_have_title(re.compile("^" + re.escape(TITLES[language])))
    expect(page.locator("#settings-open")).to_be_visible()


def open_settings(page: Page, language: str) -> None:
    page.locator("#settings-open").click()
    field = page.locator("#game-language")
    expect(field).to_be_visible()
    expect(field).to_have_accessible_name(re.compile("Language" if language == "en" else "언어"))
    expect(field).to_have_value(language)


def choose_language(page: Page, current: str, desired: str) -> None:
    open_settings(page, current)
    page.locator("#game-language").select_option(desired)
    check_title(page, desired)


def check_missing_translation(page: Page, home: str) -> None:
    # Simulate a newly added English shell message with no Korean translation for one response.
    # The surrounding page and the bootstrap are the server's own production code.
    def english_only_heading(route: Route) -> None:
        response = route.fetch()
        html = response.text()
        marker = 'data-msg="title.name"'
        assert html.count(marker) == 1, "Expected a single translatable title in the shell"
        route.fulfill(response=response, body=html.replace(marker, 'data-msg="qa.english-only"'))

    url = title_url(home, "ko")
    request_url = urlsplit(url)._replace(fragment="").geturl()
    page.route(re.compile("^" + re.escape(request_url) + "$"), english_only_heading, times=1)
    page.goto(url)
    expect(page.locator("html")).to_have_attribute("lang", "ko")
    expect(page).to_have_title(re.compile("^" + TITLES["ko"]))
    expect(page.locator("#title-name")).to_have_text(TITLES["en"])
    print("PASS Korean shell retains English for a missing translation", flush=True)


def check_preferences(page: Page, home: str) -> None:
    page.goto(home)
    assert page.evaluate("navigator.language") == "ko-KR"
    check_title(page, "en")
    choose_language(page, "en", "ko")

    # A new tab without a URL override must read the preference chosen in the first tab.
    fresh = page.context.new_page()
    try:
        fresh.goto(home)
        check_title(fresh, "ko")
        open_settings(fresh, "ko")

        # An unsupported shared URL uses English for that visit and preserves the saved Korean choice.
        fresh.goto(title_url(home, "fr-FR"))
        check_title(fresh, "en")
        open_settings(fresh, "en")
        fresh.goto(home)
        check_title(fresh, "ko")
        choose_language(fresh, "ko", "en")
    finally:
        fresh.close()

    page.goto(home)
    check_title(page, "en")
    open_settings(page, "en")
    page.locator("#settings-back").click()
    print("PASS English default with ko-KR browser, Korean and English persistence, unsupported URL fallback", flush=True)


def check_chapter(page: Page, home: str, language: str) -> None:
    # A shared regional Korean URL overrides the saved English preference across play navigation.
    url = title_url(home, "ko-KR") if language == "ko" else home
    page.goto(url)
    check_title(page, language)
    copy = CHAPTER[language]
    page.locator("#open-arenas").click()
    choice = page.locator("#experience-choices [data-experience=deathmatch]")
    expect(choice).to_have_text(copy.mode)
    choice.click()
    expect(page.locator("#experience-name")).to_have_text(copy.mode)
    page.locator("#back-to-modes").click()
    expect(choice).to_be_focused()
    page.locator("#back-to-title").click()
    expect(page.locator("#open-arenas")).to_be_focused()

    page.locator("#start").click()
    page.wait_for_url(lambda address: dict(parse_qsl(urlsplit(address).query)).get("play") == "chapter")
    play_params = parse_qsl(urlsplit(page.url).query, keep_blank_values=True)
    assert all(pair in play_params for pair in parse_qsl(urlsplit(url).query, keep_blank_values=True))
    expect(page.locator("html")).to_have_attribute("lang", language)
    page.locator("#start").click(timeout=120_000)
    page.locator("#prologue [data-skip]").click()
    page.wait_for_function("window.__ROOM_DEMO__?.snapshot().started === true")
    expect(page.locator("#objective")).to_be_visible()
    expect(page.locator("#objective")).to_have_attribute("aria-live", "polite")
    expect(page.locator("#progress")).to_have_text(copy.progress)
    expect(page.locator("#step-title")).to_have_text(copy.heading)
    expect(page.locator("#step-text")).to_have_text(copy.objective)
    expect(page.locator("#game")).to_have_accessible_name(re.compile(re.escape(copy.interaction)))
    expect(page.locator('#minimap canvas[role="img"]')).to_have_accessible_name(re.compile("^" + re.escape(copy.minimap)))
    print(f"PASS {language} mode choice, chapter progress, objective and accessible game controls", flush=True)

    page.keyboard.press("Escape")
    open_settings(page, language)
    desired = "ko" if language == "en" else "en"
    expect(page.locator("#game-language-detail")).to_be_visible()
    snapshot = "() => {const s=window.__ROOM_DEMO__.snapshot(); return [s.started,s.paused,s.phase,s.position]}"
    before = page.evaluate(snapshot)
    page.locator("#game-language").select_option(desired)
    expect(page.locator("#game-language")).to_have_value(desired)
    assert dict(parse_qsl(urlsplit(page.url).query))["lang"] == desired
    assert page.evaluate(snapshot) == before
    page.locator("#settings-back").click()
    page.locator("#return-title").click()
    check_title(page, desired)
    page.goto(home)
    check_title(page, desired)
    print(f"PASS paused {language} chapter preserved and {desired} persisted on fresh launch", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="Title URL of a running development or production server")
    parser.add_argument("--channel", default="chrome", help="Installed Playwright browser channel, e.g. chrome or msedge")
    parser.add_argument("--title-only", action="store_true", help="Run just the language bootstrap and settings checks")
    args = parser.parse_args()
    home = title_url(args.url)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel=args.channel, args=["--enable-unsafe-swiftshader"])
        try:
            # Nonpersistent context. No settings, saves or cookies from a normal browser profile are used.
            with browser.new_context(locale="ko-KR", viewport={"width": 1280, "height": 720}) as context:
                page = context.new_page()
                check_preferences(page, home)
                check_missing_translation(page, home)
                if not args.title_only:
                    for language in ("ko", "en"):
                        check_chapter(page, home, language)
        finally:
            browser.close()


if __name__ == "__main__":
    main()

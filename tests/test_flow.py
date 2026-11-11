#!/usr/bin/env python3
"""Playwright smoke test of the main flow. Usage: python3 tests/test_flow.py [base_url] [screenshot_dir]
Fails on any console error, page error or failed request. Takes desktop and phone screenshots."""
import sys, os, re
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
OUT = sys.argv[2] if len(sys.argv) > 2 else "tests/screens"
os.makedirs(OUT, exist_ok=True)
problems = []


def run(page, tag):
    page.on("console", lambda m: problems.append(f"{tag} console {m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: problems.append(f"{tag} pageerror: {e}"))
    page.on("requestfailed", lambda r: problems.append(f"{tag} request failed: {r.url}"))
    page.on("response", lambda r: problems.append(f"{tag} HTTP {r.status}: {r.url}") if r.status >= 400 else None)
    page.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, content_type="text/css", body=""))  # web font is optional
    page.goto(BASE, wait_until="networkidle")
    assert "Synthetic data only" in page.inner_text(".banner")
    page.wait_for_selector("#start-provider")
    page.screenshot(path=f"{OUT}/{tag}_1_start.png", full_page=True)
    # Step 1: provider uploads, reviews the diff, excludes one item, submits
    page.click("#start-provider")
    page.click("#upload")
    assert page.locator(".card:not(.ai) tbody tr").count() == 12
    page.screenshot(path=f"{OUT}/{tag}_2_provider_diff.png", full_page=True)
    page.click("#submit")
    assert "Sent to Synthetic Plan A" in page.inner_text("#view")
    # Step 2: plan queue, filter, open, approve, edit, reject
    page.click("#to-queue")
    assert page.inner_text(".tile .v") == "48"
    page.select_option("#f-type", "ADD")
    assert page.locator("#qbody tr").count() >= 3
    page.select_option("#f-type", "")
    page.fill("#f-q", "zzzz-no-match")
    assert "No changes match" in page.inner_text("#qbody")
    page.fill("#f-q", "")
    page.click("#needs")
    pending = page.locator("#qbody tr").count()
    assert pending == 16, pending
    page.click("#open-SYN-C-009")
    assert "Low confidence" in page.inner_text("#detail")
    page.screenshot(path=f"{OUT}/{tag}_3_review_detail.png", full_page=True)
    page.click("#approve")
    assert "Approved as submitted" in page.inner_text("#detail")
    page.click("#close")
    page.click("#open-SYN-C-011")
    page.click("#edit")
    page.fill("#editval", "31 Example Row, Suite 4, Sampletown ZZ 00017")
    page.click("#saveedit")
    assert "Edited value" in page.inner_text("#detail")
    page.click("#close")
    page.click("#open-SYN-C-003")
    page.click("#reject")
    page.click("#savereject")
    assert "Rejected: Failed licence" in page.inner_text("#detail")
    # keyboard: Enter on a focused button opens a record
    page.click("#close")
    page.focus("#open-SYN-C-010")
    page.keyboard.press("Enter")
    assert "Duplicate match" in page.inner_text("#detail")
    # Step 3: outcomes update
    page.click("#nav-outcomes")
    txt = page.inner_text("#view")
    assert "32 of 48" in txt and "Rejected: Failed licence" in txt, txt[:400]
    page.screenshot(path=f"{OUT}/{tag}_4_outcomes.png", full_page=True)
    page.click("#nav-how")
    assert "What this prototype proves" in page.inner_text("#view")
    # Reset returns to the seeded state
    page.click("#reset")
    page.click("#nav-queue")
    assert page.inner_text(".tile .v") == "36"
    # tabs, rollback of an applied change, roster on demand
    page.click("#tab-auto_applied")
    page.locator("#qbody button").first.click()
    page.click("#rollback")
    assert "Rolled back to the previous version" in page.inner_text("#detail")
    page.click("#nav-roster")
    page.fill("#r-q", "Northfield")
    assert page.locator("#rbody tr").count() >= 28
    page.click("#nav-queue")
    # no horizontal page scroll
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "horizontal overflow"


with sync_playwright() as p:
    b = p.chromium.launch()
    for tag, vp in (("desktop", {"width": 1280, "height": 800}), ("phone", {"width": 390, "height": 844})):
        ctx = b.new_context(viewport=vp)  # fresh context = no cookies, no storage, like a private window
        run(ctx.new_page(), tag)
        ctx.close()
    b.close()
if problems:
    print("FAIL"); print("\n".join(problems)); sys.exit(1)
print("PASS: main flow at desktop and phone widths, no console errors, no failed requests")

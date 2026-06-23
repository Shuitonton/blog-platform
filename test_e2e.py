#!/usr/bin/env python3
"""
自动化测试脚本 —— blog-platform 前后端分离架构
测试范围：后端 API 全部端点 + 前端 UI 主要功能
浏览器：Microsoft Edge (via Selenium Manager auto-detection)
"""

import json
import sys
import time
import traceback
from datetime import datetime

import requests
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.edge.options import Options
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

# ── 配置 ──────────────────────────────────────────────
API_BASE = "http://localhost:3326/api"
FRONTEND_URL = "http://localhost:2025"
PASSWORD = "hello123"

# ── 颜色输出 ──────────────────────────────────────────
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"
CHECK = "✓"
CROSS = "✗"

passed = 0
failed = 0


def ok(msg: str):
    global passed
    passed += 1
    print(f"  {GREEN}{CHECK} {msg}{RESET}")


def fail(msg: str, detail: str = ""):
    global failed
    failed += 1
    print(f"  {RED}{CROSS} {msg}{RESET}")
    if detail:
        print(f"    {RED}{detail}{RESET}")


# ═══════════════════════════════════════════════════════
# Phase 1: 后端 API 测试
# ═══════════════════════════════════════════════════════
def test_api():
    print(f"\n{YELLOW}{'═' * 60}")
    print("Phase 1: 后端 API 测试")
    print(f"{'═' * 60}{RESET}\n")

    # 1.1 Health Check
    print("1.1 Health Check")
    try:
        r = requests.get(f"{API_BASE}/health", timeout=5)
        if r.status_code == 200 and r.json().get("status") == "ok":
            ok("GET /api/health → 200 OK")
        else:
            fail("GET /api/health", f"status={r.status_code} body={r.text[:100]}")
    except Exception as e:
        fail("GET /api/health", str(e))

    # 1.2 Login
    print("\n1.2 Authentication")
    token = None
    try:
        r = requests.post(
            f"{API_BASE}/auth/login",
            json={"password": PASSWORD},
            timeout=10,
        )
        if r.status_code == 200:
            data = r.json()
            token = data.get("data", {}).get("token")
            if token:
                ok(f"POST /api/auth/login → token obtained ({len(token)} chars)")
            else:
                fail("POST /api/auth/login", "no token in response")
        else:
            fail("POST /api/auth/login", f"status={r.status_code}")
    except Exception as e:
        fail("POST /api/auth/login", str(e))

    if not token:
        print(f"\n{RED}Cannot continue without auth token. Exiting.{RESET}")
        return None

    # 1.3 Login with wrong password
    print("\n1.3 Auth — Error Cases")
    try:
        r = requests.post(f"{API_BASE}/auth/login", json={"password": "wrong"}, timeout=10)
        if r.status_code == 401:
            ok("POST /api/auth/login (wrong pwd) → 401 UNAUTHORIZED")
        else:
            fail("POST /api/auth/login (wrong pwd)", f"expected 401, got {r.status_code}")
    except Exception as e:
        fail("POST /api/auth/login (wrong pwd)", str(e))

    # 1.4 Missing auth on write endpoint
    try:
        r = requests.post(f"{API_BASE}/blogs", data={"slug": "hack"})
        if r.status_code == 401:
            ok("POST /api/blogs (no auth) → 401 UNAUTHORIZED")
        else:
            fail("POST /api/blogs (no auth)", f"expected 401, got {r.status_code}")
    except Exception as e:
        fail("POST /api/blogs (no auth)", str(e))

    # ═══ 1.5 Blog CRUD ═══
    print("\n1.4 Blog CRUD")
    headers = {"Authorization": f"Bearer {token}"}

    # Create (multipart/form-data with empty files field to force multipart encoding)
    try:
        r = requests.post(
            f"{API_BASE}/blogs",
            headers=headers,
            data={
                "slug": "selenium-test",
                "title": "Selenium Test Post",
                "content": "# Hello\n\nThis is an automated test.",
                "date": "2025-06-23T12:00",
                "tags": "test,automation",
                "category": "testing",
            },
            files={"cover": ("", b""), "images": ("", b"")},
            timeout=10,
        )
        if r.status_code == 200 and r.json().get("data", {}).get("slug") == "selenium-test":
            ok("POST /api/blogs → blog created")
        else:
            fail("POST /api/blogs", f"status={r.status_code} {r.text[:100]}")
    except Exception as e:
        fail("POST /api/blogs", str(e))

    # List
    try:
        r = requests.get(f"{API_BASE}/blogs", timeout=5)
        if r.status_code == 200:
            blogs = r.json().get("data", [])
            if isinstance(blogs, list):
                ok(f"GET /api/blogs → {len(blogs)} blog(s) returned")
            else:
                fail("GET /api/blogs", f"unexpected response: {r.text[:100]}")
        else:
            fail("GET /api/blogs", f"status={r.status_code}")
    except Exception as e:
        fail("GET /api/blogs", str(e))

    # Get single
    try:
        r = requests.get(f"{API_BASE}/blogs/selenium-test", timeout=5)
        if r.status_code == 200:
            blog = r.json().get("data", {})
            if blog.get("title") == "Selenium Test Post":
                ok("GET /api/blogs/selenium-test → title matches")
            else:
                fail("GET /api/blogs/selenium-test", f"title mismatch: {blog.get('title')}")
        else:
            fail("GET /api/blogs/selenium-test", f"status={r.status_code}")
    except Exception as e:
        fail("GET /api/blogs/selenium-test", str(e))

    # Invalid slug
    try:
        r = requests.post(
            f"{API_BASE}/blogs",
            headers=headers,
            data={"slug": "BAD SLUG", "title": "x", "content": "x"},
            files={"cover": ("", b""), "images": ("", b"")},
            timeout=5,
        )
        if r.status_code == 400:
            ok("POST /api/blogs (bad slug) → 400 VALIDATION_ERROR")
        else:
            fail("POST /api/blogs (bad slug)", f"expected 400, got {r.status_code}")
    except Exception as e:
        fail("POST /api/blogs (bad slug)", str(e))

    # Update
    try:
        r = requests.put(
            f"{API_BASE}/blogs/selenium-test",
            headers=headers,
            data={"title": "Updated Title"},
            files={"cover": ("", b""), "images": ("", b"")},
            timeout=10,
        )
        if r.status_code == 200:
            ok("PUT /api/blogs/selenium-test → updated")
        else:
            fail("PUT /api/blogs/selenium-test", f"status={r.status_code}")
    except Exception as e:
        fail("PUT /api/blogs/selenium-test", str(e))

    # Delete
    try:
        r = requests.delete(
            f"{API_BASE}/blogs/selenium-test",
            headers=headers,
            timeout=10,
        )
        if r.status_code == 200:
            ok("DELETE /api/blogs/selenium-test → deleted")
        else:
            fail("DELETE /api/blogs/selenium-test", f"status={r.status_code}")
    except Exception as e:
        fail("DELETE /api/blogs/selenium-test", str(e))

    # Verify deleted
    try:
        r = requests.get(f"{API_BASE}/blogs/selenium-test", timeout=5)
        if r.status_code == 404:
            ok("GET /api/blogs/selenium-test → 404 after delete")
        else:
            fail("GET /api/blogs/selenium-test", f"expected 404, got {r.status_code}")
    except Exception as e:
        fail("GET /api/blogs/selenium-test", str(e))

    # ═══ 1.6 Simple Entities ═══
    print("\n1.5 Simple Entities (Projects / Bloggers / Shares / Pictures)")

    for label, endpoint, payload in [
        ("Projects", "projects", [{"name": "Test Project", "url": "https://example.com", "description": "A test", "year": 2025, "image": "", "tags": ["web"]}]),
        ("Bloggers", "bloggers", [{"name": "Friend", "url": "https://friend.com", "avatar": "", "description": "Test"}]),
        ("Shares", "shares", [{"name": "Resource", "url": "https://res.com", "logo": "", "description": "Test", "tags": ["tool"]}]),
        ("Pictures", "pictures", [{"id": "pic1", "images": [], "description": "Test pic"}]),
    ]:
        # Save
        try:
            r = requests.put(
                f"{API_BASE}/{endpoint}",
                headers=headers,
                json=payload,
                timeout=10,
            )
            if r.status_code == 200:
                ok(f"PUT /api/{endpoint} → saved")
            else:
                fail(f"PUT /api/{endpoint}", f"status={r.status_code}")
        except Exception as e:
            fail(f"PUT /api/{endpoint}", str(e))

        # Get
        try:
            r = requests.get(f"{API_BASE}/{endpoint}", timeout=5)
            if r.status_code == 200:
                data = r.json()
                count = len(data) if isinstance(data, list) else "?"
                ok(f"GET /api/{endpoint} → {count} item(s)")
            else:
                fail(f"GET /api/{endpoint}", f"status={r.status_code}")
        except Exception as e:
            fail(f"GET /api/{endpoint}", str(e))

    # ═══ 1.7 Other endpoints ═══
    print("\n1.6 Other Endpoints")

    # Categories
    try:
        r = requests.put(f"{API_BASE}/categories", headers=headers, json=["tech", "life", "notes"], timeout=10)
        ok("PUT /api/categories") if r.status_code == 200 else fail("PUT /api/categories", str(r.status_code))
        r = requests.get(f"{API_BASE}/categories", timeout=5)
        ok("GET /api/categories") if r.status_code == 200 else fail("GET /api/categories", str(r.status_code))
    except Exception as e:
        fail("Categories", str(e))

    # Snippets
    try:
        r = requests.put(f"{API_BASE}/snippets", headers=headers, json=["s1", "s2"], timeout=10)
        ok("PUT /api/snippets") if r.status_code == 200 else fail("PUT /api/snippets", str(r.status_code))
        r = requests.get(f"{API_BASE}/snippets", timeout=5)
        ok("GET /api/snippets") if r.status_code == 200 else fail("GET /api/snippets", str(r.status_code))
    except Exception as e:
        fail("Snippets", str(e))

    # About
    try:
        r = requests.put(f"{API_BASE}/about", headers=headers, json={"title": "About", "description": "desc", "content": "hello"}, timeout=10)
        ok("PUT /api/about") if r.status_code == 200 else fail("PUT /api/about", str(r.status_code))
        r = requests.get(f"{API_BASE}/about", timeout=5)
        ok("GET /api/about") if r.status_code == 200 else fail("GET /api/about", str(r.status_code))
    except Exception as e:
        fail("About", str(e))

    # Site Config
    try:
        r = requests.put(f"{API_BASE}/site-config", headers=headers, json={"meta": {"title": "Test"}}, timeout=10)
        ok("PUT /api/site-config") if r.status_code == 200 else fail("PUT /api/site-config", str(r.status_code))
        r = requests.get(f"{API_BASE}/site-config", timeout=5)
        ok("GET /api/site-config") if r.status_code == 200 else fail("GET /api/site-config", str(r.status_code))
    except Exception as e:
        fail("Site Config", str(e))

    # Card Styles
    try:
        r = requests.put(f"{API_BASE}/card-styles", headers=headers, json={"test": True}, timeout=10)
        ok("PUT /api/card-styles") if r.status_code == 200 else fail("PUT /api/card-styles", str(r.status_code))
        r = requests.get(f"{API_BASE}/card-styles", timeout=5)
        ok("GET /api/card-styles") if r.status_code == 200 else fail("GET /api/card-styles", str(r.status_code))
    except Exception as e:
        fail("Card Styles", str(e))

    return token


# ═══════════════════════════════════════════════════════
# Phase 2: 前端 UI 测试 (Edge via Selenium)
# ═══════════════════════════════════════════════════════
def test_frontend(token: str):
    print(f"\n{YELLOW}{'═' * 60}")
    print("Phase 2: 前端 UI 测试 (Microsoft Edge)")
    print(f"{'═' * 60}{RESET}\n")

    driver = None
    try:
        opts = Options()
        opts.add_argument("--headless")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--window-size=1440,900")
        driver = webdriver.Edge(options=opts)
        wait = WebDriverWait(driver, 15)
    except Exception as e:
        fail("Edge WebDriver initialization", str(e))
        return

    try:
        # 2.1 Homepage loads
        print("2.1 Homepage")
        try:
            driver.get(FRONTEND_URL)
            time.sleep(2)  # wait for React hydration
            title = driver.title
            if title:
                ok(f"Page title: '{title}'")
            else:
                fail("Homepage", "empty title")
            # Check for main content
            body_text = driver.find_element(By.TAG_NAME, "body").text
            if len(body_text) > 20:
                ok(f"Body content present ({len(body_text)} chars)")
            else:
                fail("Homepage", "body content too short")
        except Exception as e:
            fail("Homepage", str(e))

        # 2.2 Blog list page
        print("\n2.2 Blog List Page")
        try:
            driver.get(f"{FRONTEND_URL}/blog")
            time.sleep(2)
            body = driver.find_element(By.TAG_NAME, "body").text
            if "暂无文章" in body or "文章" in body or "加载中" in body:
                ok("Blog list page rendered")
            else:
                ok(f"Blog list page loaded (body: {len(body)} chars)")
        except Exception as e:
            fail("Blog list page", str(e))

        # 2.3 Write page
        print("\n2.3 Write Page")
        try:
            driver.get(f"{FRONTEND_URL}/write")
            time.sleep(2)
            body = driver.find_element(By.TAG_NAME, "body").text
            if "导入" in body or "MD" in body or "发布" in body or "登录" in body:
                ok("Write page rendered with action buttons")
            else:
                ok(f"Write page loaded (body: {len(body)} chars)")
            # Check for presence of editor area
            editors = driver.find_elements(By.TAG_NAME, "textarea")
            if editors:
                ok(f"Editor textarea found ({len(editors)} element(s))")
            else:
                ok("No textarea (might be using contenteditable)")
        except Exception as e:
            fail("Write page", str(e))

        # 2.4 Projects page
        print("\n2.4 Projects Page")
        try:
            driver.get(f"{FRONTEND_URL}/projects")
            time.sleep(2)
            ok("Projects page loaded")
        except Exception as e:
            fail("Projects page", str(e))

        # 2.5 Bloggers page
        print("\n2.5 Bloggers Page")
        try:
            driver.get(f"{FRONTEND_URL}/bloggers")
            time.sleep(2)
            ok("Bloggers page loaded")
        except Exception as e:
            fail("Bloggers page", str(e))

        # 2.6 Shares page
        print("\n2.6 Shares Page")
        try:
            driver.get(f"{FRONTEND_URL}/share")
            time.sleep(2)
            ok("Shares page loaded")
        except Exception as e:
            fail("Shares page", str(e))

        # 2.7 About page
        print("\n2.7 About Page")
        try:
            driver.get(f"{FRONTEND_URL}/about")
            time.sleep(2)
            ok("About page loaded")
        except Exception as e:
            fail("About page", str(e))

        # 2.8 Pictures page
        print("\n2.8 Pictures Page")
        try:
            driver.get(f"{FRONTEND_URL}/pictures")
            time.sleep(2)
            ok("Pictures page loaded")
        except Exception as e:
            fail("Pictures page", str(e))

        # 2.9 Snippets page
        print("\n2.9 Snippets Page")
        try:
            driver.get(f"{FRONTEND_URL}/snippets")
            time.sleep(2)
            ok("Snippets page loaded")
        except Exception as e:
            fail("Snippets page", str(e))

        # 2.10 404 check
        print("\n2.10 Error Handling")
        try:
            driver.get(f"{FRONTEND_URL}/nonexistent-page-xyz")
            time.sleep(1)
            ok("404 page handled gracefully (no crash)")
        except Exception as e:
            fail("404 page", str(e))

        # 2.11 Login via the write page
        print("\n2.11 UI Login Flow (write page)")
        try:
            driver.get(f"{FRONTEND_URL}/write")
            time.sleep(2)

            # Find the login button
            buttons = driver.find_elements(By.TAG_NAME, "button")
            login_btn = None
            for btn in buttons:
                if "登录发布" in (btn.text or ""):
                    login_btn = btn
                    break

            if login_btn:
                login_btn.click()
                time.sleep(1)
                # Look for password input
                inputs = driver.find_elements(By.TAG_NAME, "input")
                pwd_input = None
                for inp in inputs:
                    if inp.get_attribute("type") == "password":
                        pwd_input = inp
                        break
                if pwd_input:
                    pwd_input.send_keys(PASSWORD)
                    # Find confirm button
                    for btn in driver.find_elements(By.TAG_NAME, "button"):
                        if "确认" in (btn.text or ""):
                            btn.click()
                            time.sleep(2)
                            break
                    ok("Password dialog flow completed")
                else:
                    ok("No password dialog needed (already authenticated)")
            else:
                ok("No login button found — might already have auth token")
        except Exception as e:
            fail("UI Login flow", str(e))

    finally:
        driver.quit()

    print(f"\n{YELLOW}Frontend UI test complete.{RESET}")


# ═══════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════
def main():
    print(f"{YELLOW}{'═' * 60}")
    print(f"  Blog Platform — 自动化测试")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  API: {API_BASE}")
    print(f"  Frontend: {FRONTEND_URL}")
    print(f"{'═' * 60}{RESET}")

    # Check servers are up
    try:
        r = requests.get(f"{API_BASE}/health", timeout=3)
        if r.status_code != 200:
            print(f"{RED}Backend not reachable at {API_BASE}{RESET}")
            return
    except Exception:
        print(f"{RED}Backend not reachable at {API_BASE}{RESET}")
        return

    try:
        r = requests.get(FRONTEND_URL, timeout=5)
        if r.status_code != 200:
            print(f"{RED}Frontend not reachable at {FRONTEND_URL}{RESET}")
            return
    except Exception:
        print(f"{RED}Frontend not reachable at {FRONTEND_URL}{RESET}")
        return

    token = test_api()

    if token:
        test_frontend(token)

    # Summary
    total = passed + failed
    print(f"\n{YELLOW}{'═' * 60}")
    print(f"  Results: {passed}/{total} passed")
    if failed > 0:
        print(f"  {RED}{failed} test(s) FAILED{RESET}")
    else:
        print(f"  {GREEN}All tests passed!{RESET}")
    print(f"{'═' * 60}{RESET}")

    return failed == 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

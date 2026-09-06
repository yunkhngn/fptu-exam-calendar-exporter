const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { isFapSessionCandidate, createFapKeepAlive } = require("../lib/fap-keepalive.js");

describe("FAP Keep-Alive Engine", () => {
  test("isFapSessionCandidate ignores login, logout, and non-FAP pages", () => {
    assert.strictEqual(isFapSessionCandidate("/Default.aspx"), false);
    assert.strictEqual(isFapSessionCandidate("/Logout.aspx"), false);
    assert.strictEqual(isFapSessionCandidate(""), false);
    assert.strictEqual(isFapSessionCandidate("/HomePage.aspx"), true);
    assert.strictEqual(isFapSessionCandidate("/Report/ScheduleOfWeek.aspx"), true);
    assert.strictEqual(isFapSessionCandidate("/Feedback/StudentFeedback.aspx"), true);
  });

  test("ping sends request with credentials and cache: no-store", async () => {
    let calledUrl = null;
    let calledOpts = null;
    const mockFetch = async (url, opts) => {
      calledUrl = url;
      calledOpts = opts;
      return { ok: true, status: 200, redirected: false, url: "https://fap.fpt.edu.vn/HomePage.aspx" };
    };

    const keepAlive = createFapKeepAlive({
      pingUrl: "/HomePage.aspx",
      fetchFn: mockFetch
    });

    const res = await keepAlive.ping();
    assert.strictEqual(res.ok, true);
    assert.strictEqual(calledUrl, "/HomePage.aspx");
    assert.strictEqual(calledOpts.credentials, "include");
    assert.strictEqual(calledOpts.cache, "no-store");
  });

  test("ping stops if response redirects to login page", async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      redirected: true,
      url: "https://fap.fpt.edu.vn/Default.aspx"
    });

    const keepAlive = createFapKeepAlive({
      pingUrl: "/HomePage.aspx",
      fetchFn: mockFetch
    });

    const res = await keepAlive.ping();
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "session-expired");
    assert.strictEqual(keepAlive.getStatus().active, false);
  });

  test("respects fapKeepSessionEnabled storage setting", async () => {
    let fetchCount = 0;
    const mockFetch = async () => {
      fetchCount++;
      return { ok: true, status: 200, redirected: false, url: "https://fap.fpt.edu.vn/HomePage.aspx" };
    };

    const mockStorage = {
      get: (keys, cb) => cb({ fapKeepSessionEnabled: false })
    };

    const keepAlive = createFapKeepAlive({
      storage: mockStorage,
      fetchFn: mockFetch
    });

    const res = await keepAlive.ping();
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "disabled-by-user");
    assert.strictEqual(fetchCount, 0);
  });
});

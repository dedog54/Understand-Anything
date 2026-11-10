import { describe, expect, it } from "vitest";
import { DashboardAccessError, readDashboardGraph, tokenFromInput } from "../accessToken";
import { getDashboardAccessToken } from "../../server/accessToken";

describe("dashboard access recovery", () => {
  it.each([401, 403])("classifies HTTP %i as expired access without parsing it as graph data", async status => {
    await expect(readDashboardGraph({ status, ok: false, json: async () => { throw new Error("must not parse"); } }))
      .rejects.toBeInstanceOf(DashboardAccessError);
  });
  it("preserves non-authentication errors and valid graph payloads", async () => {
    await expect(readDashboardGraph({ status: 404, ok: false, json: async () => ({ error: "No knowledge graph found" }) })).rejects.toThrow("No knowledge graph found");
    const graph = { project: { name: "Example" } };
    await expect(readDashboardGraph({ status: 200, ok: true, json: async () => graph })).resolves.toEqual(graph);
  });
  it("accepts complete access links or tokens and rejects links without tokens", () => {
    expect(tokenFromInput("  abc123  ")).toBe("abc123");
    expect(tokenFromInput("http://127.0.0.1:5173/?token=abc123&onboard=force")).toBe("abc123");
    expect(tokenFromInput("https://example.test/?token=a%2Bb")).toBe("a+b");
    expect(tokenFromInput("http://127.0.0.1:5173/")).toBeNull();
    expect(tokenFromInput(" ")).toBeNull();
  });
});

describe("development service access token", () => {
  it("stays stable across configuration reloads in one process", () => {
    const cache = {};
    const first = getDashboardAccessToken(undefined, cache);
    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(getDashboardAccessToken(undefined, cache)).toBe(first);
  });
  it("uses explicit credentials without overwriting the generated token", () => {
    const cache = {};
    const generated = getDashboardAccessToken(undefined, cache);
    expect(getDashboardAccessToken("explicit-token", cache)).toBe("explicit-token");
    expect(getDashboardAccessToken(undefined, cache)).toBe(generated);
    expect(getDashboardAccessToken(undefined, {})).not.toBe(generated);
  });
});

/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";

describe("Phase 1 control-plane migrations", () => {
  it("creates the control-plane tables and deterministic Spaces", async () => {
    await applyD1Migrations(env.DB, MIGRATIONS);

    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('members', 'spaces', 'collections', 'submissions', 'audit_events') ORDER BY name",
    ).all<{ name: string }>();
    expect(tables.results).toEqual([
      { name: "audit_events" },
      { name: "collections" },
      { name: "members" },
      { name: "spaces" },
      { name: "submissions" },
    ]);

    const spaces = await env.DB.prepare(
      "SELECT slug, kind, read_only FROM spaces ORDER BY slug",
    ).all<{ slug: string; kind: string; read_only: number }>();
    expect(spaces.results).toEqual([
      { slug: "default", kind: "shared", read_only: 0 },
      { slug: "legacy-personal", kind: "legacy", read_only: 1 },
    ]);
  });
});

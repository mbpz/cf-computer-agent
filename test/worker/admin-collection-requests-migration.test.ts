/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, env, reset } from "cloudflare:test";
import { expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";

it("0056 adds receipts without changing existing spaces or collections", async () => {
  await reset();
  const boundary = MIGRATIONS.findIndex(item => item.name === "0056_admin_collection_creation_requests.sql");
  expect(boundary).toBe(55);
  await applyD1Migrations(env.DB, MIGRATIONS.slice(0, boundary));
  await env.DB.prepare("INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at) VALUES ('kept-space', 'kept-space', 'Kept', 'Description', 'shared', 'active', 8, 0, '2026-09-28T00:00:00.000Z', '2026-09-28T00:00:00.001Z')").run();
  await env.DB.prepare("INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) VALUES ('kept-collection', 'kept-space', NULL, 'Kept collection', 'Description', 'disabled', 3, '2026-09-28T00:00:00.000Z', '2026-09-28T00:00:00.002Z')").run();
  const spaces = (await env.DB.prepare("SELECT * FROM spaces ORDER BY id").all()).results;
  const collections = (await env.DB.prepare("SELECT * FROM collections ORDER BY id").all()).results;
  await applyD1Migrations(env.DB, MIGRATIONS);
  expect((await env.DB.prepare("SELECT * FROM spaces ORDER BY id").all()).results).toEqual(spaces);
  expect((await env.DB.prepare("SELECT * FROM collections ORDER BY id").all()).results).toEqual(collections);
  expect((await env.DB.prepare("SELECT * FROM admin_collection_creation_requests").all()).results).toEqual([]);
  expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  await applyD1Migrations(env.DB, MIGRATIONS);
  expect((await env.DB.prepare("SELECT * FROM collections ORDER BY id").all()).results).toEqual(collections);
});

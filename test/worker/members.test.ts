/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MembersRepository } from "../../src/members/repository";
import { MembersService } from "../../src/members/service";
import { MIGRATIONS } from "../fixtures/d1";

describe("members D1 control plane", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
  });

  it("keeps exactly one active admin during concurrent bootstrap logins", async () => {
    const service = () => new MembersService(new MembersRepository(env.DB), {
      BOOTSTRAP_ADMIN_EMAIL: "  BOOTSTRAP@EXAMPLE.TEST ",
    });

    const members = await Promise.all([
      service().resolveFirstLogin({ sub: "first-subject", email: "bootstrap@example.test" }),
      service().resolveFirstLogin({ sub: "second-subject", email: "bootstrap@example.test" }),
    ]);

    expect(members.map((member) => member.role).sort()).toEqual(["admin", "contributor"]);
    const activeAdmins = await env.DB.prepare(
      "SELECT id FROM members WHERE role = 'admin' AND status = 'active'",
    ).all<{ id: string }>();
    expect(activeAdmins.results).toHaveLength(1);
  });

  it("rejects an Access-approved subject after its member record is disabled", async () => {
    const service = new MembersService(new MembersRepository(env.DB), {});
    const created = await service.resolveFirstLogin({ sub: "disabled-subject", email: "disabled@example.test" });
    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = ?").bind(created.id).run();

    await expect(service.resolveFirstLogin({ sub: "disabled-subject", email: "disabled@example.test" }))
      .rejects.toMatchObject({ code: "MEMBER_DISABLED", status: 403 });
  });
});

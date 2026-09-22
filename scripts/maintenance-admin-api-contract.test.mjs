import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const adminRoute = await readFile(new URL("./src/routes/admin.ts", root), "utf8");
const app = await readFile(new URL("./src/app.ts", root), "utf8");
const control = await readFile(new URL("./src/maintenance/control.ts", root), "utf8");
const audit = await readFile(new URL("./src/audit/types.ts", root), "utf8");

test("maintenance control API exposes only the four admin routes", () => {
  for (const path of [
    "/api/admin/maintenance/status",
    "/api/admin/maintenance/capacity",
  ]) assert.match(adminRoute, new RegExp(path.replaceAll("/", "\\/")));
  assert.match(adminRoute, /maintenanceAction = \/\^\\\/api\\\/admin\\\/maintenance/);
  assert.match(adminRoute, /begin-drain\|resume/);
  assert.match(adminRoute, /requireAdminMember\(principal\)/);
  assert.match(adminRoute, /requireSameOrigin\(request, APP_CONFIG\.canonicalOrigin\)/);
  assert.match(adminRoute, /requireNoQuery\(url\)/);
});

test("mutating maintenance controls validate bounded window and epoch and audit success", () => {
  assert.match(adminRoute, /parseMaintenanceControlInput/);
  assert.match(adminRoute, /MAINTENANCE_REQUEST_INVALID/);
  assert.match(adminRoute, /maintenance\.drain_started/);
  assert.match(adminRoute, /maintenance\.resumed/);
  assert.match(adminRoute, /resourceId: "production"/);
});

test("maintenance control never returns or logs the control token", () => {
  assert.match(control, /MAINTENANCE_CONTROL_UNAVAILABLE/);
  assert.doesNotMatch(control, /jsonResponse\([^\n]*controlToken/);
  assert.doesNotMatch(adminRoute, /MAINTENANCE_CONTROL_TOKEN/);
  assert.match(app, /new MaintenanceControlService\(env\.MAINTENANCE\?\.getByName\("production"\), env\.MAINTENANCE_CONTROL_TOKEN\)/);
});

test("maintenance audit actions have strict typed metadata", () => {
  assert.match(audit, /"maintenance\.drain_started"/);
  assert.match(audit, /"maintenance\.resumed"/);
  assert.match(audit, /assertResourceType\(resourceType, "maintenance"\)/);
});

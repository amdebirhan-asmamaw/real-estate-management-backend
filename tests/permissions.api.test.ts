import request from "supertest";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";
import { Permission } from "../src/modules/permissions/permission.model";
import { AuditLog } from "../src/modules/audit/audit.model";
import { PERMISSION_KEYS } from "../src/modules/permissions/permission.constants";

const PASSWORD = "Password123";
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const register = (email: string) =>
  request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Perm User", email, password: PASSWORD, role: "tenant" });

const login = async (email: string) => {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  return res.body.data.tokens.accessToken as string;
};

const makeSuperAdmin = async (email: string) => {
  await register(email);
  await User.updateOne({ email }, { role: "super_admin" });
  return login(email);
};

const makeAdmin = async (email: string) => {
  await register(email);
  await User.updateOne({ email }, { role: "admin" });
  return login(email);
};

describe("Admin permissions", () => {
  it("super_admin creates, lists, updates, and deletes a permission", async () => {
    const superToken = await makeSuperAdmin("perm-super@example.com");

    const created = await request(app)
      .post("/api/v1/admin/permissions")
      .set(bearer(superToken))
      .send({
        key: "reports.export",
        name: "Export reports",
        description: "Download compliance reports",
      });

    expect(created.status).toBe(201);
    expect(created.body.data.key).toBe("reports.export");

    const permissionId = created.body.data.id as string;

    const listed = await request(app)
      .get("/api/v1/admin/permissions?search=reports")
      .set(bearer(superToken));
    expect(listed.status).toBe(200);
    expect(listed.body.data.total).toBeGreaterThanOrEqual(1);

    const updated = await request(app)
      .patch(`/api/v1/admin/permissions/${permissionId}`)
      .set(bearer(superToken))
      .send({ name: "Export platform reports" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe("Export platform reports");

    const removed = await request(app)
      .delete(`/api/v1/admin/permissions/${permissionId}`)
      .set(bearer(superToken));
    expect(removed.status).toBe(200);

    const audit = await AuditLog.find({
      action: {
        $in: [
          "admin.permission_created",
          "admin.permission_updated",
          "admin.permission_deleted",
        ],
      },
    });
    expect(audit.length).toBeGreaterThanOrEqual(3);
  });

  it("super_admin assigns and revokes permissions on an admin user", async () => {
    const superToken = await makeSuperAdmin("perm-assign-super@example.com");
    await makeAdmin("perm-target-admin@example.com");

    const suspendPerm = await Permission.create({
      key: PERMISSION_KEYS.USERS_SUSPEND,
      name: "Suspend users",
      isSystem: true,
    });
    const listPerm = await Permission.create({
      key: PERMISSION_KEYS.USERS_LIST,
      name: "List users",
      isSystem: true,
    });

    const adminUser = await User.findOne({ email: "perm-target-admin@example.com" });

    const assigned = await request(app)
      .post(`/api/v1/admin/admins/${adminUser!._id}/permissions`)
      .set(bearer(superToken))
      .send({ permissionIds: [suspendPerm.id, listPerm.id] });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data).toHaveLength(2);

    const listed = await request(app)
      .get(`/api/v1/admin/admins/${adminUser!._id}/permissions`)
      .set(bearer(superToken));
    expect(listed.status).toBe(200);
    expect(listed.body.data.map((p: { key: string }) => p.key)).toEqual(
      expect.arrayContaining([PERMISSION_KEYS.USERS_SUSPEND, PERMISSION_KEYS.USERS_LIST]),
    );

    const revoked = await request(app)
      .delete(`/api/v1/admin/admins/${adminUser!._id}/permissions`)
      .set(bearer(superToken))
      .send({ permissionIds: [suspendPerm.id] });
    expect(revoked.status).toBe(200);
    expect(revoked.body.data).toHaveLength(1);
    expect(revoked.body.data[0].key).toBe(PERMISSION_KEYS.USERS_LIST);
  });

  it("admin without users.suspend permission cannot suspend users", async () => {
    const superToken = await makeSuperAdmin("perm-gate-super@example.com");
    const adminToken = await makeAdmin("perm-gate-admin@example.com");

    await register("perm-victim@example.com");
    const victim = await User.findOne({ email: "perm-victim@example.com" });

    const suspendPerm = await Permission.create({
      key: PERMISSION_KEYS.USERS_SUSPEND,
      name: "Suspend users",
      isSystem: true,
    });

    const adminUser = await User.findOne({ email: "perm-gate-admin@example.com" });

    const denied = await request(app)
      .post(`/api/v1/admin/users/${victim!._id}/suspend`)
      .set(bearer(adminToken));
    expect(denied.status).toBe(403);

    await request(app)
      .post(`/api/v1/admin/admins/${adminUser!._id}/permissions`)
      .set(bearer(superToken))
      .send({ permissionIds: [suspendPerm.id] })
      .expect(200);

    const allowed = await request(app)
      .post(`/api/v1/admin/users/${victim!._id}/suspend`)
      .set(bearer(adminToken));
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.accountStatus).toBe("suspended");
  });

  it("regular admin cannot create permissions", async () => {
    const adminToken = await makeAdmin("perm-no-create@example.com");

    const res = await request(app)
      .post("/api/v1/admin/permissions")
      .set(bearer(adminToken))
      .send({ key: "hack.access", name: "Hack" });

    expect(res.status).toBe(403);
  });

  it("cannot delete a permission that is still assigned", async () => {
    const superToken = await makeSuperAdmin("perm-delete-super@example.com");
    await makeAdmin("perm-delete-admin@example.com");

    const perm = await Permission.create({
      key: "temp.permission",
      name: "Temporary",
    });
    const adminUser = await User.findOne({ email: "perm-delete-admin@example.com" });
    adminUser!.permissions.push(perm._id);
    await adminUser!.save();

    const res = await request(app)
      .delete(`/api/v1/admin/permissions/${perm.id}`)
      .set(bearer(superToken));

    expect(res.status).toBe(409);
  });
});

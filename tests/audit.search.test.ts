import mongoose from "mongoose";
import * as audit from "../src/modules/audit/audit.service";
import { AuditLog } from "../src/modules/audit/audit.model";

const actor1 = new mongoose.Types.ObjectId().toString();
const actor2 = new mongoose.Types.ObjectId().toString();
const target1 = new mongoose.Types.ObjectId().toString();
const target2 = new mongoose.Types.ObjectId().toString();

/** Seed a known set of audit entries with controlled timestamps. */
const seed = async () => {
  // actor1, listing, Jan 1
  await AuditLog.create({
    actor: actor1,
    actorRole: "admin",
    action: "listing.created",
    targetType: "listing",
    targetId: target1,
    createdAt: new Date("2025-01-01T10:00:00Z"),
  });
  // actor2, listing, Jan 15
  await AuditLog.create({
    actor: actor2,
    actorRole: "property_owner",
    action: "listing.updated",
    targetType: "listing",
    targetId: target1,
    createdAt: new Date("2025-01-15T10:00:00Z"),
  });
  // actor1, compliance, Feb 1
  await AuditLog.create({
    actor: actor1,
    actorRole: "system",
    action: "compliance.case_created",
    targetType: "compliance",
    targetId: target2,
    createdAt: new Date("2025-02-01T10:00:00Z"),
  });
  // actor2, user, Feb 20
  await AuditLog.create({
    actor: actor2,
    actorRole: "admin",
    action: "user.kyc_approved",
    targetType: "user",
    targetId: target2,
    createdAt: new Date("2025-02-20T10:00:00Z"),
  });
};

describe("audit.listAuditLogs — new search filters", () => {
  beforeEach(async () => {
    await seed();
  });

  describe("actor filter", () => {
    it("returns only logs from actor1", async () => {
      const { items, total } = await audit.listAuditLogs({ actor: actor1, page: 1, limit: 50 });
      expect(total).toBe(2);
      items.forEach((item) => expect(item.actor.toString()).toBe(actor1));
    });

    it("returns only logs from actor2", async () => {
      const { items, total } = await audit.listAuditLogs({ actor: actor2, page: 1, limit: 50 });
      expect(total).toBe(2);
      items.forEach((item) => expect(item.actor.toString()).toBe(actor2));
    });
  });

  describe("targetType filter", () => {
    it("returns only compliance logs", async () => {
      const { items, total } = await audit.listAuditLogs({ targetType: "compliance", page: 1, limit: 50 });
      expect(total).toBe(1);
      expect(items[0].targetType).toBe("compliance");
    });

    it("returns only user logs", async () => {
      const { items, total } = await audit.listAuditLogs({ targetType: "user", page: 1, limit: 50 });
      expect(total).toBe(1);
      expect(items[0].targetType).toBe("user");
    });

    it("returns only listing logs", async () => {
      const { items, total } = await audit.listAuditLogs({ targetType: "listing", page: 1, limit: 50 });
      expect(total).toBe(2);
      items.forEach((item) => expect(item.targetType).toBe("listing"));
    });
  });

  describe("date range filter", () => {
    it("from filter returns logs on or after the given date", async () => {
      const { items, total } = await audit.listAuditLogs({
        from: new Date("2025-02-01T00:00:00Z"),
        page: 1,
        limit: 50,
      });
      expect(total).toBe(2);
      items.forEach((item) =>
        expect(item.createdAt.getTime()).toBeGreaterThanOrEqual(
          new Date("2025-02-01T00:00:00Z").getTime(),
        ),
      );
    });

    it("to filter returns logs on or before the given date", async () => {
      const { items, total } = await audit.listAuditLogs({
        to: new Date("2025-01-15T23:59:59Z"),
        page: 1,
        limit: 50,
      });
      expect(total).toBe(2);
      items.forEach((item) =>
        expect(item.createdAt.getTime()).toBeLessThanOrEqual(
          new Date("2025-01-15T23:59:59Z").getTime(),
        ),
      );
    });

    it("from + to range narrows to only matching logs", async () => {
      const { items, total } = await audit.listAuditLogs({
        from: new Date("2025-01-10T00:00:00Z"),
        to: new Date("2025-01-31T23:59:59Z"),
        page: 1,
        limit: 50,
      });
      expect(total).toBe(1);
      expect(items[0].action).toBe("listing.updated");
    });

    it("range that matches nothing returns empty results", async () => {
      const { items, total } = await audit.listAuditLogs({
        from: new Date("2026-01-01T00:00:00Z"),
        page: 1,
        limit: 50,
      });
      expect(total).toBe(0);
      expect(items).toHaveLength(0);
    });
  });

  describe("combined filters", () => {
    it("actor + targetType narrows correctly", async () => {
      const { items, total } = await audit.listAuditLogs({
        actor: actor1,
        targetType: "compliance",
        page: 1,
        limit: 50,
      });
      expect(total).toBe(1);
      expect(items[0].actor.toString()).toBe(actor1);
      expect(items[0].targetType).toBe("compliance");
    });

    it("actor + date range narrows correctly", async () => {
      const { items, total } = await audit.listAuditLogs({
        actor: actor1,
        from: new Date("2025-01-01T00:00:00Z"),
        to: new Date("2025-01-31T23:59:59Z"),
        page: 1,
        limit: 50,
      });
      expect(total).toBe(1);
      expect(items[0].action).toBe("listing.created");
    });
  });

  describe("backward compatibility", () => {
    it("still filters by existing targetId", async () => {
      const { items, total } = await audit.listAuditLogs({ targetId: target1, page: 1, limit: 50 });
      expect(total).toBe(2);
      items.forEach((item) => expect(item.targetId.toString()).toBe(target1));
    });

    it("still filters by existing action", async () => {
      const { items, total } = await audit.listAuditLogs({ action: "listing.created", page: 1, limit: 50 });
      expect(total).toBe(1);
      expect(items[0].action).toBe("listing.created");
    });
  });
});

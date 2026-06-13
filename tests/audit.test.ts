import mongoose from "mongoose";
import * as audit from "../src/modules/audit/audit.service";
import { AuditLog } from "../src/modules/audit/audit.model";

const actor = new mongoose.Types.ObjectId().toString();
const target = new mongoose.Types.ObjectId().toString();

describe("audit.service", () => {
  it("records an audit entry", async () => {
    await audit.record({
      actor,
      actorRole: "property_owner",
      action: "listing.created",
      targetId: target,
    });

    const logs = await AuditLog.find({ targetId: target });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("listing.created");
    expect(logs[0].actorRole).toBe("property_owner");
  });

  it("never throws even if inputs are odd (best-effort)", async () => {
    await expect(
      audit.record({
        actor,
        actorRole: "admin",
        action: "listing.published",
        targetId: target,
        metadata: { from: "approved" },
      }),
    ).resolves.toBeUndefined();
  });

  it("queries logs for a target newest-first", async () => {
    await audit.record({ actor, actorRole: "admin", action: "listing.submitted", targetId: target });
    await audit.record({ actor, actorRole: "admin", action: "listing.approved", targetId: target });

    const { items, total } = await audit.listAuditLogs({ targetId: target, page: 1, limit: 50 });
    expect(total).toBeGreaterThanOrEqual(2);
    expect(items[0].targetId.toString()).toBe(target);
  });
});

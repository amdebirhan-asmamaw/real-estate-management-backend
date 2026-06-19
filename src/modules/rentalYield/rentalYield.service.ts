import { StatusCodes } from "http-status-codes";
import type { FilterQuery } from "mongoose";
import { Listing } from "../listings/listing.model";
import { Lease } from "../leases/lease.model";
import { AppError } from "../../core/utils/AppError";
import * as audit from "../audit/audit.service";
import {
  MaintenanceRecord,
  IMaintenanceRecord,
} from "./maintenanceRecord.model";
import type {
  MaintenanceRecordInput,
  MaintenanceRecordQuery,
} from "./rentalYield.validation";

const ADMIN_ROLES = ["admin", "super_admin"];
const isAdmin = (role: string | null): boolean =>
  role !== null && ADMIN_ROLES.includes(role);

const findListingForOwner = async (
  listingId: string,
  userId: string,
  role: string,
) => {
  const listing = await Listing.findById(listingId);
  if (!listing) throw new AppError("Listing not found", StatusCodes.NOT_FOUND);
  if (!isAdmin(role) && listing.createdBy.toString() !== userId) {
    throw new AppError(
      "Only the listing owner or an admin may do this",
      StatusCodes.FORBIDDEN,
    );
  }
  return listing;
};

export const createMaintenanceRecord = async (
  listingId: string,
  input: MaintenanceRecordInput,
  userId: string,
  role: string,
): Promise<IMaintenanceRecord> => {
  const listing = await findListingForOwner(listingId, userId, role);
  if (input.leaseId) {
    const lease = await Lease.findOne({
      _id: input.leaseId,
      listing: listingId,
    });
    if (!lease)
      throw new AppError(
        "Lease not found for this listing",
        StatusCodes.NOT_FOUND,
      );
  }
  const record = await MaintenanceRecord.create({
    listing: listing.id,
    lease: input.leaseId,
    owner: listing.createdBy,
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    incurredAt: input.incurredAt,
    note: input.note,
    createdBy: userId,
  });
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "maintenance_record.created",
    targetType: "listing",
    targetId: listing.id,
    metadata: { recordId: record.id, amount: record.amount, type: record.type },
  });
  return record;
};

export const listMaintenanceRecords = async (
  listingId: string,
  query: MaintenanceRecordQuery,
  userId: string,
  role: string,
) => {
  await findListingForOwner(listingId, userId, role);
  const filter: FilterQuery<IMaintenanceRecord> = { listing: listingId };
  if (query.type) filter.type = query.type;
  if (query.from || query.to) {
    filter.incurredAt = {};
    if (query.from) filter.incurredAt.$gte = query.from;
    if (query.to) filter.incurredAt.$lte = query.to;
  }
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    MaintenanceRecord.find(filter)
      .sort({ incurredAt: -1 })
      .skip(skip)
      .limit(query.limit),
    MaintenanceRecord.countDocuments(filter),
  ]);
  return { items, total, page: query.page, limit: query.limit };
};

const daysBetween = (start: Date, end: Date): number =>
  Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));

const clampRangeDays = (
  start: Date,
  end: Date,
  rangeStart: Date,
  rangeEnd: Date,
): number => {
  const s = new Date(Math.max(start.getTime(), rangeStart.getTime()));
  const e = new Date(Math.min(end.getTime(), rangeEnd.getTime()));
  return daysBetween(s, e);
};

export const getYieldSummary = async (
  listingId: string,
  userId: string,
  role: string,
) => {
  const listing = await findListingForOwner(listingId, userId, role);
  const rangeEnd = new Date();
  const rangeStart = new Date(rangeEnd);
  rangeStart.setFullYear(rangeEnd.getFullYear() - 1);

  const [leases, costs] = await Promise.all([
    Lease.find({
      listing: listingId,
      status: { $in: ["active", "completed", "terminated"] },
    }),
    MaintenanceRecord.aggregate([
      {
        $match: {
          listing: listing._id,
          incurredAt: { $gte: rangeStart, $lte: rangeEnd },
        },
      },
      { $group: { _id: "$currency", total: { $sum: "$amount" } } },
    ]),
  ]);

  const occupiedDays = leases.reduce(
    (sum, lease) =>
      sum +
      clampRangeDays(lease.startDate, lease.endDate, rangeStart, rangeEnd),
    0,
  );
  const grossRent = leases.reduce((sum, lease) => {
    const days = clampRangeDays(
      lease.startDate,
      lease.endDate,
      rangeStart,
      rangeEnd,
    );
    return sum + (lease.monthlyRent / 30) * days;
  }, 0);
  const maintenanceCost = costs.reduce(
    (sum, item) => sum + Number(item.total),
    0,
  );
  const netIncome = grossRent - maintenanceCost;
  const occupancyRate = Math.min(1, occupiedDays / 365);
  const propertyValue = listing.price;
  const annualizedYield =
    propertyValue && propertyValue > 0
      ? (netIncome / propertyValue) * 100
      : undefined;

  return {
    listingId,
    currency: listing.currency,
    period: { from: rangeStart, to: rangeEnd },
    grossRent,
    maintenanceCost,
    netIncome,
    occupiedDays,
    occupancyRate,
    escrowHistory: leases.map((lease) => ({
      leaseId: lease.id,
      status: lease.status,
      escrowState: lease.escrow.state,
      fundTxHash: lease.escrow.fundTxHash,
      settleTxHash: lease.escrow.settleTxHash,
    })),
    annualizedYield,
  };
};

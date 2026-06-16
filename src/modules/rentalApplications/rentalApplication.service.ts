import { StatusCodes } from "http-status-codes";
import type { FilterQuery } from "mongoose";
import { RentalApplication, IRentalApplication } from "./rentalApplication.model";
import { Listing } from "../listings/listing.model";
import { AppError } from "../../core/utils/AppError";
import * as audit from "../audit/audit.service";
import * as notifications from "../notifications/notification.service";
import * as leases from "../leases/lease.service";
import * as listingAnalytics from "../listingAnalytics/listingAnalytics.service";
import type {
  AppointmentInput,
  CreateLeaseFromApplicationInput,
  CreateRentalApplicationInput,
  ReviewRentalApplicationInput,
  ScreeningInput,
} from "./rentalApplication.validation";

const ADMIN_ROLES = ["admin", "super_admin"];
const isAdmin = (role: string | null): boolean =>
  role !== null && ADMIN_ROLES.includes(role);

const findOr404 = async (id: string): Promise<IRentalApplication> => {
  const application = await RentalApplication.findById(id);
  if (!application) throw new AppError("Rental application not found", StatusCodes.NOT_FOUND);
  return application;
};

const ensureManager = (
  application: IRentalApplication,
  userId: string,
  role: string,
): void => {
  if (!isAdmin(role) && application.landlord.toString() !== userId) {
    throw new AppError("Only the listing owner or an admin may manage this application", StatusCodes.FORBIDDEN);
  }
};

const ensureVisible = (
  application: IRentalApplication,
  userId: string,
  role: string,
): void => {
  if (
    !isAdmin(role) &&
    application.landlord.toString() !== userId &&
    application.tenant.toString() !== userId
  ) {
    throw new AppError("Rental application not found", StatusCodes.NOT_FOUND);
  }
};

const notifyParties = async (
  application: IRentalApplication,
  title: string,
  message: string,
  metadata: Record<string, unknown> = {},
): Promise<void> => {
  await Promise.all([
    notifications.notify({
      recipient: application.landlord.toString(),
      type: "rental_application.status_update",
      title,
      message,
      metadata: { applicationId: application.id, status: application.status, ...metadata },
    }),
    notifications.notify({
      recipient: application.tenant.toString(),
      type: "rental_application.status_update",
      title,
      message,
      metadata: { applicationId: application.id, status: application.status, ...metadata },
    }),
  ]);
};

export const create = async (
  userId: string,
  role: string,
  input: CreateRentalApplicationInput,
): Promise<IRentalApplication> => {
  if (role !== "tenant") {
    throw new AppError("Only tenants may apply for rentals", StatusCodes.FORBIDDEN);
  }
  const listing = await Listing.findById(input.listingId);
  if (!listing || listing.status !== "published") {
    throw new AppError("Listing not found", StatusCodes.NOT_FOUND);
  }
  if (listing.listingType !== "rent") {
    throw new AppError("Rental applications require a rent listing", StatusCodes.BAD_REQUEST);
  }
  if (listing.createdBy.toString() === userId) {
    throw new AppError("Listing owners cannot apply to their own listing", StatusCodes.BAD_REQUEST);
  }

  try {
    const application = await RentalApplication.create({
      listing: listing.id,
      landlord: listing.createdBy,
      tenant: userId,
      desiredStartDate: input.desiredStartDate,
      desiredEndDate: input.desiredEndDate,
      occupants: input.occupants,
      monthlyIncome: input.monthlyIncome,
      employer: input.employer,
      message: input.message,
    });
    await audit.record({
      actor: userId,
      actorRole: role,
      action: "rental_application.created",
      targetType: "rental_application",
      targetId: application.id,
      metadata: { listingId: listing.id },
    });
    await listingAnalytics.trackEvent({
      listingId: listing.id,
      ownerId: listing.createdBy.toString(),
      actorId: userId,
      eventType: "rental_application",
      metadata: { applicationId: application.id },
    });
    await notifications.notify({
      recipient: listing.createdBy.toString(),
      type: "rental_application.received",
      title: "New rental application",
      message: `A tenant applied for "${listing.title}".`,
      metadata: { applicationId: application.id, listingId: listing.id },
    });
    return application;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new AppError("You already have an active application for this listing", StatusCodes.CONFLICT);
    }
    throw error;
  }
};

export const listMine = async (
  userId: string,
  role: string,
): Promise<IRentalApplication[]> => {
  const filter: FilterQuery<IRentalApplication> = isAdmin(role)
    ? {}
    : role === "tenant"
      ? { tenant: userId }
      : { landlord: userId };
  return RentalApplication.find(filter)
    .sort({ createdAt: -1 })
    .populate("listing", "title listingType status monthlyRent currency");
};

export const getById = async (
  id: string,
  userId: string,
  role: string,
): Promise<IRentalApplication> => {
  const application = await findOr404(id);
  ensureVisible(application, userId, role);
  return application;
};

export const review = async (
  id: string,
  input: ReviewRentalApplicationInput,
  userId: string,
  role: string,
): Promise<IRentalApplication> => {
  const application = await findOr404(id);
  ensureManager(application, userId, role);
  if (["withdrawn", "lease_created"].includes(application.status)) {
    throw new AppError("This application can no longer be reviewed", StatusCodes.CONFLICT);
  }
  application.status = input.status;
  application.reviewedBy = userId as never;
  application.reviewedAt = new Date();
  application.reviewNote = input.note;
  await application.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "rental_application.reviewed",
    targetType: "rental_application",
    targetId: application.id,
    metadata: { status: application.status },
  });
  await notifyParties(
    application,
    "Rental application updated",
    "A rental application review status changed.",
  );
  return application;
};

export const updateScreening = async (
  id: string,
  input: ScreeningInput,
  userId: string,
  role: string,
): Promise<IRentalApplication> => {
  const application = await findOr404(id);
  ensureManager(application, userId, role);
  application.screening = {
    status: input.status,
    provider: input.provider,
    reference: input.reference,
    score: input.score,
    notes: input.notes,
    completedAt: ["passed", "failed", "manual_review"].includes(input.status)
      ? new Date()
      : undefined,
  };
  if (input.status === "pending") application.status = "screening";
  await application.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "rental_application.screened",
    targetType: "rental_application",
    targetId: application.id,
    metadata: { screeningStatus: input.status },
  });
  await notifyParties(
    application,
    "Tenant screening updated",
    "The rental application screening status changed.",
    { screeningStatus: input.status },
  );
  return application;
};

export const updateAppointment = async (
  id: string,
  input: AppointmentInput,
  userId: string,
  role: string,
): Promise<IRentalApplication> => {
  const application = await findOr404(id);
  ensureVisible(application, userId, role);
  const isTenantRequest = role === "tenant" && application.tenant.toString() === userId;
  const isManagerUpdate = isAdmin(role) || application.landlord.toString() === userId;
  if (!isTenantRequest && !isManagerUpdate) {
    throw new AppError("Not allowed", StatusCodes.FORBIDDEN);
  }
  if (isTenantRequest && !["requested", "cancelled"].includes(input.status)) {
    throw new AppError("Tenants may only request or cancel appointments", StatusCodes.FORBIDDEN);
  }
  application.appointment = {
    status: input.status,
    requestedAt:
      input.status === "requested"
        ? new Date()
        : application.appointment?.requestedAt,
    scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : application.appointment?.scheduledFor,
    locationNote: input.locationNote,
    note: input.note,
  };
  await application.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "rental_application.appointment_updated",
    targetType: "rental_application",
    targetId: application.id,
    metadata: { appointmentStatus: input.status },
  });
  await notifyParties(
    application,
    "Viewing appointment updated",
    "A rental viewing appointment changed.",
    { appointmentStatus: input.status },
  );
  return application;
};

export const withdraw = async (
  id: string,
  userId: string,
  role: string,
): Promise<IRentalApplication> => {
  const application = await findOr404(id);
  if (role !== "tenant" || application.tenant.toString() !== userId) {
    throw new AppError("Only the tenant may withdraw this application", StatusCodes.FORBIDDEN);
  }
  if (application.status === "lease_created") {
    throw new AppError("Applications with leases cannot be withdrawn", StatusCodes.CONFLICT);
  }
  application.status = "withdrawn";
  await application.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "rental_application.withdrawn",
    targetType: "rental_application",
    targetId: application.id,
  });
  await notifyParties(application, "Rental application withdrawn", "A tenant withdrew a rental application.");
  return application;
};

export const createLease = async (
  id: string,
  input: CreateLeaseFromApplicationInput,
  userId: string,
  role: string,
): Promise<IRentalApplication> => {
  const application = await findOr404(id);
  ensureManager(application, userId, role);
  if (application.status !== "approved") {
    throw new AppError("Only approved applications can create leases", StatusCodes.CONFLICT);
  }
  const lease = await leases.createLease(
    {
      listingId: application.listing.toString(),
      tenantId: application.tenant.toString(),
      monthlyRent: input.monthlyRent,
      depositAmount: input.depositAmount,
      currency: input.currency,
      startDate: input.startDate,
      endDate: input.endDate,
      terms: input.terms,
    },
    userId,
    role,
  );
  application.status = "lease_created";
  application.lease = lease.id;
  await application.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "rental_application.lease_created",
    targetType: "rental_application",
    targetId: application.id,
    metadata: { leaseId: lease.id },
  });
  await notifyParties(
    application,
    "Lease draft created",
    "A lease draft was created from the approved rental application.",
    { leaseId: lease.id },
  );
  return application;
};

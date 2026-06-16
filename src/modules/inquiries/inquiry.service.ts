import { StatusCodes } from "http-status-codes";
import { Inquiry, IInquiry } from "./inquiry.model";
import { AppError } from "../../core/utils/AppError";
import { isAdmin, getListingById } from "../listings/listing.service";
import * as notifications from "../notifications/notification.service";
import type { CreateInquiryInput, UpdateInquiryInput } from "./inquiry.validation";

/** A prospective tenant sends an inquiry about a (published) listing. */
export const createInquiry = async (
  inquirerId: string,
  role: string,
  input: CreateInquiryInput,
): Promise<IInquiry> => {
  // Visible-to-user check: throws 404 for non-published listings.
  const listing = await getListingById(input.listingId, inquirerId, role);

  const inquiry = await Inquiry.create({
    listing: listing.id,
    listingOwner: listing.createdBy,
    inquirer: inquirerId,
    message: input.message,
  });

  await notifications.notify({
    recipient: listing.createdBy.toString(),
    type: "inquiry.received",
    title: "New listing inquiry",
    message: `You received a new inquiry for "${listing.title}".`,
    metadata: { listingId: listing.id, inquiryId: inquiry.id },
  });

  return inquiry;
};

/** Inquiries the caller has sent. */
export const listSent = async (userId: string): Promise<IInquiry[]> =>
  Inquiry.find({ inquirer: userId })
    .sort({ createdAt: -1 })
    .populate("listing", "title status");

/** Inquiries received on the caller's listings. */
export const listReceived = async (userId: string): Promise<IInquiry[]> =>
  Inquiry.find({ listingOwner: userId })
    .sort({ createdAt: -1 })
    .populate("listing", "title status");

/** The listing owner (or an admin) responds to / updates an inquiry. */
export const updateInquiry = async (
  inquiryId: string,
  userId: string,
  role: string,
  input: UpdateInquiryInput,
): Promise<IInquiry> => {
  const inquiry = await Inquiry.findById(inquiryId);
  if (!inquiry) {
    throw new AppError("Inquiry not found", StatusCodes.NOT_FOUND);
  }

  const isOwner = inquiry.listingOwner.toString() === userId;
  if (!isOwner && !isAdmin(role)) {
    throw new AppError(
      "Only the listing owner can manage this inquiry",
      StatusCodes.FORBIDDEN,
    );
  }

  if (input.response !== undefined) {
    inquiry.response = input.response;
    inquiry.respondedAt = new Date();
    if (!input.status) inquiry.status = "responded";
  }
  if (input.status) inquiry.status = input.status;

  await inquiry.save();

  if (input.response !== undefined || input.status) {
    await notifications.notify({
      recipient: inquiry.inquirer.toString(),
      type: "inquiry.responded",
      title: "Inquiry updated",
      message: "Your listing inquiry has been updated.",
      metadata: { inquiryId: inquiry.id, status: inquiry.status },
    });
  }

  return inquiry;
};

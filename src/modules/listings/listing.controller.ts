import { Request, Response, NextFunction } from "express";
import * as service from "./listing.service";
import {
  uploadPublic,
  uploadPrivate,
  signedUrl,
  destroyAsset,
} from "../../core/utils/uploader";
import { sha256 } from "../../core/utils/hash";
import { sendSuccess, sendCreated } from "../../core/utils/response";
import type {
  CreateListingInput,
  DiscoveryQuery,
  TransitionInput,
  DocumentReviewInput,
  AdminListQuery,
} from "./listing.validation";
import type { DocumentType } from "./listing.model";

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

export const create: Handler = async (req, res, next) => {
  try {
    const listing = await service.createListing(
      req.body as CreateListingInput,
      req.user!.userId,
      req.user!.role,
    );
    sendCreated(res, listing, "Listing created");
  } catch (error) {
    next(error);
  }
};

export const getOne: Handler = async (req, res, next) => {
  try {
    const listing = await service.getListingById(
      req.params.id,
      req.user?.userId ?? null,
      req.user?.role ?? null,
    );
    sendSuccess(res, listing, "Listing fetched");
  } catch (error) {
    next(error);
  }
};

export const update: Handler = async (req, res, next) => {
  try {
    const listing = await service.updateListing(
      req.params.id,
      req.body,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, listing, "Listing updated");
  } catch (error) {
    next(error);
  }
};

export const remove: Handler = async (req, res, next) => {
  try {
    await service.deleteListing(req.params.id, req.user!.userId, req.user!.role);
    sendSuccess(res, null, "Listing deleted");
  } catch (error) {
    next(error);
  }
};

export const mine: Handler = async (req, res, next) => {
  try {
    const listings = await service.listMine(req.user!.userId);
    sendSuccess(res, listings, "Your listings");
  } catch (error) {
    next(error);
  }
};

export const discover: Handler = async (req, res, next) => {
  try {
    const result = await service.discover(
      req.query as unknown as DiscoveryQuery,
    );
    sendSuccess(res, result, "Discovery results");
  } catch (error) {
    next(error);
  }
};

export const transition: Handler = async (req, res, next) => {
  try {
    const listing = await service.transition(
      req.params.id,
      req.body as TransitionInput,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, listing, `Listing ${(req.body as TransitionInput).action}`);
  } catch (error) {
    next(error);
  }
};

export const adminList: Handler = async (req, res, next) => {
  try {
    const result = await service.adminList(
      req.query as unknown as AdminListQuery,
    );
    sendSuccess(res, result, "Review queue");
  } catch (error) {
    next(error);
  }
};

export const duplicates: Handler = async (req, res, next) => {
  try {
    const result = await service.findDuplicates(req.params.id);
    sendSuccess(res, result, "Potential duplicates");
  } catch (error) {
    next(error);
  }
};

export const uploadPhotos: Handler = async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[]) ?? [];
    const uploaded = await Promise.all(
      files.map((f) => uploadPublic(f.buffer, `listings/${req.params.id}/photos`)),
    );
    const listing = await service.addPhotos(
      req.params.id,
      uploaded,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, listing, "Photos uploaded");
  } catch (error) {
    next(error);
  }
};

export const removePhoto: Handler = async (req, res, next) => {
  try {
    // Service confirms permission + that the photo belongs to the listing and
    // removes it from the DB; only then do we destroy the remote asset.
    const { listing, publicId } = await service.removePhoto(
      req.params.id,
      (req.body as { publicId: string }).publicId,
      req.user!.userId,
      req.user!.role,
    );
    await destroyAsset(publicId, "upload");
    sendSuccess(res, listing, "Photo removed");
  } catch (error) {
    next(error);
  }
};

export const uploadDocuments: Handler = async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[]) ?? [];
    const type = ((req.body as { type?: DocumentType }).type ??
      "other") as DocumentType;
    const uploaded = await Promise.all(
      files.map(async (f) => {
        const { publicId } = await uploadPrivate(
          f.buffer,
          `listings/${req.params.id}/documents`,
        );
        return { type, publicId, hash: sha256(f.buffer) };
      }),
    );
    const listing = await service.addDocuments(
      req.params.id,
      uploaded,
      req.user!.userId,
      req.user!.role,
    );
    // Return only safe document metadata.
    const docs = await service.listDocuments(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendCreated(res, { listingId: listing.id, documents: docs }, "Documents uploaded");
  } catch (error) {
    next(error);
  }
};

export const listDocuments: Handler = async (req, res, next) => {
  try {
    const docs = await service.listDocuments(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, docs, "Documents");
  } catch (error) {
    next(error);
  }
};

export const documentUrl: Handler = async (req, res, next) => {
  try {
    const doc = await service.getDocumentForAccess(
      req.params.id,
      req.params.docId,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, { url: signedUrl(doc.publicId) }, "Signed URL");
  } catch (error) {
    next(error);
  }
};

export const reviewDocument: Handler = async (req, res, next) => {
  try {
    const { decision, note } = req.body as DocumentReviewInput;
    const listing = await service.reviewDocument(
      req.params.id,
      req.params.docId,
      decision,
      note,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, listing, "Document reviewed");
  } catch (error) {
    next(error);
  }
};

export const mintTitle: Handler = async (req, res, next) => {
  try {
    const listing = await service.mintTitle(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, listing, "Title minted");
  } catch (error) {
    next(error);
  }
};

export const title: Handler = async (req, res, next) => {
  try {
    const info = await service.getTitleInfo(
      req.params.id,
      req.user?.userId ?? null,
      req.user?.role ?? null,
    );
    sendSuccess(res, info, "On-chain title");
  } catch (error) {
    next(error);
  }
};

import { Request, Response, NextFunction } from "express";
import * as kyc from "./kyc.service";
import { uploadPrivate } from "../../core/utils/uploader";
import { sha256 } from "../../core/utils/hash";
import { sendSuccess, sendCreated } from "../../core/utils/response";
import type { KycReviewInput, AccountStatusInput } from "./kyc.validation";
import type { KycDocumentType } from "../auth/auth.model";

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

// ─── Self-service ───────────────────────────────────────────────────────────────

export const submit: Handler = async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[]) ?? [];
    const type = ((req.body as { type?: KycDocumentType }).type ??
      "other") as KycDocumentType;
    const docs = await Promise.all(
      files.map(async (f) => {
        const { publicId } = await uploadPrivate(f.buffer, `kyc/${req.user!.userId}`);
        return { type, publicId, hash: sha256(f.buffer) };
      }),
    );
    const summary = await kyc.submitKyc(req.user!.userId, docs);
    sendCreated(res, summary, "KYC documents submitted");
  } catch (error) {
    next(error);
  }
};

export const me: Handler = async (req, res, next) => {
  try {
    const summary = await kyc.getKycSummary(
      req.user!.userId,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, summary, "Your KYC status");
  } catch (error) {
    next(error);
  }
};

export const myDocumentUrl: Handler = async (req, res, next) => {
  try {
    const url = await kyc.getKycDocumentUrl(
      req.user!.userId,
      req.params.docId,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, { url }, "Signed URL");
  } catch (error) {
    next(error);
  }
};

// ─── Admin ──────────────────────────────────────────────────────────────────────

export const adminGetUserKyc: Handler = async (req, res, next) => {
  try {
    const summary = await kyc.getKycSummary(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, summary, "User KYC");
  } catch (error) {
    next(error);
  }
};

export const adminReviewKyc: Handler = async (req, res, next) => {
  try {
    const { decision, note } = req.body as KycReviewInput;
    const summary = await kyc.reviewKyc(
      req.params.id,
      decision,
      note,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, summary, "KYC reviewed");
  } catch (error) {
    next(error);
  }
};

export const adminGetUserDocumentUrl: Handler = async (req, res, next) => {
  try {
    const url = await kyc.getKycDocumentUrl(
      req.params.id,
      req.params.docId,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, { url }, "Signed URL");
  } catch (error) {
    next(error);
  }
};

export const adminSetAccountStatus: Handler = async (req, res, next) => {
  try {
    const { accountStatus } = req.body as AccountStatusInput;
    const user = await kyc.setAccountStatus(
      req.params.id,
      accountStatus,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, user, "Account status updated");
  } catch (error) {
    next(error);
  }
};

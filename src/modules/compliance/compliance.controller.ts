import { Request, Response, NextFunction } from "express";
import { sendCreated, sendSuccess } from "../../core/utils/response";
import * as service from "./compliance.service";
import * as queuesService from "./queues.service";
import type {
  BrokerLicenseInput,
  ComplianceCaseQuery,
  CreateScreeningInput,
  FlagCaseInput,
  QueueQuery,
  ReviewBrokerLicenseInput,
  UpdateComplianceCaseInput,
} from "./compliance.validation";

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const listCases: Handler = async (req, res, next) => {
  try {
    const result = await service.listCases(req.query as unknown as ComplianceCaseQuery);
    sendSuccess(res, result, "Compliance cases");
  } catch (error) {
    next(error);
  }
};

export const updateCase: Handler = async (req, res, next) => {
  try {
    const result = await service.updateCase(
      req.params.id,
      req.body as UpdateComplianceCaseInput,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, result, "Compliance case updated");
  } catch (error) {
    next(error);
  }
};

export const createScreening: Handler = async (req, res, next) => {
  try {
    const result = await service.createScreening(
      req.body as CreateScreeningInput,
      req.user!.userId,
    );
    sendCreated(res, result, "Screening recorded");
  } catch (error) {
    next(error);
  }
};

export const submitBrokerLicense: Handler = async (req, res, next) => {
  try {
    const result = await service.submitBrokerLicense(
      req.user!.userId,
      req.body as BrokerLicenseInput,
    );
    sendCreated(res, result, "Representative license submitted");
  } catch (error) {
    next(error);
  }
};

export const listBrokerLicenses: Handler = async (req, res, next) => {
  try {
    const result = await service.listBrokerLicenses(
      req.query as unknown as {
        owner?: string;
        status?: string;
        page: number;
        limit: number;
      },
    );
    sendSuccess(res, result, "Representative licenses");
  } catch (error) {
    next(error);
  }
};

export const reviewBrokerLicense: Handler = async (req, res, next) => {
  try {
    const result = await service.reviewBrokerLicense(
      req.params.id,
      req.body as ReviewBrokerLicenseInput,
      req.user!.userId,
    );
    sendSuccess(res, result, "Representative license reviewed");
  } catch (error) {
    next(error);
  }
};

// ─── Review Queues (B1) ──────────────────────────────────────────────────────

export const getKycQueue: Handler = async (req, res, next) => {
  try {
    const result = await queuesService.kycQueue(req.query as unknown as QueueQuery);
    sendSuccess(res, result, "KYC review queue");
  } catch (error) {
    next(error);
  }
};

export const getPropertyVerificationQueue: Handler = async (req, res, next) => {
  try {
    const result = await queuesService.propertyVerificationQueue(
      req.query as unknown as QueueQuery,
    );
    sendSuccess(res, result, "Property verification queue");
  } catch (error) {
    next(error);
  }
};

export const getCertificatesQueue: Handler = async (req, res, next) => {
  try {
    const result = await queuesService.certificatesQueue(
      req.query as unknown as QueueQuery,
    );
    sendSuccess(res, result, "Certificate issuance queue");
  } catch (error) {
    next(error);
  }
};

export const getDisputesQueue: Handler = async (req, res, next) => {
  try {
    const result = await queuesService.disputesQueue(
      req.query as unknown as QueueQuery,
    );
    sendSuccess(res, result, "Disputes queue");
  } catch (error) {
    next(error);
  }
};

export const getSuspiciousQueue: Handler = async (req, res, next) => {
  try {
    const result = await queuesService.suspiciousQueue(
      req.query as unknown as QueueQuery,
    );
    sendSuccess(res, result, "Suspicious cases queue");
  } catch (error) {
    next(error);
  }
};

// ─── Mark Suspicious / Flag (B2) ────────────────────────────────────────────

export const flagCase: Handler = async (req, res, next) => {
  try {
    const result = await service.adminFlagCase(
      req.body as FlagCaseInput,
      req.user!.userId,
      req.user!.role,
    );
    sendCreated(res, result, "Compliance case flagged");
  } catch (error) {
    next(error);
  }
};

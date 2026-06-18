import { Request, Response, NextFunction } from "express";
import * as service from "./lease.service";
import { sendSuccess, sendCreated } from "../../core/utils/response";
import type {
  CreateLeaseInput,
  DisputeResolveInput,
  SignLeaseInput,
  DisputeOpenInput,
  DisputeRespondInput,
} from "./lease.validation";

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

export const create: Handler = async (req, res, next) => {
  try {
    const lease = await service.createLease(
      req.body as CreateLeaseInput,
      req.user!.userId,
      req.user!.role,
    );
    sendCreated(res, lease, "Lease created");
  } catch (e) {
    next(e);
  }
};

export const propose: Handler = async (req, res, next) => {
  try {
    const lease = await service.propose(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, lease, "Lease proposed");
  } catch (e) {
    next(e);
  }
};

export const sign: Handler = async (req, res, next) => {
  try {
    const body = req.body as SignLeaseInput;
    const lease = await service.sign(
      req.params.id,
      req.user!.userId,
      req.user!.role,
      body.tenantSignature,
    );
    sendSuccess(res, lease, "Lease signed");
  } catch (e) {
    next(e);
  }
};

export const fund: Handler = async (req, res, next) => {
  try {
    const lease = await service.fund(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, lease, "Escrow funded");
  } catch (e) {
    next(e);
  }
};

export const activate: Handler = async (req, res, next) => {
  try {
    const lease = await service.activate(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, lease, "Lease activated");
  } catch (e) {
    next(e);
  }
};

export const cancel: Handler = async (req, res, next) => {
  try {
    const lease = await service.cancel(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, lease, "Lease cancelled");
  } catch (e) {
    next(e);
  }
};

export const complete: Handler = async (req, res, next) => {
  try {
    const lease = await service.complete(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, lease, "Lease completed");
  } catch (e) {
    next(e);
  }
};

export const terminate: Handler = async (req, res, next) => {
  try {
    const lease = await service.terminate(
      req.params.id,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, lease, "Lease terminated");
  } catch (e) {
    next(e);
  }
};

export const dispute: Handler = async (req, res, next) => {
  try {
    const body = req.body as DisputeOpenInput;
    const lease = await service.dispute(
      req.params.id,
      req.user!.userId,
      req.user!.role,
      body.reason,
    );
    sendSuccess(res, lease, "Lease disputed");
  } catch (e) {
    next(e);
  }
};

export const disputeRespond: Handler = async (req, res, next) => {
  try {
    const body = req.body as DisputeRespondInput;
    const lease = await service.respondToDispute(
      req.params.id,
      req.user!.userId,
      req.user!.role,
      body.response,
    );
    sendSuccess(res, lease, "Dispute response recorded");
  } catch (e) {
    next(e);
  }
};

export const resolveDispute: Handler = async (req, res, next) => {
  try {
    const lease = await service.resolveDispute(
      req.params.id,
      req.body as DisputeResolveInput,
      req.user!.userId,
      req.user!.role,
    );
    sendSuccess(res, lease, "Dispute resolved");
  } catch (e) {
    next(e);
  }
};

export const mine: Handler = async (req, res, next) => {
  try {
    const leases = await service.listMine(req.user!.userId);
    sendSuccess(res, leases, "Your leases");
  } catch (e) {
    next(e);
  }
};

export const getOne: Handler = async (req, res, next) => {
  try {
    const lease = await service.getLeaseById(
      req.params.id,
      req.user?.userId ?? null,
      req.user?.role ?? null,
    );
    sendSuccess(res, lease, "Lease");
  } catch (e) {
    next(e);
  }
};

export const escrowInfo: Handler = async (req, res, next) => {
  try {
    const info = await service.getEscrowInfo(
      req.params.id,
      req.user?.userId ?? null,
      req.user?.role ?? null,
    );
    sendSuccess(res, info, "On-chain escrow");
  } catch (e) {
    next(e);
  }
};

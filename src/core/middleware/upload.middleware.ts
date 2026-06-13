import multer from "multer";
import { StatusCodes } from "http-status-codes";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

const memory = multer.memoryStorage();
const limits = { fileSize: env.UPLOAD_MAX_BYTES };

// Public listing photos — images only.
export const uploadPhotos = multer({
  storage: memory,
  limits,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new AppError("Only image files are allowed", StatusCodes.UNPROCESSABLE_ENTITY));
  },
}).array("photos", 10);

// Private ownership documents — images or PDFs.
export const uploadDocuments = multer({
  storage: memory,
  limits,
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype === "application/pdf"
    ) {
      return cb(null, true);
    }
    cb(
      new AppError(
        "Only image or PDF files are allowed",
        StatusCodes.UNPROCESSABLE_ENTITY,
      ),
    );
  },
}).array("documents", 10);

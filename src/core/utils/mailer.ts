import nodemailer from "nodemailer";
import { env } from "../config/env";
import { AppError } from "./AppError";
import { logger } from "./logger";
import { StatusCodes } from "http-status-codes";

interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const smtpConfigured = (): boolean => Boolean(env.SMTP_HOST);

const isGmailHost = (): boolean =>
  env.SMTP_HOST === "smtp.gmail.com" || env.SMTP_HOST.endsWith(".gmail.com");

const transporter = () => {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new AppError(
      "SMTP_USER and SMTP_PASS are required when SMTP_HOST is set",
      StatusCodes.SERVICE_UNAVAILABLE,
    );
  }

  const auth = { user: env.SMTP_USER, pass: env.SMTP_PASS };

  // Gmail: use nodemailer's built-in service profile (STARTTLS on port 587).
  if (isGmailHost()) {
    return nodemailer.createTransport({ service: "gmail", auth });
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth,
    ...(env.SMTP_PORT === 587 && !env.SMTP_SECURE ? { requireTLS: true } : {}),
  });
};

export const sendMail = async (message: MailMessage): Promise<void> => {
  if (!smtpConfigured()) {
    if (env.isProduction) {
      throw new AppError(
        "Email delivery is not configured",
        StatusCodes.SERVICE_UNAVAILABLE,
      );
    }
    logger.info(
      `[dev-mail] ${message.subject} -> ${message.to}\n${message.text}`,
    );
    return;
  }

  await transporter().sendMail({
    from: env.MAIL_FROM,
    ...message,
  });
};

export const sendPasswordResetEmail = async (
  to: string,
  resetUrl: string,
  expiresMinutes: number,
): Promise<void> => {
  await sendMail({
    to,
    subject: "Reset your Swafri password",
    text: [
      "We received a request to reset your Swafri password.",
      "",
      `Reset your password here: ${resetUrl}`,
      "",
      `This link expires in ${expiresMinutes} minutes.`,
      "If you did not request this, you can safely ignore this email.",
    ].join("\n"),
    html: `
      <p>We received a request to reset your Swafri password.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link expires in ${expiresMinutes} minutes.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  });
};

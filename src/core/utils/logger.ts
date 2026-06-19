import { env } from "../config/env";

type LogLevel = "info" | "warn" | "error" | "debug";

// ─── ANSI color codes ─────────────────────────────────────────────────────────
const colors: Record<LogLevel, string> = {
  info: "\x1b[36m", // Cyan
  warn: "\x1b[33m", // Yellow
  error: "\x1b[31m", // Red
  debug: "\x1b[35m", // Magenta
};

const dim = "\x1b[2m";
const bold = "\x1b[1m";
const reset = "\x1b[0m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";

// ─── Core log function ────────────────────────────────────────────────────────
const log = (level: LogLevel, message: string, ...args: unknown[]): void => {
  if (env.NODE_ENV === "test") return;

  const timestamp = new Date().toISOString();
  const color = colors[level];
  const label = `${color}${bold}[${level.toUpperCase()}]${reset}`;
  const ts = `${dim}${timestamp}${reset}`;
  const msg = `${color}${message}${reset}`;

  // eslint-disable-next-line no-console
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : level === "debug"
          ? console.debug
          : console.log;

  if (args.length > 0) {
    fn(`${label} ${ts} ${msg}`, ...args);
  } else {
    fn(`${label} ${ts} ${msg}`);
  }
};

// ─── HTTP request log ─────────────────────────────────────────────────────────
export interface HttpLogData {
  method: string;
  host: string;
  protocol: string;
  port: number | undefined;
  path: string;
  requestId: string | undefined;
  originalUrl: string;
  baseUrl: string;
  query: Record<string, unknown>;
  ip: string | undefined;
  ips: string[];
  secure: boolean;
  body: unknown;
  cookies: {
    accessToken: string;
    refreshToken: string;
  };
}

// Fields that must never be written to logs in plaintext.
const SENSITIVE_KEYS = [
  "password",
  "newpassword",
  "oldpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "secret",
  "apikey",
];

const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        SENSITIVE_KEYS.includes(k.toLowerCase())
          ? [k, "[REDACTED]"]
          : [k, redact(v)],
      ),
    );
  }
  return value;
};

export const logHttpRequest = (data: HttpLogData): void => {
  if (env.NODE_ENV === "test") return;

  const methodColor =
    data.method === "GET"
      ? green
      : data.method === "POST"
        ? "\x1b[34m" // Blue
        : data.method === "PUT"
          ? "\x1b[33m" // Yellow
          : data.method === "PATCH"
            ? "\x1b[35m" // Magenta
            : data.method === "DELETE"
              ? "\x1b[31m" // Red
              : reset;

  const divider = `${dim}${"─".repeat(60)}${reset}`;
  const ts = `${dim}${new Date().toISOString()}${reset}`;

  const lines = [
    `\n${divider}`,
    `${bold}${methodColor}▶ ${data.method}${reset}  ${bold}${data.path}${reset}  ${ts}`,
    divider,
    `  ${dim}Protocol  ${reset}${data.protocol}${data.secure ? ` ${green}(secure)${reset}` : ""}`,
    `  ${dim}Host      ${reset}${data.host}${data.port != null ? `:${data.port}` : ""}`,
    `  ${dim}Full URL  ${reset}${data.originalUrl}`,
    `  ${dim}Base URL  ${reset}${data.baseUrl || "/"}`,
    `  ${dim}RequestID ${reset}${data.requestId ?? "unknown"}`,
    `  ${dim}IP        ${reset}${data.ip ?? "unknown"}${data.ips.length > 1 ? `  (chain: ${data.ips.join(" → ")})` : ""}`,
  ];

  if (Object.keys(data.query).length > 0) {
    lines.push(`  ${yellow}Query     ${reset}${JSON.stringify(data.query)}`);
  }

  if (
    data.body &&
    typeof data.body === "object" &&
    Object.keys(data.body as object).length > 0
  ) {
    lines.push(
      `  ${yellow}Body      ${reset}${JSON.stringify(redact(data.body), null, 2)}`,
    );
  }

  lines.push(
    `  ${dim}Cookies${reset}`,
    `    access_token:  ${data.cookies.accessToken}`,
    `    refresh_token: ${data.cookies.refreshToken}`,
    divider + "\n",
  );

  // eslint-disable-next-line no-console
  console.log(lines.join("\n"));
};

// ─── Public logger API ────────────────────────────────────────────────────────
export const logger = {
  info: (message: string, ...args: unknown[]) => log("info", message, ...args),
  warn: (message: string, ...args: unknown[]) => log("warn", message, ...args),
  error: (message: string, ...args: unknown[]) =>
    log("error", message, ...args),
  debug: (message: string, ...args: unknown[]) =>
    log("debug", message, ...args),
};

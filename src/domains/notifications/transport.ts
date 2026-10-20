import nodemailer from "nodemailer";
import { mkdir, writeFile, link, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Envelope } from "./queue";
export class DeliveryFailure extends Error {
  constructor(
    public disposition: "retry" | "failed" | "uncertain",
    public code: string,
  ) {
    super(code);
  }
}
export type Transport = {
  mode: "local" | "smtp";
  send: (jobId: string, envelope: Envelope) => Promise<"local" | "sent">;
};
export function createTransport(
  env: Record<string, string | undefined> = process.env,
  allowExternal = false,
): Transport {
  const mode =
    env.MAIL_TRANSPORT ??
    (env.PFM_LOCAL_MAIL === "true"
      ? "local"
      : env.NODE_ENV === "production"
        ? "disabled"
        : "local");
  if (mode === "local")
    return {
      mode,
      async send(jobId, envelope) {
        const directory = env.PFM_MAIL_DIR ?? ".local/mail";
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary =
          directory + "/." + jobId + "." + randomUUID() + ".tmp";
        try {
          await writeFile(
            temporary,
            JSON.stringify({ jobId, ...envelope }, null, 2),
            { mode: 0o600, flag: "wx" },
          );
          // Publish only a complete file, without replacing an earlier capture.
          await link(temporary, directory + "/" + jobId + ".json");
        } catch (e) {
          if ((e as { code?: string }).code !== "EEXIST")
            throw new DeliveryFailure("retry", "LOCAL_WRITE_FAILED");
        } finally {
          await unlink(temporary).catch(() => {});
        }
        return "local";
      },
    };
  if (mode !== "smtp") throw new Error("MAIL_TRANSPORT_NOT_CONFIGURED");
  const host = env.SMTP_HOST;
  if (!host) throw new Error("SMTP_HOST_REQUIRED");
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(host);
  if (!loopback && !allowExternal)
    throw new Error("EXTERNAL_DELIVERY_REQUIRES_EXPLICIT_FLAG");
  const from = z.email().parse(env.SMTP_FROM),
    port = z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: !loopback,
    ignoreTLS: loopback,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
  return {
    mode: "smtp",
    async send(jobId, envelope) {
      z.email().parse(envelope.email);
      try {
        // Always the platform address (SPF/DKIM); the club only names it
        // and receives the replies.
        const replyTo = envelope.replyTo
          ? z.email().safeParse(envelope.replyTo)
          : null;
        const result = await transport.sendMail({
          from: envelope.fromName
            ? { name: envelope.fromName, address: from }
            : from,
          ...(replyTo?.success ? { replyTo: replyTo.data } : {}),
          to: envelope.email,
          subject: envelope.subject,
          text: envelope.text,
          html: envelope.html,
          messageId: `<${jobId}@${from.split("@")[1]}>`,
          disableFileAccess: true,
          disableUrlAccess: true,
        });
        if (!result.accepted?.length)
          throw new DeliveryFailure("failed", "RECIPIENT_REJECTED");
        return "sent";
      } catch (e) {
        if (e instanceof DeliveryFailure) throw e;
        const error = e as {
          code?: string;
          command?: string;
          responseCode?: number;
        };
        if (error.responseCode)
          return Promise.reject(
            new DeliveryFailure(
              error.responseCode >= 500 ? "failed" : "retry",
              "SMTP_" + error.responseCode,
            ),
          );
        if (
          [
            "CONN",
            "AUTH",
            "EHLO",
            "HELO",
            "STARTTLS",
            "MAIL FROM",
            "RCPT TO",
          ].includes(error.command ?? "") ||
          error.code === "ECONNECTION"
        )
          throw new DeliveryFailure("retry", "SMTP_CONNECTION");
        throw new DeliveryFailure("uncertain", "SMTP_OUTCOME_UNKNOWN");
      }
    },
  };
}

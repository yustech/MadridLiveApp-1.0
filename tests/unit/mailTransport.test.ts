import { describe, expect, it } from "vitest";
import { buildSmtpTransportOptions } from "../../server/mail/mailer";

const baseEnv: NodeJS.ProcessEnv = {
  MAIL_SMTP_HOST: "mail.example.test",
  MAIL_SMTP_PORT: "465",
  MAIL_SMTP_SECURE: "true",
  MAIL_SMTP_USER: "mailer-user",
  MAIL_SMTP_PASSWORD: "mailer-password",
};

describe("SMTP transport options", () => {
  it("keeps strict certificate verification when MAIL_TLS_INSECURE is unset", () => {
    expect(buildSmtpTransportOptions(baseEnv)).not.toHaveProperty("tls.rejectUnauthorized", false);
  });

  it("accepts self-signed certificates only when MAIL_TLS_INSECURE is true", () => {
    expect(buildSmtpTransportOptions({ ...baseEnv, MAIL_TLS_INSECURE: "true" }))
      .toHaveProperty("tls.rejectUnauthorized", false);
  });

  it("keeps strict certificate verification when MAIL_TLS_INSECURE is false", () => {
    expect(buildSmtpTransportOptions({ ...baseEnv, MAIL_TLS_INSECURE: "false" }))
      .not.toHaveProperty("tls.rejectUnauthorized", false);
  });

  it("reads the SMTP connection and auth options from the environment", () => {
    expect(buildSmtpTransportOptions(baseEnv)).toEqual({
      host: "mail.example.test",
      port: 465,
      secure: true,
      auth: { user: "mailer-user", pass: "mailer-password" },
    });
  });
});

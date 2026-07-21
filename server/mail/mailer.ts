import nodemailer from "nodemailer";
import { buildResetLink, RESET_TOKEN_TTL_MS } from "./resetToken";

export function isMailConfigured() {
  return ["MAIL_SMTP_HOST", "MAIL_SMTP_USER", "MAIL_SMTP_PASSWORD", "MAIL_FROM", "APP_PUBLIC_BASE_URL"]
    .every((name) => Boolean(process.env[name]?.trim()));
}

export async function sendPasswordResetEmail(toEmail: string, token: string) {
  if (!isMailConfigured()) throw new Error("Password reset mail is not configured");

  const transport = process.env.MAIL_TRANSPORT === "json"
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
        host: process.env.MAIL_SMTP_HOST,
        port: Number(process.env.MAIL_SMTP_PORT || 587),
        secure: process.env.MAIL_SMTP_SECURE === "true",
        auth: { user: process.env.MAIL_SMTP_USER, pass: process.env.MAIL_SMTP_PASSWORD },
      });
  const resetLink = buildResetLink(process.env.APP_PUBLIC_BASE_URL!, token);
  const minutes = Math.floor(RESET_TOKEN_TTL_MS / 60_000);

  await transport.sendMail({
    from: process.env.MAIL_FROM,
    to: toEmail,
    subject: "Restablece tu contraseña de MadridLive",
    text: `Hemos recibido una solicitud para restablecer tu contraseña.\n\nAbre este enlace: ${resetLink}\n\nEl enlace caduca en ${minutes} minutos. Si no solicitaste el cambio, ignora este correo.`,
    html: `<p>Hemos recibido una solicitud para restablecer tu contraseña.</p><p><a href="${resetLink}">Restablecer contraseña</a></p><p>El enlace caduca en ${minutes} minutos. Si no solicitaste el cambio, ignora este correo.</p>`,
  });
}

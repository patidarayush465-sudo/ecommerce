import nodemailer from "nodemailer";

const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: Number(process.env.EMAIL_PORT) === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailSendError";
  }
}

function getSafeErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: "Unknown email service error" };
  }

  const smtpError = error as Error & {
    code?: string;
    response?: string;
    responseCode?: number;
  };

  return {
    message: smtpError.message,
    ...(smtpError.code ? { code: smtpError.code } : {}),
    ...(smtpError.response ? { response: smtpError.response } : {}),
    ...(smtpError.responseCode
      ? { responseCode: smtpError.responseCode }
      : {}),
  };
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailOptions): Promise<void> {
  try {
    if (
      !process.env.EMAIL_HOST ||
      !process.env.EMAIL_USER ||
      !process.env.EMAIL_PASSWORD ||
      !process.env.EMAIL_FROM
    ) {
      throw new Error("Email service environment variables are not configured");
    }

    await emailTransporter.verify();
    await emailTransporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
      text,
    });
  } catch (error: unknown) {
    const details = getSafeErrorDetails(error);
    console.error("Verification email failed to send", details);
    throw new EmailSendError("Verification email failed to send");
  }
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: "Reset your password",
    html: `<p>We received a request to reset your password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour.</p>`,
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
  });
}

export async function sendWelcomeEmail(
  to: string,
  name: string,
  verificationUrl: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: "Welcome to E-commerce Application",
    html: `<h1>Welcome to E-commerce Application, ${name}!</h1><p>Your customer account has been created successfully.</p><p>Please verify your email address to activate your account.</p><p><a href="${verificationUrl}">Verify Email</a></p><p>This verification link expires in 24 hours.</p>`,
    text: [
      `Welcome to E-commerce Application, ${name}!`,
      "Your customer account has been created successfully.",
      "Please verify your email address to activate your account.",
      `Verify your email: ${verificationUrl}`,
      "This verification link expires in 24 hours.",
    ].join("\n\n"),
  });
}

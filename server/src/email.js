import nodemailer from 'nodemailer'
import { get } from './db.js'

// Get SMTP config from platform_settings or env
function getTransporter() {
  // Try DB settings first
  const smtpHost = get("SELECT value FROM platform_settings WHERE key = 'smtp_host'")?.value
  const smtpPort = get("SELECT value FROM platform_settings WHERE key = 'smtp_port'")?.value
  const smtpUser = get("SELECT value FROM platform_settings WHERE key = 'smtp_user'")?.value
  const smtpPass = get("SELECT value FROM platform_settings WHERE key = 'smtp_pass'")?.value
  const smtpFrom = get("SELECT value FROM platform_settings WHERE key = 'smtp_from'")?.value

  const host = smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com'
  const port = parseInt(smtpPort || process.env.SMTP_PORT || '587')
  const user = smtpUser || process.env.SMTP_USER
  const pass = smtpPass || process.env.SMTP_PASS
  const from = smtpFrom || process.env.SMTP_FROM || user

  if (!user || !pass) {
    throw new Error('SMTP nao configurado. Configure nas settings da plataforma ou variaveis de ambiente.')
  }

  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    }),
    from,
  }
}

export async function sendSignatureEmail(to, name, contractTitle, signUrl) {
  const { transporter, from } = getTransporter()

  await transporter.sendMail({
    from: `"Audiovisual Nexus" <${from}>`,
    to,
    subject: `Contrato para assinatura: ${contractTitle}`,
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #0d0d0f; color: #e5e5e5; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 28px;">
          <h1 style="color: #a78bfa; font-size: 20px; margin: 0;">Audiovisual Nexus</h1>
        </div>
        <p style="font-size: 15px; line-height: 1.6; color: #ccc;">
          Ola, <strong>${name}</strong>!
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #aaa;">
          Voce recebeu um contrato para revisao e assinatura digital:
        </p>
        <div style="background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <div style="font-size: 15px; font-weight: 600; color: #e5e5e5;">${contractTitle}</div>
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${signUrl}" style="display: inline-block; background: #a78bfa; color: #0d0d0f; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none;">
            Revisar e Assinar
          </a>
        </div>
        <p style="font-size: 12px; color: #666; text-align: center; margin-top: 24px;">
          Este link e exclusivo para voce. Nao compartilhe com terceiros.
        </p>
      </div>
    `,
  })
}

export async function sendOTPEmail(to, otp) {
  const { transporter, from } = getTransporter()

  await transporter.sendMail({
    from: `"Audiovisual Nexus" <${from}>`,
    to,
    subject: `Codigo de verificacao: ${otp}`,
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #0d0d0f; color: #e5e5e5; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 28px;">
          <h1 style="color: #a78bfa; font-size: 20px; margin: 0;">Audiovisual Nexus</h1>
        </div>
        <p style="font-size: 14px; line-height: 1.6; color: #aaa; text-align: center;">
          Seu codigo de verificacao para assinar o contrato:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #a78bfa; font-family: monospace;">
            ${otp}
          </span>
        </div>
        <p style="font-size: 12px; color: #666; text-align: center;">
          Este codigo expira em 10 minutos. Nao compartilhe com ninguem.
        </p>
      </div>
    `,
  })
}

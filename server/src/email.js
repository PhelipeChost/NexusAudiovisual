import nodemailer from 'nodemailer'
import { get } from './db.js'

// Get SMTP config — company first, then platform_settings, then env
function getTransporter(companyId) {
  let host, port, user, pass, from

  // Try company-level SMTP first
  if (companyId) {
    const company = get('SELECT smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, name FROM companies WHERE id = ?', [companyId])
    if (company?.smtp_user && company?.smtp_pass) {
      host = company.smtp_host || 'smtp.gmail.com'
      port = parseInt(company.smtp_port || '587')
      user = company.smtp_user
      pass = company.smtp_pass
      from = company.smtp_from || user

      return {
        transporter: nodemailer.createTransport({
          host, port, secure: port === 465,
          auth: { user, pass },
        }),
        from,
        companyName: company.name || 'Audiovisual Nexus',
      }
    }
  }

  // Fallback to platform_settings
  const smtpHost = get("SELECT value FROM platform_settings WHERE key = 'smtp_host'")?.value
  const smtpPort = get("SELECT value FROM platform_settings WHERE key = 'smtp_port'")?.value
  const smtpUser = get("SELECT value FROM platform_settings WHERE key = 'smtp_user'")?.value
  const smtpPass = get("SELECT value FROM platform_settings WHERE key = 'smtp_pass'")?.value
  const smtpFrom = get("SELECT value FROM platform_settings WHERE key = 'smtp_from'")?.value

  host = smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com'
  port = parseInt(smtpPort || process.env.SMTP_PORT || '587')
  user = smtpUser || process.env.SMTP_USER
  pass = smtpPass || process.env.SMTP_PASS
  from = smtpFrom || process.env.SMTP_FROM || user

  if (!user || !pass) {
    throw new Error('SMTP nao configurado. Acesse Configuracoes > Email para configurar o envio de emails.')
  }

  return {
    transporter: nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: { user, pass },
    }),
    from,
    companyName: 'Audiovisual Nexus',
  }
}

export async function sendSignatureEmail(to, name, contractTitle, signUrl, companyId) {
  const { transporter, from, companyName } = getTransporter(companyId)

  await transporter.sendMail({
    from: `"${companyName}" <${from}>`,
    to,
    subject: `Contrato para assinatura: ${contractTitle}`,
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #0d0d0f; color: #e5e5e5; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 28px;">
          <h1 style="color: #a78bfa; font-size: 20px; margin: 0;">${companyName}</h1>
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

export async function sendOTPEmail(to, otp, companyId) {
  const { transporter, from, companyName } = getTransporter(companyId)

  await transporter.sendMail({
    from: `"${companyName}" <${from}>`,
    to,
    subject: `Codigo de verificacao: ${otp}`,
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #0d0d0f; color: #e5e5e5; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 28px;">
          <h1 style="color: #a78bfa; font-size: 20px; margin: 0;">${companyName}</h1>
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

export async function sendTestEmail(to, companyId) {
  const { transporter, from, companyName } = getTransporter(companyId)

  await transporter.sendMail({
    from: `"${companyName}" <${from}>`,
    to,
    subject: `Teste de email - ${companyName}`,
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #0d0d0f; color: #e5e5e5; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 28px;">
          <h1 style="color: #a78bfa; font-size: 20px; margin: 0;">${companyName}</h1>
        </div>
        <p style="font-size: 15px; line-height: 1.6; color: #ccc; text-align: center;">
          Este e um email de teste para confirmar que o SMTP esta configurado corretamente.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <span style="font-size: 28px;">✅</span>
          <div style="font-size: 14px; color: #a78bfa; margin-top: 8px; font-weight: 600;">
            Configuracao funcionando!
          </div>
        </div>
      </div>
    `,
  })
}

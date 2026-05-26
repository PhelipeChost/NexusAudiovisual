// src/pages/GovBRResult.jsx — Gov.br signature result page
import { useSearchParams, useNavigate } from 'react-router-dom'
import theme from '../styles/theme'

const NIVEL_LABELS = {
  bronze: { label: 'Bronze', color: '#CD7F32', desc: 'Conta Gov.br basica' },
  prata: { label: 'Prata', color: '#C0C0C0', desc: 'Identidade verificada' },
  ouro: { label: 'Ouro', color: '#FFD700', desc: 'Biometria facial validada' },
}

export default function GovBRResult() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const status = params.get('status')
  const errorMsg = params.get('msg')

  if (status === 'error') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: theme.colors.bg }}>
        <div style={{ textAlign: 'center', padding: 40, maxWidth: 480 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>❌</div>
          <h1 style={{ color: theme.colors.text, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            Erro na assinatura
          </h1>
          <p style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
            {errorMsg || 'Ocorreu um erro ao processar a assinatura via Gov.br.'}
          </p>
          <button
            onClick={() => window.close()}
            style={{
              padding: '12px 28px', borderRadius: 8, border: 'none',
              background: theme.colors.primary, color: '#fff', fontWeight: 600,
              fontSize: 14, cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    )
  }

  // Success
  const name = params.get('name') || ''
  const cpf = params.get('cpf') || ''
  const nivel = params.get('nivel') || 'bronze'
  const hash = params.get('hash') || ''
  const title = params.get('title') || ''
  const type = params.get('type') || 'public'
  const nivelInfo = NIVEL_LABELS[nivel] || NIVEL_LABELS.bronze

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: theme.colors.bg }}>
      <div style={{ textAlign: 'center', padding: 40, maxWidth: 520 }}>
        {/* Gov.br logo mark */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
          background: 'linear-gradient(135deg, #1351B4, #0C326F)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(19, 81, 180, 0.4)',
        }}>
          <span style={{ fontSize: 28, color: '#fff', fontWeight: 800 }}>✓</span>
        </div>

        <h1 style={{ color: theme.colors.text, fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          Contrato Assinado via Gov.br
        </h1>
        <p style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Assinatura digital registrada com sucesso.
        </p>

        {/* Signature details card */}
        <div style={{
          background: theme.colors.bgSecondary, border: `1px solid ${theme.colors.border}`,
          borderRadius: 12, padding: 20, textAlign: 'left', marginBottom: 20,
        }}>
          {title && (
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
              <div style={{ fontSize: 11, color: theme.colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Documento</div>
              <div style={{ fontSize: 14, color: theme.colors.text, fontWeight: 600 }}>{title}</div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: theme.colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Assinante</div>
              <div style={{ fontSize: 13, color: theme.colors.text, fontWeight: 500 }}>{name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: theme.colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>CPF</div>
              <div style={{ fontSize: 13, color: theme.colors.text, fontFamily: 'monospace' }}>{cpf}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: theme.colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Nivel Gov.br</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                  background: nivelInfo.color, boxShadow: `0 0 6px ${nivelInfo.color}88`,
                }} />
                <span style={{ fontSize: 13, color: theme.colors.text, fontWeight: 600 }}>{nivelInfo.label}</span>
                <span style={{ fontSize: 11, color: theme.colors.textMuted }}>({nivelInfo.desc})</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: theme.colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Data</div>
              <div style={{ fontSize: 13, color: theme.colors.text }}>{new Date().toLocaleString('pt-BR')}</div>
            </div>
          </div>

          {hash && (
            <div>
              <div style={{ fontSize: 11, color: theme.colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Hash SHA-256</div>
              <div style={{ fontSize: 10, color: theme.colors.textMuted, fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.5 }}>{hash}</div>
            </div>
          )}
        </div>

        {/* Gov.br badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px',
          background: 'rgba(19, 81, 180, 0.08)', border: '1px solid rgba(19, 81, 180, 0.2)',
          borderRadius: 8, marginBottom: 20,
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: 4,
            background: 'linear-gradient(135deg, #1351B4, #0C326F)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: '#fff', fontWeight: 800,
          }}>G</div>
          <span style={{ fontSize: 12, color: '#1351B4', fontWeight: 600 }}>
            Assinatura verificada pelo Gov.br
          </span>
        </div>

        <div style={{ fontSize: 11.5, color: theme.colors.textFaint, lineHeight: 1.6, marginBottom: 20 }}>
          Esta assinatura possui validade juridica conforme MP 2.200-2/2001, Art. 10, §2o.
          O documento foi assinado eletronicamente com autenticacao via plataforma Gov.br do Governo Federal.
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {type === 'client' && (
            <button
              onClick={() => navigate('/cliente')}
              style={{
                padding: '12px 28px', borderRadius: 8, border: 'none',
                background: theme.colors.primary, color: '#fff', fontWeight: 600,
                fontSize: 14, cursor: 'pointer',
              }}
            >
              Voltar ao portal
            </button>
          )}
          <button
            onClick={() => window.close()}
            style={{
              padding: '12px 28px', borderRadius: 8,
              border: `1px solid ${theme.colors.border}`,
              background: 'transparent', color: theme.colors.textSecondary, fontWeight: 500,
              fontSize: 14, cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

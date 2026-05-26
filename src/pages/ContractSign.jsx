// src/pages/ContractSign.jsx — Public contract signing page with typed signature + OTP
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api'
import theme from '../styles/theme'

// CPF validation
function validateCPF(cpf) {
  cpf = cpf.replace(/\D/g, '')
  if (cpf.length !== 11) return false
  if (/^(\d)\1+$/.test(cpf)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i)
  let d1 = 11 - (sum % 11); if (d1 >= 10) d1 = 0
  if (parseInt(cpf[9]) !== d1) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i)
  let d2 = 11 - (sum % 11); if (d2 >= 10) d2 = 0
  return parseInt(cpf[10]) === d2
}

function maskCPF(v) {
  v = v.replace(/\D/g, '').slice(0, 11)
  if (v.length > 9) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4')
  if (v.length > 6) return v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3')
  if (v.length > 3) return v.replace(/(\d{3})(\d{1,3})/, '$1.$2')
  return v
}

// Cursive font styles (Google Font loaded dynamically)
const CURSIVE_FONTS = [
  { name: 'Dancing Script', label: 'Cursiva' },
  { name: 'Great Vibes', label: 'Elegante' },
  { name: 'Caveat', label: 'Manuscrita' },
]

export default function ContractSign() {
  const { token } = useParams()
  const [contract, setContract] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('review') // review → sign → otp → done
  const [signerName, setSignerName] = useState('')
  const [signerCPF, setSignerCPF] = useState('')
  const [cpfError, setCpfError] = useState('')
  const [selectedFont, setSelectedFont] = useState(CURSIVE_FONTS[0].name)
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpEmail, setOtpEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [signedAt, setSignedAt] = useState(null)
  const [fontsLoaded, setFontsLoaded] = useState(false)

  // Load Google Fonts
  useEffect(() => {
    const families = CURSIVE_FONTS.map(f => f.name.replace(/ /g, '+')).join('&family=')
    const link = document.createElement('link')
    link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`
    link.rel = 'stylesheet'
    document.head.appendChild(link)
    link.onload = () => setFontsLoaded(true)
    setTimeout(() => setFontsLoaded(true), 2000) // fallback
    return () => { try { document.head.removeChild(link) } catch {} }
  }, [])

  useEffect(() => {
    loadContract()
  }, [token])

  async function loadContract() {
    try {
      const data = await api.contracts.getForSigning(token)
      if (data.error) {
        if (data.already_signed) {
          setError('Este contrato ja foi assinado.')
        } else {
          setError(data.error)
        }
      } else {
        setContract(data)
        setSignerName(data.signer_name || '')
      }
    } catch (err) {
      setError('Erro ao carregar contrato.')
    } finally {
      setLoading(false)
    }
  }

  // Generate signature image from typed name using canvas (for PDF/audit)
  function generateSignatureImage() {
    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 150
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = `48px '${selectedFont}', cursive`
    ctx.fillStyle = '#111'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(signerName, canvas.width / 2, canvas.height / 2)
    return canvas.toDataURL('image/png')
  }

  async function handleSendOTP() {
    const rawCpf = signerCPF.replace(/\D/g, '')
    if (rawCpf.length !== 11 || !validateCPF(rawCpf)) {
      setCpfError('CPF invalido')
      return
    }
    setCpfError('')

    if (!signerName.trim()) {
      alert('Informe seu nome completo')
      return
    }

    setSubmitting(true)
    try {
      const data = await api.contracts.sendOTP(token)
      if (data.error) {
        alert(data.error)
      } else {
        setOtpSent(true)
        setOtpEmail(data.email_sent_to || '')
        setStep('otp')
      }
    } catch (err) {
      alert('Erro ao enviar codigo')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerify() {
    if (otpCode.length !== 6) {
      alert('Digite o codigo de 6 digitos')
      return
    }
    setSubmitting(true)
    try {
      let geolocation = null
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        )
        geolocation = `${pos.coords.latitude},${pos.coords.longitude}`
      } catch {}

      const data = await api.contracts.verifySignature(token, {
        otp: otpCode,
        signer_name: signerName,
        signer_cpf: signerCPF,
        signature_image: generateSignatureImage(),
        signature_font: selectedFont,
        geolocation,
      })
      if (data.error) {
        alert(data.error)
      } else {
        setSignedAt(data.signed_at)
        setStep('done')
      }
    } catch (err) {
      alert('Erro ao verificar codigo')
    } finally {
      setSubmitting(false)
    }
  }

  // Party helpers
  function getPartyTypeLabel(tipo) {
    if (tipo === 'pj') return 'pessoa juridica de direito privado'
    if (tipo === 'mei') return 'microempreendedor individual'
    return 'pessoa fisica'
  }

  function formatPartyDoc(prefix) {
    const tipo = contract[`${prefix}_tipo`] || 'pf'
    const cnpj = contract[`${prefix}_cnpj`]
    const cpf = contract[`${prefix}_cpf`]
    const parts = []
    if ((tipo === 'pj' || tipo === 'mei') && cnpj) parts.push(`inscrita no CNPJ sob o n. ${cnpj}`)
    if (cpf) parts.push(`CPF n. ${cpf}`)
    return parts.join(', ')
  }

  function getTopics(clause) {
    if (clause.topics && Array.isArray(clause.topics)) {
      if (clause.topics.length > 0 && typeof clause.topics[0] === 'string') {
        return clause.topics.map(t => ({ text: t, subtopics: [] }))
      }
      return clause.topics
    }
    return []
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: theme.colors.bg }}>
      <div style={{ color: theme.colors.textMuted, fontSize: 14 }}>Carregando contrato...</div>
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: theme.colors.bg }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <div style={{ color: theme.colors.text, fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{error}</div>
        <div style={{ color: theme.colors.textMuted, fontSize: 13 }}>Entre em contato com quem enviou este contrato.</div>
      </div>
    </div>
  )

  if (step === 'done') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: theme.colors.bg }}>
      <div style={{ textAlign: 'center', padding: 40, maxWidth: 440 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <h1 style={{ color: theme.colors.text, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Contrato Assinado!</h1>
        <p style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          Sua assinatura foi registrada com sucesso em {new Date(signedAt).toLocaleString('pt-BR')}.
        </p>
        <div style={{ background: theme.colors.bgSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: 10, padding: 16, fontSize: 12, color: theme.colors.textMuted, textAlign: 'left' }}>
          <div><strong>Documento:</strong> {contract.title}</div>
          <div><strong>Assinante:</strong> {signerName}</div>
          <div><strong>CPF:</strong> {signerCPF}</div>
          <div style={{ marginTop: 8 }}><strong>Hash:</strong> <span style={{ fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-all' }}>{contract.document_hash}</span></div>
        </div>
      </div>
    </div>
  )

  const clauses = contract.clauses || []

  return (
    <div style={{ minHeight: '100vh', background: theme.colors.bg, padding: '32px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ color: theme.colors.primary, fontSize: 20, fontWeight: 700, margin: 0 }}>Audiovisual Nexus</h1>
          <p style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 6 }}>Assinatura Digital de Contrato</p>
        </div>

        {/* Contract document */}
        <div style={{
          background: '#fff', color: '#111', padding: '40px 48px', borderRadius: 10,
          fontFamily: "'Inter', serif", fontSize: 13, lineHeight: 1.7, marginBottom: 24,
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}>
          <h1 style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {contract.title}
          </h1>

          {/* Parties */}
          {contract.contratante_nome && (
            <p style={{ marginBottom: 12, textAlign: 'justify', fontSize: 12.5 }}>
              <strong>CONTRATANTE: {contract.contratante_nome}</strong>
              {`, ${getPartyTypeLabel(contract.contratante_tipo)}`}
              {formatPartyDoc('contratante') && `, ${formatPartyDoc('contratante')}`}
              {contract.contratante_endereco && `, com sede na ${contract.contratante_endereco}`}
              , doravante denominado(a) simplesmente "CONTRATANTE".
            </p>
          )}
          {contract.contratado_nome && (
            <p style={{ marginBottom: 12, textAlign: 'justify', fontSize: 12.5 }}>
              <strong>CONTRATADO: {contract.contratado_nome}</strong>
              {`, ${getPartyTypeLabel(contract.contratado_tipo)}`}
              {formatPartyDoc('contratado') && `, ${formatPartyDoc('contratado')}`}
              {contract.contratado_endereco && `, residente e domiciliado(a) na ${contract.contratado_endereco}`}
              , doravante denominado(a) simplesmente "CONTRATADO".
            </p>
          )}

          {(contract.contratante_nome || contract.contratado_nome) && (
            <p style={{ marginBottom: 20, textAlign: 'justify', fontSize: 12.5 }}>
              As partes acima identificadas tem, entre si, justo e contratado o que segue:
            </p>
          )}

          {/* Clauses */}
          {clauses.map((clause, idx) => {
            const topics = getTopics(clause)
            return (
              <div key={idx} style={{ marginBottom: 18 }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>
                  CLAUSULA {idx + 1}&#170; &ndash; {clause.title}
                </h2>
                {clause.content && <p style={{ marginBottom: 6, textAlign: 'justify', fontSize: 12.5 }}>{clause.content}</p>}
                {topics.length > 0 && (
                  <div>
                    {topics.map((topic, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <p style={{ marginBottom: topic.subtopics?.length > 0 ? 3 : 0, textAlign: 'justify', fontSize: 12.5 }}>
                          <strong>{idx + 1}.{i + 1}</strong> &ndash; {topic.text}
                        </p>
                        {topic.subtopics && topic.subtopics.length > 0 && (
                          <div style={{ paddingLeft: 20 }}>
                            {topic.subtopics.map((sub, si) => (
                              <p key={si} style={{ marginBottom: 2, textAlign: 'justify', fontSize: 12 }}>* {sub}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Signature date */}
          {(contract.city || contract.contract_date) && (
            <p style={{ textAlign: 'center', marginTop: 28, fontSize: 12.5 }}>
              {contract.city || '_______________'}, {contract.contract_date || '__ de __________ de ____'}
            </p>
          )}
        </div>

        {/* Signing section */}
        {step === 'review' && (
          <div style={{
            background: theme.colors.bgSecondary, border: `1px solid ${theme.colors.border}`,
            borderRadius: 12, padding: 28,
          }}>
            <h2 style={{ color: theme.colors.text, fontSize: 16, fontWeight: 600, marginBottom: 16, textAlign: 'center' }}>
              Assinar Contrato
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Signer name */}
              <div>
                <label style={{ display: 'block', fontSize: 12, color: theme.colors.textMuted, marginBottom: 4, fontWeight: 500 }}>Nome completo</label>
                <input
                  value={signerName}
                  onChange={e => setSignerName(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${theme.colors.border}`, background: theme.colors.bg, color: theme.colors.text, fontSize: 14 }}
                  placeholder="Seu nome completo"
                />
              </div>

              {/* CPF */}
              <div>
                <label style={{ display: 'block', fontSize: 12, color: theme.colors.textMuted, marginBottom: 4, fontWeight: 500 }}>CPF</label>
                <input
                  value={signerCPF}
                  onChange={e => { setSignerCPF(maskCPF(e.target.value)); setCpfError('') }}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${cpfError ? theme.colors.danger : theme.colors.border}`, background: theme.colors.bg, color: theme.colors.text, fontSize: 14 }}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
                {cpfError && <div style={{ fontSize: 11, color: theme.colors.danger, marginTop: 4 }}>{cpfError}</div>}
              </div>

              {/* Typed signature preview */}
              <div>
                <label style={{ display: 'block', fontSize: 12, color: theme.colors.textMuted, marginBottom: 4, fontWeight: 500 }}>
                  Sua assinatura digital
                </label>

                {/* Font selector */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {CURSIVE_FONTS.map(f => (
                    <button
                      key={f.name}
                      onClick={() => setSelectedFont(f.name)}
                      style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                        border: `1px solid ${selectedFont === f.name ? theme.colors.primary + '66' : theme.colors.border}`,
                        background: selectedFont === f.name ? theme.colors.primaryMuted : 'transparent',
                        color: selectedFont === f.name ? theme.colors.primary : theme.colors.textMuted,
                        fontWeight: 500,
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Signature preview box */}
                <div style={{
                  background: '#fff', borderRadius: 8, padding: '20px 24px',
                  border: `1px solid ${theme.colors.border}`,
                  minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                  {signerName.trim() ? (
                    <div style={{
                      fontFamily: `'${selectedFont}', cursive`,
                      fontSize: 36, color: '#111', lineHeight: 1.2,
                      userSelect: 'none', textAlign: 'center',
                    }}>
                      {signerName}
                    </div>
                  ) : (
                    <div style={{ color: '#bbb', fontSize: 14, fontStyle: 'italic' }}>
                      Digite seu nome acima para visualizar
                    </div>
                  )}
                  {/* Signature line */}
                  <div style={{
                    position: 'absolute', bottom: 16, left: 24, right: 24,
                    height: 1, background: '#ddd',
                  }} />
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleSendOTP}
                disabled={submitting || !signerName.trim() || !signerCPF}
                style={{
                  width: '100%', padding: '14px', borderRadius: 8, border: 'none',
                  background: theme.colors.primary, color: '#fff', fontWeight: 600,
                  fontSize: 14, cursor: 'pointer', marginTop: 8,
                  opacity: (submitting || !signerName.trim() || !signerCPF) ? 0.5 : 1,
                }}
              >
                {submitting ? 'Enviando...' : 'Enviar codigo de verificacao'}
              </button>

              <p style={{ fontSize: 11.5, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 1.5 }}>
                Ao assinar, voce concorda com os termos deste contrato. Um codigo de 6 digitos sera enviado ao seu email para confirmar a assinatura.
              </p>
            </div>
          </div>
        )}

        {/* OTP verification step */}
        {step === 'otp' && (
          <div style={{
            background: theme.colors.bgSecondary, border: `1px solid ${theme.colors.border}`,
            borderRadius: 12, padding: 28, textAlign: 'center',
          }}>
            <h2 style={{ color: theme.colors.text, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Verificacao de identidade
            </h2>
            <p style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 20 }}>
              Enviamos um codigo de 6 digitos para <strong style={{ color: theme.colors.text }}>{otpEmail}</strong>
            </p>

            <input
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{
                width: 200, padding: '14px', borderRadius: 8, border: `1px solid ${theme.colors.border}`,
                background: theme.colors.bg, color: theme.colors.text, fontSize: 24, fontWeight: 700,
                textAlign: 'center', letterSpacing: 8, fontFamily: 'monospace',
              }}
              placeholder="000000"
              maxLength={6}
              autoFocus
            />

            {/* Preview of signature being confirmed */}
            <div style={{
              margin: '20px auto', maxWidth: 400, padding: '12px 20px',
              background: '#fff', borderRadius: 8, border: `1px solid ${theme.colors.border}`,
            }}>
              <div style={{ fontSize: 10, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assinatura</div>
              <div style={{
                fontFamily: `'${selectedFont}', cursive`,
                fontSize: 28, color: '#111', textAlign: 'center',
              }}>
                {signerName}
              </div>
            </div>

            <button
              onClick={handleVerify}
              disabled={submitting || otpCode.length !== 6}
              style={{
                display: 'block', width: '100%', maxWidth: 320, margin: '20px auto 0',
                padding: '14px', borderRadius: 8, border: 'none',
                background: theme.colors.primary, color: '#fff', fontWeight: 600,
                fontSize: 14, cursor: 'pointer',
                opacity: (submitting || otpCode.length !== 6) ? 0.5 : 1,
              }}
            >
              {submitting ? 'Verificando...' : 'Confirmar assinatura'}
            </button>

            <button
              onClick={handleSendOTP}
              disabled={submitting}
              style={{
                display: 'block', margin: '12px auto 0', background: 'transparent',
                border: 'none', color: theme.colors.primary, fontSize: 12, cursor: 'pointer',
              }}
            >
              Reenviar codigo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// src/pages/ContractValidation.jsx — validate externally signed PDF contracts
import { useState, useEffect, useRef } from 'react'
import api from '../api'
import theme from '../styles/theme'
import Modal from '../components/Modal'
import {
  Icon, Spinner, Badge,
  panelStyle, btnPrimary, btnSoft, btnGhost, fmtBRL,
} from '../components/ui'

const STATUS_MAP = {
  valid: { label: 'Válido', color: 'mint', icon: 'check' },
  partially_valid: { label: 'Parcialmente válido', color: 'gold', icon: 'alert' },
  invalid: { label: 'Inválido', color: 'rose', icon: 'x' },
  error: { label: 'Erro', color: 'rose', icon: 'x' },
  pending: { label: 'Pendente', color: 'default', icon: 'clock' },
}

const OBS_ICON = {
  success: { icon: 'check', color: theme.colors.mint },
  warning: { icon: 'alert', color: theme.colors.warm },
  error: { icon: 'x', color: theme.colors.danger },
  info: { icon: 'info', color: theme.colors.primary },
}

export default function ContractValidation() {
  const [tab, setTab] = useState('validate')
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [validating, setValidating] = useState(false)
  const [report, setReport] = useState(null)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [detailModal, setDetailModal] = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    if (tab === 'history') loadHistory()
  }, [tab])

  function loadHistory() {
    setHistoryLoading(true)
    api.contracts.getValidations()
      .then(setHistory)
      .catch(console.error)
      .finally(() => setHistoryLoading(false))
  }

  async function handleValidate() {
    if (!file) return
    setValidating(true)
    setReport(null)
    try {
      const result = await api.contracts.validate(file)
      setReport(result)
    } catch (err) {
      setReport({ status: 'error', observations: [{ type: 'error', message: err.message }] })
    } finally {
      setValidating(false)
    }
  }

  async function openDetail(validation) {
    setDetailModal({ ...validation, loading: true })
    try {
      const full = await api.contracts.getValidation(validation.id)
      setDetailModal({ ...full, report: full.report, loading: false })
    } catch (err) {
      setDetailModal(prev => ({ ...prev, loading: false, error: err.message }))
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.type === 'application/pdf') {
      setFile(f)
      setReport(null)
    }
  }

  function handleFileSelect(e) {
    const f = e.target.files[0]
    if (f) { setFile(f); setReport(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>contratos</div>
          <h2 className="display" style={{ fontSize: 28, margin: 0, color: theme.colors.text }}>
            Validador de assinaturas digitais
          </h2>
        </div>
        <div style={{
          display: 'flex', padding: 4,
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: 10, gap: 2,
        }}>
          {[{ id: 'validate', label: 'Validar' }, { id: 'history', label: 'Historico' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '7px 14px', borderRadius: 7,
              fontSize: 12.5, fontWeight: tab === t.id ? 500 : 400,
              color: tab === t.id ? theme.colors.text : theme.colors.textMuted,
              background: tab === t.id ? theme.colors.surfaceHover : 'transparent',
              border: 'none', cursor: 'pointer',
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'validate' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Upload area */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              ...panelStyle,
              padding: 48, textAlign: 'center', cursor: 'pointer',
              border: `2px dashed ${dragging ? theme.colors.primary : theme.colors.border}`,
              background: dragging ? theme.colors.primaryMuted : theme.colors.bgSecondary,
              borderRadius: 16, transition: 'all 0.2s',
            }}
          >
            <input ref={fileRef} type="file" accept=".pdf" onChange={handleFileSelect} style={{ display: 'none' }} />
            <div style={{ marginBottom: 12 }}>
              <Icon name="upload" size={32} color={file ? theme.colors.mint : theme.colors.textMuted} />
            </div>
            {file ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 600, color: theme.colors.text, marginBottom: 4 }}>
                  {file.name}
                </div>
                <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
                  {(file.size / 1024).toFixed(0)} KB — Clique para trocar
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, color: theme.colors.text, marginBottom: 4 }}>
                  Arraste o PDF assinado aqui
                </div>
                <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
                  ou clique para selecionar — PDF com assinatura digital Gov.br / ICP-Brasil
                </div>
              </>
            )}
          </div>

          {file && !validating && !report && (
            <button onClick={handleValidate} style={{ ...btnPrimary, alignSelf: 'center', padding: '12px 32px', fontSize: 14 }}>
              Validar contrato
            </button>
          )}

          {validating && (
            <div style={{ ...panelStyle, padding: 48, textAlign: 'center' }}>
              <Spinner />
              <div style={{ marginTop: 16, fontSize: 14, color: theme.colors.textMuted }}>
                Analisando assinaturas digitais, texto e integridade do documento...
              </div>
            </div>
          )}

          {/* Report */}
          {report && <ValidationReport report={report} />}
        </div>
      )}

      {tab === 'history' && (
        <div>
          {historyLoading ? <Spinner /> : history.length === 0 ? (
            <div style={{ ...panelStyle, padding: 48, textAlign: 'center', color: theme.colors.textMuted, fontSize: 13 }}>
              Nenhuma validacao realizada ainda
            </div>
          ) : (
            <div style={{ ...panelStyle, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: theme.colors.bgSecondary }}>
                    {['Arquivo', 'Status', 'Assinaturas', 'Confianca', 'Validado por', 'Data'].map(h => (
                      <th key={h} className="eyebrow" style={{ padding: '12px 16px', textAlign: 'left', borderBottom: `1px solid ${theme.colors.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(v => {
                    const st = STATUS_MAP[v.status] || STATUS_MAP.pending
                    return (
                      <tr key={v.id} className="row-hover" onClick={() => openDetail(v)}
                        style={{ cursor: 'pointer', borderBottom: `1px solid ${theme.colors.borderSoft}` }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: theme.colors.text }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Icon name="file" size={14} color={theme.colors.textMuted} />
                            {v.filename}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <Badge color={st.color}>{st.label}</Badge>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13 }} className="mono tnum">{v.signature_count}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <ConfidenceBar value={v.confidence} />
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: theme.colors.textMuted }}>{v.validated_by}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: theme.colors.textMuted }}>
                          {new Date(v.created_at).toLocaleDateString('pt-BR')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Detail modal */}
      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title="Detalhes da validacao" width={720}>
        {detailModal?.loading ? <Spinner /> : detailModal?.report ? (
          <ValidationReport report={detailModal.report} compact />
        ) : detailModal?.error ? (
          <div style={{ color: theme.colors.danger }}>{detailModal.error}</div>
        ) : null}
      </Modal>
    </div>
  )
}

// ============================================================
// VALIDATION REPORT COMPONENT
// ============================================================

function ValidationReport({ report, compact = false }) {
  const st = STATUS_MAP[report.status] || STATUS_MAP.pending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 14 : 20 }}>
      {/* Status hero */}
      <div style={{
        ...panelStyle, padding: 0, overflow: 'hidden',
        border: `1px solid ${
          report.status === 'valid' ? theme.colors.mint + '44' :
          report.status === 'partially_valid' ? theme.colors.warm + '44' :
          theme.colors.danger + '44'
        }`,
      }}>
        <div style={{
          padding: compact ? '20px 24px' : '28px 32px',
          display: 'flex', alignItems: 'center', gap: 20,
          background: report.status === 'valid' ? 'rgba(0,210,150,0.05)' :
            report.status === 'partially_valid' ? 'rgba(255,183,77,0.05)' : 'rgba(255,100,100,0.05)',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: report.status === 'valid' ? 'rgba(0,210,150,0.15)' :
              report.status === 'partially_valid' ? 'rgba(255,183,77,0.15)' : 'rgba(255,100,100,0.15)',
          }}>
            <Icon name={st.icon} size={24} color={
              report.status === 'valid' ? theme.colors.mint :
              report.status === 'partially_valid' ? theme.colors.warm : theme.colors.danger
            } />
          </div>
          <div style={{ flex: 1 }}>
            <div className="display" style={{ fontSize: compact ? 20 : 24, color: theme.colors.text }}>
              Contrato {st.label}
            </div>
            {report.title && (
              <div style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>{report.title}</div>
            )}
          </div>
          <ConfidenceBar value={report.confidence} large />
        </div>

        {/* Quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: `1px solid ${theme.colors.border}` }}>
          {[
            { k: 'Assinaturas', v: report.signatureCount || 0 },
            { k: 'Signatarios', v: report.signers?.length || 0 },
            { k: 'Datas no doc', v: report.dates?.length || 0 },
            { k: 'Paginas', v: report.pageCount || '—' },
          ].map((m, i) => (
            <div key={i} style={{
              padding: '14px 20px',
              borderRight: i < 3 ? `1px solid ${theme.colors.border}` : 'none',
            }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>{m.k}</div>
              <div className="display tnum" style={{ fontSize: 20, color: theme.colors.text }}>{m.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Signers */}
      {report.signers && report.signers.length > 0 && (
        <div style={{ ...panelStyle, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${theme.colors.border}` }}>
            <h3 className="display" style={{ fontSize: 16, margin: 0, color: theme.colors.text }}>Signatarios</h3>
          </div>
          {report.signers.map((s, i) => (
            <div key={i} style={{
              padding: '16px 20px',
              borderBottom: i < report.signers.length - 1 ? `1px solid ${theme.colors.borderSoft}` : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: theme.colors.primaryMuted, color: theme.colors.primary,
                    fontSize: 13, fontWeight: 600,
                  }}>
                    {(s.name || '?')[0]}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text }}>{s.name}</div>
                    {s.organization && <div style={{ fontSize: 11.5, color: theme.colors.textMuted }}>{s.organization}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Badge color={
                    s.signatureType === 'icp-brasil' || s.signatureType === 'govbr' ? 'mint' :
                    s.signatureType === 'pades' ? 'blue' : 'default'
                  }>
                    {s.signatureType === 'icp-brasil' ? 'ICP-Brasil' :
                     s.signatureType === 'govbr' ? 'Gov.br' :
                     s.signatureType === 'pades' ? 'PAdES' : s.signatureType}
                  </Badge>
                  <Badge color={s.certificateValid ? 'mint' : 'rose'}>
                    {s.certificateValid ? 'Certificado valido' : 'Certificado expirado'}
                  </Badge>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { k: 'Data assinatura', v: s.signDateFormatted || '—' },
                  { k: 'Emissor', v: s.issuer || '—' },
                  { k: 'Integridade', v: s.integrityValid ? 'Verificada' : 'Nao confirmada' },
                ].map((f, j) => (
                  <div key={j} style={{ padding: '8px 10px', background: theme.colors.bgSecondary, borderRadius: 6 }}>
                    <div className="eyebrow" style={{ marginBottom: 2, fontSize: 9 }}>{f.k}</div>
                    <div style={{ fontSize: 12, color: theme.colors.text }}>{f.v}</div>
                  </div>
                ))}
              </div>
              {s.reason && (
                <div style={{ marginTop: 8, fontSize: 12, color: theme.colors.textMuted }}>
                  <strong>Motivo:</strong> {s.reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Contract info */}
      {(report.parties?.length > 0 || report.dates?.length > 0 || report.contractNumber || report.contractValue) && (
        <div style={{ ...panelStyle, padding: 20 }}>
          <h3 className="display" style={{ fontSize: 16, margin: 0, marginBottom: 14, color: theme.colors.text }}>Dados do contrato</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {report.contractNumber && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Numero</div>
                <div style={{ fontSize: 13, color: theme.colors.text }}>{report.contractNumber}</div>
              </div>
            )}
            {report.contractValue && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Valor</div>
                <div style={{ fontSize: 13, color: theme.colors.mint, fontWeight: 600 }}>{report.contractValue}</div>
              </div>
            )}
            {report.dates?.length > 0 && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Datas encontradas</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {report.dates.map((d, i) => {
                    const [y, m, day] = d.split('-')
                    return (
                      <span key={i} style={{
                        padding: '2px 8px', background: theme.colors.bgSecondary,
                        borderRadius: 4, fontSize: 11.5, color: theme.colors.text,
                      }}>
                        {day}/{m}/{y}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
            {report.parties?.length > 0 && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Partes identificadas no texto</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {report.parties.map((p, i) => (
                    <span key={i} style={{ fontSize: 12.5, color: theme.colors.text }}>{p}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Observations */}
      {report.observations && report.observations.length > 0 && (
        <div style={{ ...panelStyle, padding: 20 }}>
          <h3 className="display" style={{ fontSize: 16, margin: 0, marginBottom: 14, color: theme.colors.text }}>Observacoes</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {report.observations.map((obs, i) => {
              const ic = OBS_ICON[obs.type] || OBS_ICON.info
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 14px', borderRadius: 8,
                  background: obs.type === 'error' ? 'rgba(255,100,100,0.06)' :
                    obs.type === 'warning' ? 'rgba(255,183,77,0.06)' :
                    obs.type === 'success' ? 'rgba(0,210,150,0.06)' : theme.colors.bgSecondary,
                }}>
                  <Icon name={ic.icon} size={14} color={ic.color} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: theme.colors.text, lineHeight: 1.5 }}>{obs.message}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Signature types legend */}
      {report.signatureTypes && report.signatureTypes.length > 0 && (
        <div style={{ fontSize: 11, color: theme.colors.textFaint, padding: '0 4px' }}>
          Tipos de assinatura detectados: {report.signatureTypes.map(t =>
            t === 'icp-brasil' ? 'ICP-Brasil' : t === 'govbr' ? 'Gov.br' : t === 'pades' ? 'PAdES' : t
          ).join(', ')}
          {' '} — Validado em {new Date(report.validatedAt).toLocaleString('pt-BR')}
        </div>
      )}
    </div>
  )
}

function ConfidenceBar({ value, large = false }) {
  const color = value >= 70 ? theme.colors.mint : value >= 40 ? theme.colors.warm : theme.colors.danger
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: large ? 80 : 60, height: large ? 6 : 4,
        background: theme.colors.bgSecondary, borderRadius: 3,
      }}>
        <div style={{
          width: `${value}%`, height: '100%',
          background: color, borderRadius: 3,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <span className="mono tnum" style={{
        fontSize: large ? 14 : 11, fontWeight: 600, color,
      }}>
        {value}%
      </span>
    </div>
  )
}

// src/pages/LandingPage.jsx — Landing page publica do Nexus SaaS
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'

const colors = {
  bg: '#0a0d13',
  bgSecondary: '#0f131c',
  surface: '#141925',
  border: '#1d2230',
  borderLight: '#2a3142',
  text: '#ecebe5',
  textSecondary: '#c8c9c4',
  textMuted: '#8a8d96',
  textFaint: '#555864',
  primary: '#7fdbff',
  primaryHover: '#a5e6ff',
  primaryMuted: 'rgba(127, 219, 255, 0.12)',
  success: '#7ce0b8',
  warm: '#ff8a6b',
  gold: '#d9b770',
  danger: '#f47383',
}

const FEATURES = [
  {
    icon: '📋',
    title: 'Kanban por Cliente',
    desc: 'Organize pedidos em quadros visuais com colunas personalizaveis. Arraste e solte para atualizar o status.',
  },
  {
    icon: '👥',
    title: 'Equipe Multi-Editor',
    desc: 'Convide editores para sua equipe. Atribua pedidos, acompanhe entregas e gerencie pagamentos.',
  },
  {
    icon: '💬',
    title: 'Portal do Cliente',
    desc: 'Seus clientes aprovam ou pedem correcoes diretamente na plataforma. Sem WhatsApp, sem confusao.',
  },
  {
    icon: '💰',
    title: 'Financeiro Integrado',
    desc: 'Faturas para clientes, lotes de pagamento para editores e visao geral mensal completa.',
  },
  {
    icon: '📅',
    title: 'Calendario de Entregas',
    desc: 'Visualize todos os prazos do mes em um calendario intuitivo. Nunca perca uma entrega.',
  },
  {
    icon: '📊',
    title: 'Relatorios de Performance',
    desc: 'Acompanhe a produtividade de cada editor: pedidos entregues, pontualidade e valores.',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [plans, setPlans] = useState([])
  const [stats, setStats] = useState(null)

  useEffect(() => {
    api.public.plans().then(d => {
      const arr = Array.isArray(d) ? d : d.plans || []
      setPlans(arr)
    }).catch(() => {})
    api.public.stats().then(d => setStats(d)).catch(() => {})
  }, [])

  const dashPath = '/dashboard'

  return (
    <div style={{ background: colors.bg, color: colors.text, minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px',
        background: 'rgba(10, 13, 19, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.warm})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 18, color: colors.bg,
          }}>N</div>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Nexus</span>
          <span style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>Audiovisual</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {user ? (
            <button
              onClick={() => navigate(dashPath)}
              style={{
                padding: '9px 22px', borderRadius: 8,
                background: colors.primary,
                border: 'none',
                color: colors.bg, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseOver={e => e.target.style.background = colors.primaryHover}
              onMouseOut={e => e.target.style.background = colors.primary}
            >
              Ir para o painel
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate('/login')}
                style={{
                  padding: '9px 22px', borderRadius: 8,
                  background: 'transparent',
                  border: `1px solid ${colors.borderLight}`,
                  color: colors.textSecondary, fontSize: 14, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
                onMouseOver={e => e.target.style.borderColor = colors.primary}
                onMouseOut={e => e.target.style.borderColor = colors.borderLight}
              >
                Entrar
              </button>
              <button
                onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                style={{
                  padding: '9px 22px', borderRadius: 8,
                  background: colors.primary,
                  border: 'none',
                  color: colors.bg, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
                onMouseOver={e => e.target.style.background = colors.primaryHover}
                onMouseOut={e => e.target.style.background = colors.primary}
              >
                Comecar Agora
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        maxWidth: 900, margin: '0 auto',
        padding: '100px 32px 80px',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-block',
          padding: '5px 16px', borderRadius: 20,
          background: colors.primaryMuted,
          color: colors.primary,
          fontSize: 13, fontWeight: 600,
          marginBottom: 24,
          border: `1px solid rgba(127, 219, 255, 0.15)`,
        }}>
          Plataforma completa para gestao audiovisual
        </div>

        <h1 style={{
          fontSize: 'clamp(36px, 5vw, 56px)',
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          margin: '0 0 20px',
        }}>
          Gerencie sua produtora{' '}
          <span style={{
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.warm})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            audiovisual
          </span>
          {' '}em um so lugar
        </h1>

        <p style={{
          fontSize: 18, color: colors.textMuted,
          maxWidth: 600, margin: '0 auto 40px',
          lineHeight: 1.6,
        }}>
          Kanban de pedidos, portal do cliente, equipe de editores, financeiro e muito mais.
          Tudo que voce precisa para escalar sua agencia de video.
        </p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          {user ? (
            <button
              onClick={() => navigate(dashPath)}
              style={{
                padding: '14px 36px', borderRadius: 10,
                background: colors.primary,
                border: 'none',
                color: colors.bg, fontSize: 16, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: `0 0 30px rgba(127, 219, 255, 0.2)`,
              }}
              onMouseOver={e => { e.target.style.background = colors.primaryHover; e.target.style.transform = 'translateY(-2px)' }}
              onMouseOut={e => { e.target.style.background = colors.primary; e.target.style.transform = 'none' }}
            >
              Acessar Painel
            </button>
          ) : (
            <>
              <button
                onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                style={{
                  padding: '14px 36px', borderRadius: 10,
                  background: colors.primary,
                  border: 'none',
                  color: colors.bg, fontSize: 16, fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: `0 0 30px rgba(127, 219, 255, 0.2)`,
                }}
                onMouseOver={e => { e.target.style.background = colors.primaryHover; e.target.style.transform = 'translateY(-2px)' }}
                onMouseOut={e => { e.target.style.background = colors.primary; e.target.style.transform = 'none' }}
              >
                Ver Planos
              </button>
              <button
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                style={{
                  padding: '14px 36px', borderRadius: 10,
                  background: colors.surface,
                  border: `1px solid ${colors.borderLight}`,
                  color: colors.textSecondary, fontSize: 16, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                Ver Recursos
              </button>
            </>
          )}
        </div>

        {/* Stats */}
        {stats && (
          <div style={{
            display: 'flex', gap: 40, justifyContent: 'center',
            marginTop: 64, flexWrap: 'wrap',
          }}>
            {[
              { value: stats.companies || '0', label: 'Produtoras ativas' },
              { value: stats.orders || '0', label: 'Pedidos gerenciados' },
              { value: stats.editors || '0', label: 'Editores na plataforma' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 36, fontWeight: 800, color: colors.primary }}>{s.value}+</div>
                <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Features */}
      <section id="features" style={{
        maxWidth: 1100, margin: '0 auto',
        padding: '60px 32px 80px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
            Tudo que voce precisa
          </h2>
          <p style={{ color: colors.textMuted, fontSize: 16 }}>
            Ferramentas profissionais para gestores de agencias audiovisuais
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 20,
        }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              background: colors.bgSecondary,
              border: `1px solid ${colors.border}`,
              borderRadius: 14,
              padding: '28px 24px',
              transition: 'border-color 0.2s, transform 0.2s',
              cursor: 'default',
            }}
              onMouseOver={e => { e.currentTarget.style.borderColor = colors.borderLight; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.transform = 'none' }}
            >
              <div style={{ fontSize: 28, marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 8px' }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: colors.textMuted, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{
        maxWidth: plans.length > 1 ? 1200 : 600, margin: '0 auto',
        padding: '60px 32px 80px',
        textAlign: 'center',
      }}>
        <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
          {plans.length > 1 ? 'Escolha o plano ideal' : 'Preco simples e transparente'}
        </h2>
        <p style={{ color: colors.textMuted, fontSize: 16, marginBottom: 40 }}>
          {plans.length > 1 ? 'Planos para cada etapa do seu negocio.' : 'Um unico plano com acesso completo.'}
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: plans.length > 1 ? `repeat(${Math.min(plans.length, 4)}, 1fr)` : '1fr',
          gap: 20,
          maxWidth: plans.length === 1 ? 420 : undefined,
          margin: plans.length === 1 ? '0 auto' : undefined,
        }}>
          {plans.map(plan => (
            <PlanCard key={plan.id} plan={plan} navigate={navigate} user={user} dashPath={dashPath} />
          ))}
        </div>

        {plans.length === 0 && (
          <div style={{
            background: colors.bgSecondary,
            border: `1px solid ${colors.borderLight}`,
            borderRadius: 18,
            padding: '40px 36px',
            maxWidth: 420,
            margin: '0 auto',
          }}>
            <div style={{
              display: 'inline-block',
              padding: '4px 14px', borderRadius: 16,
              background: colors.primaryMuted,
              color: colors.primary,
              fontSize: 12, fontWeight: 600,
              marginBottom: 16,
            }}>
              Profissional
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 48, fontWeight: 800 }}>R$97</span>
              <span style={{ fontSize: 16, color: colors.textMuted }}>/mes</span>
            </div>
            <p style={{ color: colors.textMuted, fontSize: 14, marginBottom: 28 }}>
              Acesso completo a todas as ferramentas
            </p>
            <button
              onClick={() => navigate(user ? dashPath : '/register')}
              style={{
                width: '100%',
                padding: '14px', borderRadius: 10,
                background: colors.primary,
                border: 'none',
                color: colors.bg, fontSize: 16, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseOver={e => e.target.style.background = colors.primaryHover}
              onMouseOut={e => e.target.style.background = colors.primary}
            >
              {user ? 'Acessar Painel' : 'Comecar Agora'}
            </button>
          </div>
        )}
      </section>

      {/* CTA */}
      <section style={{
        maxWidth: 800, margin: '0 auto',
        padding: '60px 32px 100px',
        textAlign: 'center',
      }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 16px' }}>
          Pronto para profissionalizar sua gestao?
        </h2>
        <p style={{ color: colors.textMuted, fontSize: 16, marginBottom: 32 }}>
          Junte-se a gestores que ja simplificaram sua operacao com o Nexus.
        </p>
        <button
          onClick={() => user ? navigate(dashPath) : document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
          style={{
            padding: '14px 40px', borderRadius: 10,
            background: colors.primary,
            border: 'none',
            color: colors.bg, fontSize: 16, fontWeight: 700,
            cursor: 'pointer', transition: 'all 0.2s',
            boxShadow: `0 0 30px rgba(127, 219, 255, 0.2)`,
          }}
          onMouseOver={e => { e.target.style.background = colors.primaryHover; e.target.style.transform = 'translateY(-2px)' }}
          onMouseOut={e => { e.target.style.background = colors.primary; e.target.style.transform = 'none' }}
        >
          {user ? 'Acessar Painel' : 'Escolher meu plano'}
        </button>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '24px 32px',
        borderTop: `1px solid ${colors.border}`,
        textAlign: 'center',
        color: colors.textFaint,
        fontSize: 13,
      }}>
        © {new Date().getFullYear()} Nexus Audiovisual. Todos os direitos reservados.
      </footer>
    </div>
  )
}

function PlanCard({ plan, navigate, user, dashPath }) {
  const benefits = Array.isArray(plan.benefits) ? plan.benefits : []
  const hasBenefits = benefits.length > 0

  return (
    <div style={{
      background: colors.bgSecondary,
      border: plan.featured ? `2px solid ${colors.warm}` : `1px solid ${colors.borderLight}`,
      borderRadius: 18,
      padding: '40px 28px 32px',
      position: 'relative',
      overflow: 'hidden',
      textAlign: 'left',
    }}>
      {/* Glow effect */}
      <div style={{
        position: 'absolute', top: -60, right: -60,
        width: 200, height: 200, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(127, 219, 255, 0.08), transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Featured badge */}
      {plan.featured ? (
        <div style={{
          display: 'inline-block',
          padding: '5px 14px', borderRadius: 16,
          background: 'rgba(255,138,107,0.15)',
          color: colors.warm,
          fontSize: 11, fontWeight: 700,
          marginBottom: 16,
          border: '1px solid rgba(255,138,107,0.25)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          ★ Mais escolhido
        </div>
      ) : (
        <div style={{
          display: 'inline-block',
          padding: '4px 14px', borderRadius: 16,
          background: colors.primaryMuted,
          color: colors.primary,
          fontSize: 12, fontWeight: 600,
          marginBottom: 16,
        }}>
          {plan.name}
        </div>
      )}

      {plan.featured && (
        <div style={{
          fontSize: 13, fontWeight: 600, color: colors.textMuted, marginBottom: 4,
        }}>
          {plan.name}
        </div>
      )}

      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 44, fontWeight: 800 }}>
          R${plan.price % 1 === 0 ? plan.price.toFixed(0) : plan.price.toFixed(2).replace('.', ',')}
        </span>
        <span style={{ fontSize: 16, color: colors.textMuted }}>/mes</span>
      </div>

      {plan.type && (
        <div style={{ fontSize: 12, color: colors.textFaint, marginBottom: 4 }}>
          {plan.type}
        </div>
      )}

      {plan.description && (
        <p style={{ color: colors.textMuted, fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
          {plan.description}
        </p>
      )}

      {/* Benefits from plan config */}
      {hasBenefits && (
        <div style={{ marginBottom: 28 }}>
          {benefits.map((b, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 0',
              color: b.included ? colors.textSecondary : colors.textFaint,
              fontSize: 13.5,
            }}>
              <span style={{
                color: b.included ? colors.success : colors.danger,
                fontSize: 14, fontWeight: 700, width: 18, textAlign: 'center', flexShrink: 0,
              }}>
                {b.included ? '✓' : '✕'}
              </span>
              <span style={{
                textDecoration: b.included ? 'none' : 'none',
              }}>
                {b.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Discount tiers */}
      {(plan.discount_3m > 0 || plan.discount_6m > 0 || plan.discount_12m > 0) && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: colors.textFaint, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Descontos por antecipacao
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {plan.discount_3m > 0 && (
              <span style={{
                padding: '4px 10px', borderRadius: 6,
                background: 'rgba(0,210,150,0.1)', color: colors.success,
                fontSize: 11, fontWeight: 600,
              }}>
                3 meses: -{plan.discount_3m}%
              </span>
            )}
            {plan.discount_6m > 0 && (
              <span style={{
                padding: '4px 10px', borderRadius: 6,
                background: 'rgba(0,210,150,0.1)', color: colors.success,
                fontSize: 11, fontWeight: 600,
              }}>
                6 meses: -{plan.discount_6m}%
              </span>
            )}
            {plan.discount_12m > 0 && (
              <span style={{
                padding: '4px 10px', borderRadius: 6,
                background: 'rgba(0,210,150,0.1)', color: colors.success,
                fontSize: 11, fontWeight: 600,
              }}>
                12 meses: -{plan.discount_12m}%
              </span>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => navigate(user ? dashPath : `/register?plan=${plan.id}`)}
        style={{
          width: '100%',
          padding: '13px', borderRadius: 10,
          background: plan.featured ? colors.warm : colors.primary,
          border: 'none',
          color: colors.bg, fontSize: 15, fontWeight: 700,
          cursor: 'pointer', transition: 'all 0.2s',
        }}
        onMouseOver={e => e.target.style.opacity = '0.85'}
        onMouseOut={e => e.target.style.opacity = '1'}
      >
        {user ? 'Acessar Painel' : 'Escolher este plano'}
      </button>

      <p style={{ fontSize: 11, color: colors.textFaint, marginTop: 10, textAlign: 'center' }}>
        Cancele quando quiser.
      </p>
    </div>
  )
}

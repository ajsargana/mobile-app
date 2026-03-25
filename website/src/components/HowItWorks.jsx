import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

const steps = [
  {
    step: '01',
    title: 'Download the App',
    desc: 'Install AURA50 from Google Play or the App Store. It\'s under 100MB and works on any Android or iOS device from the last 5 years.',
    detail: 'Free download. No credit card required.',
    color: '#E8A020',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 16l-4-4h3V4h2v8h3l-4 4z"/><path d="M20 18H4v2h16v-2z"/>
      </svg>
    ),
  },
  {
    step: '02',
    title: 'Create Your Wallet',
    desc: 'Generate a secure 24-word seed phrase in seconds. Your private key is stored exclusively in your device\'s hardware-backed secure storage.',
    detail: 'Your keys. Your coins. Nobody else\'s.',
    color: '#4FA8D5',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
  },
  {
    step: '03',
    title: 'Start Mining',
    desc: 'Plug in your charger and tap "Start Mining." AURA50 automatically mines A50 tokens while your phone charges, using a 30-second proof algorithm.',
    detail: 'Earn 2–5 A50 per day while you sleep.',
    color: '#22C55E',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    ),
  },
  {
    step: '04',
    title: 'Build Trust & Earn More',
    desc: 'The longer you participate, the more you save. After 3 years your transaction fees drop to 0.001% — 99% less than when you started.',
    detail: 'Loyalty has never paid better.',
    color: '#8B5CF6',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    ),
  },
]

export default function HowItWorks() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const isMobile = useIsMobile()

  const containerStyle = isMobile
    ? { maxWidth: 1100, margin: '0 auto', position: 'relative' }
    : { maxWidth: 'min(60vw, 720px)', marginLeft: 'auto', marginRight: '4vw', position: 'relative' }

  return (
    <section
      id="how-it-works"
      ref={ref}
      data-coin-side="left"
      style={{ position: 'relative', zIndex: 1, padding: '6rem 1rem' }}
    >
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 800, height: 400, borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(232,160,32,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={containerStyle}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '5rem' }}
        >
          <span style={{
            display: 'inline-block', color: '#22C55E',
            fontFamily: 'Space Grotesk', fontWeight: 600,
            fontSize: '0.85rem', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: '1rem',
          }}>
            Get Started
          </span>
          <h2 style={{
            fontFamily: 'Space Grotesk', fontWeight: 700,
            fontSize: 'clamp(1.8rem, 4vw, 3rem)',
            letterSpacing: '-0.02em', marginBottom: '1rem',
          }}>
            From Zero to Mining in{' '}
            <span className="text-gradient-gold">4 Minutes</span>
          </h2>
          <p style={{ color: 'rgba(232,237,245,0.6)', maxWidth: 520, margin: '0 auto', fontSize: '1.05rem' }}>
            No blockchain experience needed. No crypto jargon. Just download, create, and earn.
          </p>
        </motion.div>

        {/* Steps */}
        <div style={{ position: 'relative' }}>
          {/* Connecting line */}
          <div style={{
            position: 'absolute',
            top: 40, left: '50%',
            width: 1, height: 'calc(100% - 80px)',
            background: 'linear-gradient(to bottom, rgba(232,160,32,0.3), rgba(139,92,246,0.3))',
            display: 'block',
          }} className="hidden md:block" />

          {steps.map((s, i) => (
            <motion.div
              key={s.step}
              initial={{ opacity: 0, x: i % 2 === 0 ? -40 : 40 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                gap: '2rem',
                alignItems: 'start',
                marginBottom: i < steps.length - 1 ? '4rem' : 0,
              }}
              className="flex flex-col md:grid"
            >
              {/* Left card (even steps) */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {i % 2 === 0 ? (
                  <StepCard s={s} />
                ) : (
                  <div />
                )}
              </div>

              {/* Center dot */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '1rem' }}>
                <motion.div
                  whileHover={{ scale: 1.2 }}
                  style={{
                    width: 48, height: 48,
                    borderRadius: '50%',
                    background: `${s.color}20`,
                    border: `2px solid ${s.color}60`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: s.color,
                    fontFamily: 'Space Mono', fontWeight: 700,
                    fontSize: '0.9rem',
                    zIndex: 2, position: 'relative',
                    boxShadow: `0 0 20px ${s.color}20`,
                  }}
                >
                  {s.step}
                </motion.div>
              </div>

              {/* Right card (odd steps) */}
              <div>
                {i % 2 === 1 ? (
                  <StepCard s={s} />
                ) : (
                  <div />
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function StepCard({ s }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="glass"
      style={{
        borderRadius: 20, padding: '2rem',
        maxWidth: 380,
        borderColor: `${s.color}20`,
        transition: 'border-color 0.3s',
      }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: `${s.color}12`,
        border: `1px solid ${s.color}25`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: s.color, marginBottom: '1.25rem',
      }}>
        {s.icon}
      </div>
      <h3 style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1.15rem', marginBottom: '0.75rem', color: '#E8EDF5' }}>
        {s.title}
      </h3>
      <p style={{ color: 'rgba(232,237,245,0.6)', fontSize: '0.9rem', lineHeight: 1.7, marginBottom: '1rem' }}>
        {s.desc}
      </p>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        color: s.color, fontSize: '0.85rem', fontWeight: 600,
        fontFamily: 'Space Grotesk',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        {s.detail}
      </div>
    </motion.div>
  )
}

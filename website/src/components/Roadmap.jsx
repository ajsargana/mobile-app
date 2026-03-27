import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

const phases = [
  {
    period: 'Q4 2025',
    status: 'completed',
    title: 'Foundation Complete',
    color: '#22C55E',
    items: [
      'Core blockchain implementation',
      '31M-fold compression achieved',
      'Mobile apps (iOS & Android)',
      'P2P network infrastructure',
      'DAO governance system',
      'Trust-based fee system',
      'Comprehensive documentation',
    ],
  },
  {
    period: 'Q1 2026',
    status: 'active',
    title: 'Marketing & Security',
    color: '#E8A020',
    items: [
      'Global marketing campaigns',
      'Third-party security audits',
      'Bug bounty program launch',
      'Developer documentation',
      'Community building',
      'Waitlist & early access',
    ],
  },
  {
    period: 'Q2 2026',
    status: 'upcoming',
    title: 'Mainnet Launch',
    color: '#4FA8D5',
    items: [
      'Public mainnet activation',
      'App Store & Play Store release',
      'Exchange listings (tier-1 target)',
      'Global adoption push',
      'Ecosystem partnerships',
      'First 10,000 miners',
    ],
  },
  {
    period: 'Q3–Q4 2026',
    status: 'upcoming',
    title: 'Scale & Expand',
    color: '#8B5CF6',
    items: [
      'Multi-language support (20+ langs)',
      'Regional expansion: Africa, SE Asia',
      'DeFi protocol integrations',
      'Developer SDK release',
      '1 million users target',
      'Layer-2 scaling solutions',
    ],
  },
]

const StatusBadge = ({ status }) => {
  const config = {
    completed: { label: 'Completed', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', color: '#22C55E' },
    active: { label: 'In Progress', bg: 'rgba(232,160,32,0.1)', border: 'rgba(232,160,32,0.3)', color: '#E8A020' },
    upcoming: { label: 'Upcoming', bg: 'rgba(79,168,213,0.08)', border: 'rgba(79,168,213,0.2)', color: '#4FA8D5' },
  }[status]
  return (
    <span style={{
      background: config.bg, border: `1px solid ${config.border}`,
      color: config.color, borderRadius: 100, padding: '3px 10px',
      fontSize: '0.72rem', fontWeight: 600, fontFamily: 'Space Grotesk',
    }}>
      {config.label}
    </span>
  )
}

export default function Roadmap() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.2 })
  const isMobile = useIsMobile()

  const containerStyle = isMobile
    ? { width: '100%', maxWidth: '100%', margin: '0 auto' }
    : { maxWidth: 'min(56vw, 680px)', marginLeft: 'auto', marginRight: '4vw' }

  return (
    <section
      id="roadmap"
      ref={ref}
      data-coin-side="left"
      style={{ position: 'relative', zIndex: 1, padding: '6rem 1rem' }}
    >
      <div style={containerStyle}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '4rem' }}
        >
          <span style={{
            display: 'inline-block', color: '#22C55E',
            fontFamily: 'Space Grotesk', fontWeight: 600,
            fontSize: '0.85rem', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: '1rem',
          }}>
            Roadmap
          </span>
          <h2 style={{
            fontFamily: 'Space Grotesk', fontWeight: 700,
            fontSize: 'clamp(1.8rem, 4vw, 3rem)',
            letterSpacing: '-0.02em', marginBottom: '1rem',
          }}>
            What's{' '}
            <span className="text-gradient">Coming Next</span>
          </h2>
          <p style={{ color: 'rgba(232,237,245,0.6)', maxWidth: 500, margin: '0 auto' }}>
            13 phases completed in 2025. Mainnet launching Q2 2026.
          </p>
        </motion.div>

        {/* Timeline */}
        <div style={{ position: 'relative' }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute', left: 20, top: 20, bottom: 20, width: 2,
            background: 'linear-gradient(to bottom, #22C55E, #E8A020, #4FA8D5, #8B5CF6)',
            borderRadius: 2,
          }} />

          {phases.map((phase, i) => (
            <motion.div
              key={phase.period}
              initial={{ opacity: 0, x: -30 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              style={{ display: 'flex', gap: '2rem', marginBottom: i < phases.length - 1 ? '2.5rem' : 0 }}
            >
              {/* Dot */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <motion.div
                  animate={phase.status === 'active' ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{
                    width: 42, height: 42, borderRadius: '50%',
                    background: `${phase.color}18`,
                    border: `2px solid ${phase.color}50`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 2, position: 'relative',
                  }}
                >
                  {phase.status === 'completed' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={phase.color} strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  ) : phase.status === 'active' ? (
                    <motion.div
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      style={{ width: 10, height: 10, borderRadius: '50%', background: phase.color }}
                    />
                  ) : (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: `${phase.color}60` }} />
                  )}
                </motion.div>
              </div>

              {/* Content */}
              <div
                className="glass feature-card"
                style={{
                  flex: 1, borderRadius: 20, padding: '1.75rem',
                  borderLeft: `3px solid ${phase.color}30`,
                  opacity: phase.status === 'upcoming' ? 0.8 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '0.75rem' }}>
                  <span style={{ color: phase.color, fontFamily: 'Space Mono', fontWeight: 700, fontSize: '0.85rem' }}>
                    {phase.period}
                  </span>
                  <StatusBadge status={phase.status} />
                </div>
                <h3 style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1.15rem', marginBottom: '1rem', color: '#E8EDF5' }}>
                  {phase.title}
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {phase.items.map((item, j) => (
                    <li key={j} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'rgba(232,237,245,0.7)', fontSize: '0.9rem' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={phase.color} strokeWidth="2.5" style={{ flexShrink: 0, opacity: phase.status === 'upcoming' ? 0.5 : 1 }}>
                        <path d={phase.status === 'completed' ? 'M20 6L9 17l-5-5' : 'M5 12h14m-7-7l7 7-7 7'}/>
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

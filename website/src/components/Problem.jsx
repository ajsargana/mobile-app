import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

const problems = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>
      </svg>
    ),
    title: 'ASIC-Only Mining',
    desc: 'Bitcoin mining rewards go entirely to industrial operations. An individual with a smartphone earns exactly zero.',
    color: '#8B5CF6',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M1 6s2-2 5-2 5 2 8 2 5-2 5-2v14s-2 2-5 2-5-2-8-2-5 2-5 2V6z"/>
      </svg>
    ),
    title: 'Requires Fast Internet',
    desc: 'Traditional blockchains need broadband 24/7. Two-thirds of the developing world runs on 2G or 3G networks.',
    color: '#3B82F6',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
    ),
    title: '500+ GB Storage',
    desc: 'Bitcoin requires a full terabyte of disk space. No smartphone can run a node. You\'re forced to trust someone else.',
    color: '#EF4444',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
      </svg>
    ),
    title: '$20–$100 Gas Fees',
    desc: 'Ethereum gas fees make micro-payments impossible. Sending $5 to family abroad costs more than the transfer itself.',
    color: '#F97316',
  },
]

const ArrowDown = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(232,160,32,0.5)" strokeWidth="2">
    <path d="M12 5v14M5 12l7 7 7-7"/>
  </svg>
)

export default function Problem() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const isMobile = useIsMobile()

  const containerStyle = isMobile
    ? { width: '100%', maxWidth: '100%', margin: '0 auto' }
    : { maxWidth: 'min(60vw, 720px)', marginLeft: 'auto', marginRight: '4vw' }

  return (
    <section
      id="problem"
      ref={ref}
      data-coin-side="left"
      className="section"
      style={{ position: 'relative', zIndex: 1, padding: '6rem 1rem' }}
    >
      <div style={containerStyle}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '1.5rem' }}
        >
          <span style={{
            display: 'inline-block',
            color: '#EF4444',
            fontFamily: 'Space Grotesk', fontWeight: 600,
            fontSize: '0.85rem', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: '1rem',
          }}>
            The Problem
          </span>
          <h2 style={{
            fontFamily: 'Space Grotesk', fontWeight: 700,
            fontSize: 'clamp(1.8rem, 4vw, 3rem)',
            letterSpacing: '-0.02em', marginBottom: '1rem',
          }}>
            Blockchain Was Built for the{' '}
            <span style={{ color: '#EF4444' }}>Privileged</span>
          </h2>
          <p style={{ color: 'rgba(232,237,245,0.6)', maxWidth: 560, margin: '0 auto', fontSize: '1.1rem' }}>
            Traditional blockchains require expensive hardware, fast internet, and technical expertise —
            leaving 1.7 billion unbanked people behind.
          </p>
        </motion.div>


        {/* Problems grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.5rem',
          marginBottom: '5rem',
        }}>
          {problems.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 40 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="glass feature-card"
              style={{ borderRadius: 20, padding: '2rem', cursor: 'default' }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: `rgba(${p.color === '#EF4444' ? '239,68,68' : p.color === '#F97316' ? '249,115,22' : p.color === '#8B5CF6' ? '139,92,246' : '59,130,246'},0.1)`,
                border: `1px solid ${p.color}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: p.color, marginBottom: '1.25rem',
              }}>
                {p.icon}
              </div>
              <h3 style={{ fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.75rem', color: '#E8EDF5' }}>
                {p.title}
              </h3>
              <p style={{ color: 'rgba(232,237,245,0.55)', fontSize: '0.9rem', lineHeight: 1.7 }}>
                {p.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Transition arrow */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.6 }}
          style={{ textAlign: 'center' }}
        >
          <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 2, repeat: Infinity }}>
            <div style={{
              display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
            }}>
              <ArrowDown />
              <span style={{ color: 'rgba(232,160,32,0.6)', fontFamily: 'Space Grotesk', fontSize: '0.85rem', letterSpacing: '0.1em' }}>
                AURA50 SOLVES THIS
              </span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

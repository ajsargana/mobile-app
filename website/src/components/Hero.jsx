import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import Counter from './Counter'

const AndroidIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.523 15.341a.968.968 0 0 1-.966-.966.968.968 0 0 1 .966-.966.968.968 0 0 1 .966.966.968.968 0 0 1-.966.966m-11.046 0a.968.968 0 0 1-.966-.966.968.968 0 0 1 .966-.966.968.968 0 0 1 .966.966.968.968 0 0 1-.966.966M17.71 9.5l1.93-3.344a.403.403 0 0 0-.147-.55.403.403 0 0 0-.55.147l-1.955 3.386A11.83 11.83 0 0 0 12 8.5c-1.772 0-3.444.398-4.988 1.139L5.057 6.253a.403.403 0 0 0-.55-.147.403.403 0 0 0-.147.55L6.29 9.5C3.5 11.153 1.628 14.138 1.5 17.5h21c-.128-3.362-2-6.347-4.79-8"/>
  </svg>
)
const AppleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11"/>
  </svg>
)

const STATS = [
  { countTo: 1.7,   suffix: 'B',  decimals: 1, label: 'Unbanked Adults',   sublabel: 'Our target market', color: '#EF4444' },
  { countTo: 5,     suffix: 'B',  decimals: 0, label: 'Smartphone Users',  sublabel: 'Potential reach',   color: '#E8A020' },
  { countTo: 31.25, suffix: 'M×', decimals: 2, label: 'Data Compression',  sublabel: 'World record',      color: '#4FA8D5' },
  { countTo: 50,    suffix: 'M',  decimals: 0, label: 'A50 Max Supply',    sublabel: 'Capped forever',    color: '#8B5CF6' },
]

/* typing effect for tagline */
const taglines = [
  'Bitcoin Proved It. AURA50 Brought It Home.',
  'Mining on Any Phone.',
  'Real SHA-256 Blockchain.',
  '32MB. Works on 2G.',
]

export default function Hero() {
  const [taglineIdx, setTaglineIdx] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const target = taglines[taglineIdx]
    let timeout

    if (!deleting && displayed.length < target.length) {
      timeout = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), 60)
    } else if (!deleting && displayed.length === target.length) {
      timeout = setTimeout(() => setDeleting(true), 2000)
    } else if (deleting && displayed.length > 0) {
      timeout = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 30)
    } else if (deleting && displayed.length === 0) {
      setDeleting(false)
      setTaglineIdx((taglineIdx + 1) % taglines.length)
    }
    return () => clearTimeout(timeout)
  }, [displayed, deleting, taglineIdx])

  const scrollTo = (id) => document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' })

  return (
    <section
      id="hero"
      style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        position: 'relative', zIndex: 1, padding: '8rem 1rem 4rem', textAlign: 'center',
      }}
    >
      {/* Grid bg */}
      <div className="grid-bg" style={{ position: 'absolute', inset: 0, zIndex: -1, opacity: 0.35 }} />

      {/* Announcement badge */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          background: 'rgba(232,160,32,0.08)', border: '1px solid rgba(232,160,32,0.22)',
          borderRadius: 100, padding: '6px 16px', marginBottom: '2.5rem',
        }}
      >
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }}
        />
        <span style={{ color: '#E8A020', fontFamily: 'Space Grotesk', fontSize: '0.85rem', fontWeight: 600 }}>
          Mainnet Launch Q2 2026 — Join the Waitlist
        </span>
      </motion.div>

      {/* typing tagline */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        style={{
          minHeight: '2rem', marginBottom: '1rem',
          fontFamily: 'Space Mono', fontSize: 'clamp(0.8rem, 2vw, 1rem)',
          color: '#4FA8D5', letterSpacing: '0.06em',
        }}
      >
        {displayed}
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
          style={{ display: 'inline-block', width: 2, height: '1em', background: '#4FA8D5', marginLeft: 2, verticalAlign: 'middle' }}
        />
      </motion.div>

      {/* Main headline */}
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15 }}
        style={{
          fontFamily: 'Space Grotesk', fontWeight: 700,
          fontSize: 'clamp(2.5rem, 6vw, 5rem)',
          letterSpacing: '-0.03em', lineHeight: 1.1,
          maxWidth: '900px', marginBottom: '1.5rem',
        }}
      >
        Bitcoin Proved It.{' '}
        <span className="text-gradient">AURA50</span>
        {' '}Brought It Home.
        <br />
        <span style={{ fontSize: 'clamp(1.4rem, 3vw, 2.4rem)', opacity: 0.75 }}>
          The Revolution Fits in Your Pocket.
        </span>
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.25 }}
        style={{
          color: 'rgba(232,237,245,0.6)', fontFamily: 'Inter',
          fontSize: 'clamp(1rem, 2vw, 1.2rem)',
          maxWidth: '580px', marginBottom: '3rem', lineHeight: 1.75,
        }}
      >
        The world's first mobile-native blockchain. Real SHA-256 Proof-of-Work.
        32MB storage. Mine A50 on any phone. Works on 2G networks.
        Built for the 1.7 billion left behind by traditional finance.
      </motion.p>

      {/* CTA buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.35 }}
        style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '1.5rem' }}
      >
        <motion.a
          href="#download"
          onClick={e => { e.preventDefault(); scrollTo('#download') }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
          className="btn-primary"
          style={{ padding: '16px 32px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}
        >
          <AndroidIcon />
          Download for Android
        </motion.a>
        <motion.a
          href="#download"
          onClick={e => { e.preventDefault(); scrollTo('#download') }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
          className="btn-secondary"
          style={{ padding: '16px 32px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}
        >
          <AppleIcon />
          Download for iOS
        </motion.a>
      </motion.div>

      {/* Trust line */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '4rem' }}
      >
        {[
          { icon: '🔓', text: 'Open source' },
          { icon: '⛏', text: 'Real SHA-256 PoW' },
          { icon: '🔑', text: 'Self-custody' },
          { icon: '🚫', text: 'No ICO' },
        ].map(item => (
          <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(232,237,245,0.45)', fontSize: '0.85rem' }}>
            <span>{item.icon}</span>
            <span>{item.text}</span>
          </div>
        ))}
      </motion.div>

      {/* Animated stats strip */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.6 }}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          width: '100%', maxWidth: 860,
          background: 'rgba(255,255,255,0.025)',
          borderRadius: 20, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 + i * 0.1 }}
            whileHover={{ background: 'rgba(255,255,255,0.04)' }}
            style={{
              padding: '1.6rem 1rem', textAlign: 'center',
              borderRight: i < STATS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              background: 'rgba(6,12,24,0.7)', cursor: 'default',
              transition: 'background 0.2s',
            }}
          >
            <div style={{ fontFamily: 'Space Mono', fontWeight: 700, fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', color: stat.color, marginBottom: '4px' }}>
              <Counter to={stat.countTo} suffix={stat.suffix} decimals={stat.decimals} duration={2} />
            </div>
            <div style={{ color: '#E8EDF5', fontWeight: 600, fontSize: '0.82rem', marginBottom: '2px', fontFamily: 'Space Grotesk' }}>
              {stat.label}
            </div>
            <div style={{ color: 'rgba(232,237,245,0.35)', fontSize: '0.72rem' }}>
              {stat.sublabel}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)' }}
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
        >
          <span style={{ color: 'rgba(232,237,245,0.25)', fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Scroll</span>
          <div style={{ width: 1, height: 40, background: 'linear-gradient(to bottom, rgba(232,160,32,0.5), transparent)' }} />
        </motion.div>
      </motion.div>
    </section>
  )
}

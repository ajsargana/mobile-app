import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5">
    <path d="M20 6L9 17l-5-5"/>
  </svg>
)
const Cross = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5">
    <path d="M18 6L6 18M6 6l12 12"/>
  </svg>
)
const Partial = ({ label }) => (
  <span style={{ color: '#F97316', fontFamily: 'Inter', fontSize: '0.85rem', fontWeight: 500 }}>{label}</span>
)

const rows = [
  {
    feature: 'Storage Required',
    aura50: '32 MB',
    bitcoin: '500+ GB',
    ethereum: '1+ TB',
    aura50Type: 'value', btcType: 'cross', ethType: 'cross',
  },
  {
    feature: 'Transaction Fee',
    aura50: '0.001–0.1%',
    bitcoin: 'Variable ($1–50+)',
    ethereum: '$5–$100+',
    aura50Type: 'value', btcType: 'cross', ethType: 'cross',
  },
  {
    feature: 'Mobile Full Node',
    aura50: true, bitcoin: false, ethereum: false,
  },
  {
    feature: 'Trust-Based Fees',
    aura50: true, bitcoin: false, ethereum: false,
  },
  {
    feature: 'Offline Transactions',
    aura50: true, bitcoin: false, ethereum: false,
  },
  {
    feature: 'Works on 2G/3G',
    aura50: true, bitcoin: 'Slow', ethereum: 'Slow',
  },
  {
    feature: 'Mine on Smartphone',
    aura50: true, bitcoin: false, ethereum: false,
  },
  {
    feature: 'Fair Launch (No ICO)',
    aura50: true, bitcoin: true, ethereum: 'Pre-mine',
  },
  {
    feature: 'Monthly Bandwidth',
    aura50: '<50 MB', bitcoin: '5–50+ GB', ethereum: '20+ GB',
    aura50Type: 'value', btcType: 'cross', ethType: 'cross',
  },
  {
    feature: 'DAO Governance',
    aura50: true, bitcoin: false, ethereum: true,
  },
]

function CellValue({ val, isAura }) {
  if (typeof val === 'boolean') {
    return val ? <Check /> : <Cross />
  }
  if (typeof val === 'string' && (val === 'Slow' || val === 'Pre-mine')) {
    return <Partial label={val} />
  }
  return (
    <span style={{
      color: isAura ? '#E8A020' : 'rgba(232,237,245,0.5)',
      fontFamily: 'Space Mono', fontSize: '0.82rem', fontWeight: isAura ? 700 : 400,
    }}>
      {val}
    </span>
  )
}

export default function Comparison() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section id="technology" ref={ref} style={{ position: 'relative', zIndex: 1, padding: '6rem 1rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '4rem' }}
        >
          <span style={{
            display: 'inline-block', color: '#E8A020',
            fontFamily: 'Space Grotesk', fontWeight: 600,
            fontSize: '0.85rem', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: '1rem',
          }}>
            Comparison
          </span>
          <h2 style={{
            fontFamily: 'Space Grotesk', fontWeight: 700,
            fontSize: 'clamp(1.8rem, 4vw, 3rem)',
            letterSpacing: '-0.02em', marginBottom: '1rem',
          }}>
            How We Stack Up Against{' '}
            <span className="text-gradient">The Giants</span>
          </h2>
          <p style={{ color: 'rgba(232,237,245,0.6)', maxWidth: 500, margin: '0 auto' }}>
            AURA50 was built from scratch for mobile — not retrofitted from desktop infrastructure.
          </p>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="glass"
          style={{ borderRadius: 24, overflow: 'hidden' }}
        >
          {/* Header row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr',
            padding: '1rem 1.5rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(232,160,32,0.06)',
          }}>
            <div style={{ color: 'rgba(232,237,245,0.5)', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.08em', fontFamily: 'Space Grotesk', textTransform: 'uppercase' }}>
              Feature
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{
                background: 'rgba(232,160,32,0.15)', border: '1px solid rgba(232,160,32,0.3)',
                color: '#E8A020', borderRadius: 8, padding: '4px 12px',
                fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '0.9rem',
              }}>
                AURA50
              </span>
            </div>
            <div style={{ textAlign: 'center', color: 'rgba(232,237,245,0.5)', fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: '0.9rem' }}>
              Bitcoin
            </div>
            <div style={{ textAlign: 'center', color: 'rgba(232,237,245,0.5)', fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: '0.9rem' }}>
              Ethereum
            </div>
          </div>

          {/* Data rows */}
          {rows.map((row, i) => (
            <motion.div
              key={row.feature}
              initial={{ opacity: 0, x: -20 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.3 + i * 0.05 }}
              whileHover={{ background: 'rgba(232,160,32,0.03)' }}
              style={{
                display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr',
                padding: '0.9rem 1.5rem',
                borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                alignItems: 'center',
                transition: 'background 0.2s',
              }}
            >
              <div style={{ color: '#E8EDF5', fontSize: '0.9rem', fontFamily: 'Inter', fontWeight: 500 }}>
                {row.feature}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <CellValue val={row.aura50} isAura={true} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <CellValue val={row.bitcoin} isAura={false} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <CellValue val={row.ethereum} isAura={false} />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

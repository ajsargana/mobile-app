import { motion, useInView } from 'framer-motion'
import { useRef, useState } from 'react'

const features = [
  {
    icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
    title: 'Fair Launch — No ICO',
    desc: '60% of supply goes to miners. No pre-mine, no insider advantage. Anyone on Earth can participate.',
    accent: '#EAB308',
    badge: 'Community First',
    metric: '60% to miners',
  },
  {
    icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>,
    title: 'True P2P Network',
    desc: 'libp2p with gossipsub, Kademlia DHT, NAT traversal — no central servers, ever.',
    accent: '#06B6D4',
    badge: 'No Central Server',
    metric: 'libp2p protocol',
  },
  {
    icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75"/></svg>,
    title: 'DAO Governance',
    desc: 'A50 holders vote on protocol changes. 10% quorum, 66% approval, 2-day timelock. No master key.',
    accent: '#EC4899',
    badge: 'Decentralized',
    metric: '66% approval threshold',
  },
  {
    icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 6s2-2 5-2 5 2 8 2 5-2 5-2v14s-2 2-5 2-5-2-8-2-5 2-5 2V6z"/></svg>,
    title: 'Works Fully Offline',
    desc: 'Queue transactions without internet. Auto-syncs when connection resumes. Optimised for 2G and 3G.',
    accent: '#F97316',
    badge: '2G Ready',
    metric: '<50 MB/month',
  },
  {
    icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    title: 'Hardware-Backed Security',
    desc: 'Keys stored in iOS Keychain / Android Keystore. Face ID and fingerprint. Never touches our servers.',
    accent: '#8B5CF6',
    badge: 'Military Grade',
    metric: 'AES-256 + ECDSA',
  },
  {
    icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    title: 'Mine on Any Phone',
    desc: 'No ASIC, no special hardware. Tap start and earn 2–5 A50 per day with zero effort.',
    accent: '#22C55E',
    badge: 'Fair Mining',
    metric: '2–5 A50/day',
  },
  {
    icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
    title: 'Trust-Based Fee Decay',
    desc: 'Participate longer, pay less. Legends pay 99% less than newcomers — impossible on any other chain.',
    accent: '#4FA8D5',
    badge: 'Exclusive',
    metric: '0.001% for veterans',
  },
  {
    icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
    title: '31.25 Million× Compression',
    desc: 'Temporal-spatial compression reduces 979TB to 32MB for 10M users. Proofs fit inside a single SMS.',
    accent: '#E8A020',
    badge: 'World First',
    metric: '979TB → 32MB',
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
}

export default function Features() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [hovered, setHovered] = useState(null)

  return (
    <section id="features" ref={ref} style={{ position: 'relative', zIndex: 1, padding: '6rem 1rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '4rem' }}
        >
          <span style={{ display: 'inline-block', color: '#4FA8D5', fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: '0.85rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1rem' }}>
            Technology
          </span>
          <h2 style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 'clamp(1.8rem, 4vw, 3rem)', letterSpacing: '-0.02em', marginBottom: '1rem' }}>
            What Makes AURA50{' '}
            <span className="text-gradient">Different</span>
          </h2>
          <p style={{ color: 'rgba(232,237,245,0.6)', maxWidth: 560, margin: '0 auto', fontSize: '1.05rem' }}>
            Eight world-first innovations engineered for five billion people who access the internet only via smartphone.
          </p>
        </motion.div>

        {/* grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(255px, 1fr))', gap: '1.25rem' }}
        >
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              variants={cardVariants}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="glass"
              style={{
                borderRadius: 20, padding: '1.75rem',
                cursor: 'default', position: 'relative', overflow: 'hidden',
                border: hovered === i ? `1px solid ${f.accent}30` : '1px solid rgba(255,255,255,0.07)',
                transition: 'border-color 0.25s',
              }}
            >
              {/* ambient glow */}
              <motion.div
                animate={{ opacity: hovered === i ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  position: 'absolute', top: -30, right: -30,
                  width: 120, height: 120, borderRadius: '50%',
                  background: `${f.accent}15`, filter: 'blur(24px)',
                  pointerEvents: 'none',
                }}
              />

              {/* badge */}
              <div style={{
                display: 'inline-block',
                background: `${f.accent}12`, border: `1px solid ${f.accent}28`,
                color: f.accent, borderRadius: 100, padding: '3px 10px',
                fontSize: '0.7rem', fontWeight: 600, marginBottom: '1rem',
                fontFamily: 'Space Grotesk', letterSpacing: '0.05em',
              }}>
                {f.badge}
              </div>

              {/* icon */}
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: `${f.accent}10`, border: `1px solid ${f.accent}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: f.accent, marginBottom: '1rem',
                transition: 'all 0.25s',
                boxShadow: hovered === i ? `0 0 16px ${f.accent}25` : 'none',
              }}>
                {f.icon}
              </div>

              <h3 style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1rem', marginBottom: '0.6rem', color: '#E8EDF5' }}>
                {f.title}
              </h3>
              <p style={{ color: 'rgba(232,237,245,0.55)', fontSize: '0.875rem', lineHeight: 1.7, marginBottom: '1rem' }}>
                {f.desc}
              </p>

              {/* metric pill */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: `${f.accent}08`, border: `1px solid ${f.accent}15`,
                borderRadius: 8, padding: '4px 10px',
              }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: f.accent }} />
                <span style={{ color: f.accent, fontFamily: 'Space Mono', fontSize: '0.75rem', fontWeight: 600 }}>
                  {f.metric}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

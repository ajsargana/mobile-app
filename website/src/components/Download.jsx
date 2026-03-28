import { motion, useInView } from 'framer-motion'
import { useRef, useState } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

const AndroidIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.523 15.341a.968.968 0 0 1-.966-.966.968.968 0 0 1 .966-.966.968.968 0 0 1 .966.966.968.968 0 0 1-.966.966m-11.046 0a.968.968 0 0 1-.966-.966.968.968 0 0 1 .966-.966.968.968 0 0 1 .966.966.968.968 0 0 1-.966.966M17.71 9.5l1.93-3.344a.403.403 0 0 0-.147-.55.403.403 0 0 0-.55.147l-1.955 3.386A11.83 11.83 0 0 0 12 8.5c-1.772 0-3.444.398-4.988 1.139L5.057 6.253a.403.403 0 0 0-.55-.147.403.403 0 0 0-.147.55L6.29 9.5C3.5 11.153 1.628 14.138 1.5 17.5h21c-.128-3.362-2-6.347-4.79-8"/>
  </svg>
)

const AppleIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11"/>
  </svg>
)

const QR_PLACEHOLDER = ({ color }) => (
  <svg width="120" height="120" viewBox="0 0 120 120" style={{ opacity: 0.5 }}>
    <rect width="120" height="120" rx="8" fill="rgba(255,255,255,0.04)" stroke={`${color}20`} strokeWidth="1"/>
    {/* Simple QR placeholder pattern */}
    <rect x="10" y="10" width="30" height="30" rx="2" fill="none" stroke={color} strokeWidth="2" opacity="0.4"/>
    <rect x="15" y="15" width="20" height="20" rx="1" fill={color} opacity="0.25"/>
    <rect x="80" y="10" width="30" height="30" rx="2" fill="none" stroke={color} strokeWidth="2" opacity="0.4"/>
    <rect x="85" y="15" width="20" height="20" rx="1" fill={color} opacity="0.25"/>
    <rect x="10" y="80" width="30" height="30" rx="2" fill="none" stroke={color} strokeWidth="2" opacity="0.4"/>
    <rect x="15" y="85" width="20" height="20" rx="1" fill={color} opacity="0.25"/>
    {[0,1,2,3,4].map(r => [0,1,2,3,4].map(c => (
      <rect key={`${r}-${c}`} x={50 + c * 8} y={50 + r * 8} width="5" height="5" fill={color} opacity={Math.random() > 0.5 ? 0.4 : 0.15}/>
    )))}
    <text x="60" y="112" textAnchor="middle" fill={color} fontSize="8" fontFamily="Space Grotesk" opacity="0.5">Scan to download</text>
  </svg>
)


export default function Download() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.2 })
  const isMobile = useIsMobile()
  const [androidHover, setAndroidHover] = useState(false)
  const [iosHover, setIosHover] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyWaitlist = () => {
    navigator.clipboard?.writeText('https://aura50.io/waitlist').catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section id="download" ref={ref} data-coin-side="right" style={{ position: 'relative', zIndex: 1, padding: '6rem 1rem' }}>
      {/* Gold glow */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 700, height: 300,
        background: 'radial-gradient(ellipse, rgba(232,160,32,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={isMobile
        ? { width: '100%', maxWidth: '100%', margin: '0 auto', position: 'relative' }
        : { maxWidth: 'min(62vw, 740px)', marginLeft: '4vw', marginRight: 'auto', position: 'relative' }
      }>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          style={{ textAlign: 'center', marginBottom: '4rem' }}
        >
          <span style={{
            display: 'inline-block', color: '#E8A020',
            fontFamily: 'Space Grotesk', fontWeight: 600,
            fontSize: '0.85rem', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: '1rem',
          }}>
            Download
          </span>
          <h2 style={{
            fontFamily: 'Space Grotesk', fontWeight: 700,
            fontSize: 'clamp(1.8rem, 4vw, 3rem)',
            letterSpacing: '-0.02em', marginBottom: '1rem',
          }}>
            Start Earning <span className="text-gradient-gold">A50 Today</span>
          </h2>
          <p style={{ color: 'rgba(232,237,245,0.6)', maxWidth: 500, margin: '0 auto' }}>
            Available on Android and iOS. Mainnet launching Q2 2026.
            Join the waitlist to be first in line.
          </p>
        </motion.div>

        {/* Download cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
          {/* Android */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            onMouseEnter={() => setAndroidHover(true)}
            onMouseLeave={() => setAndroidHover(false)}
            className="glass-gold"
            style={{
              borderRadius: 24, padding: '2.5rem',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '1.5rem', textAlign: 'center',
              boxShadow: androidHover ? '0 0 40px rgba(232,160,32,0.15)' : 'none',
              transition: 'box-shadow 0.3s',
            }}
          >
            <motion.div
              animate={androidHover ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
              style={{ color: '#E8A020' }}
            >
              <AndroidIcon size={56} />
            </motion.div>
            <div>
              <h3 style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1.3rem', color: '#E8EDF5', marginBottom: '0.5rem' }}>
                Android APK
              </h3>
              <p style={{ color: 'rgba(232,237,245,0.55)', fontSize: '0.9rem' }}>
                Direct APK download for Android 7.0+.
                No Google Play required.
              </p>
            </div>

            <QR_PLACEHOLDER color="#E8A020" />

            <motion.a
              href="https://github.com/ajsargana/mobile-app/releases/download/v1.0.1/aura50.apk"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="btn-primary"
              style={{
                width: '100%', textAlign: 'center', padding: '14px 24px',
                fontSize: '1rem', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '10px', textDecoration: 'none',
              }}
            >
              <AndroidIcon size={20} />
              Download APK
            </motion.a>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(232,237,245,0.4)', fontSize: '0.8rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              SHA-256 verified · v1.0.0-beta
            </div>
          </motion.div>

          {/* iOS */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.3 }}
            onMouseEnter={() => setIosHover(true)}
            onMouseLeave={() => setIosHover(false)}
            className="glass-azure"
            style={{
              borderRadius: 24, padding: '2.5rem',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '1.5rem', textAlign: 'center',
              boxShadow: iosHover ? '0 0 40px rgba(79,168,213,0.15)' : 'none',
              transition: 'box-shadow 0.3s',
            }}
          >
            <motion.div
              animate={iosHover ? { scale: 1.1, rotate: -5 } : { scale: 1, rotate: 0 }}
              style={{ color: '#4FA8D5' }}
            >
              <AppleIcon size={56} />
            </motion.div>
            <div>
              <h3 style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1.3rem', color: '#E8EDF5', marginBottom: '0.5rem' }}>
                iOS App
              </h3>
              <p style={{ color: 'rgba(232,237,245,0.55)', fontSize: '0.9rem' }}>
                Available on App Store for iPhone and iPad.
                iOS 14+ required.
              </p>
            </div>

            <QR_PLACEHOLDER color="#4FA8D5" />

            <motion.a
              href="https://apps.apple.com/app/aura50"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="btn-secondary"
              style={{
                width: '100%', textAlign: 'center', padding: '14px 24px',
                fontSize: '1rem', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '10px', textDecoration: 'none',
                border: '1px solid rgba(79,168,213,0.3)',
              }}
            >
              <AppleIcon size={20} />
              App Store
            </motion.a>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(232,237,245,0.4)', fontSize: '0.8rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              App Store verified · Coming Q2 2026
            </div>
          </motion.div>
        </div>

        {/* Waitlist CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.7 }}
          style={{ textAlign: 'center' }}
        >
          <p style={{ color: 'rgba(232,237,245,0.5)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Mainnet not live yet? Join the waitlist and earn a 5% mining bonus on launch day.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <a
              href="https://aura50.io/waitlist"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ padding: '12px 28px', fontSize: '0.95rem', textDecoration: 'none', display: 'inline-block' }}
            >
              Join Waitlist
            </a>
            <button
              onClick={copyWaitlist}
              className="btn-secondary"
              style={{ padding: '12px 20px', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              {copied ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                  Share Link
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

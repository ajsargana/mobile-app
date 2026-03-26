import { motion, useInView } from 'framer-motion'
import { useRef, useState } from 'react'
import Counter from './Counter'

/* ── fee tiers ─────────────────────────────────────────────────── */
const feeTiers = [
  { tier: 'New',         age: '< 1 month',  fee: '0.100%', save: 0,   color: '#EF4444', icon: '🆕' },
  { tier: 'Established', age: '1–12 months',fee: '0.050%', save: 50,  color: '#F97316', icon: '📈' },
  { tier: 'Veteran',     age: '1–3 years',  fee: '0.010%', save: 90,  color: '#4FA8D5', icon: '⚡' },
  { tier: 'Legend',      age: '3+ years',   fee: '0.001%', save: 99,  color: '#22C55E', icon: '👑' },
]

/* ── halving schedule ──────────────────────────────────────────── */
const halvings = [
  { period: 'Yr 1–2', reward: 481.128, color: '#E8A020' },
  { period: 'Yr 2–3', reward: 240.564, color: '#F59E0B' },
  { period: 'Yr 3–4', reward: 120.282, color: '#F97316' },
  { period: 'Yr 4–5', reward:  60.141, color: '#EF4444' },
  { period: 'Yr 5–6', reward:  30.070, color: '#8B5CF6' },
]
const maxReward = halvings[0].reward

export default function Tokenomics() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [activeTier, setActiveTier] = useState(null)

  return (
    <section id="tokenomics" ref={ref} style={{ position: 'relative', zIndex: 1, padding: '6rem 1rem' }}>
      {/* bg glow */}
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: 800, height: 500,
        background: 'radial-gradient(ellipse, rgba(232,160,32,0.05) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative' }}>
        {/* header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '4rem' }}
        >
          <span style={{ display: 'inline-block', color: '#E8A020', fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: '0.85rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1rem' }}>
            Token Economics
          </span>
          <h2 style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 'clamp(1.8rem, 4vw, 3rem)', letterSpacing: '-0.02em', marginBottom: '1rem' }}>
            A50 Token —{' '}
            <span className="text-gradient">Fair by Design</span>
          </h2>
          <p style={{ color: 'rgba(232,237,245,0.6)', maxWidth: 520, margin: '0 auto' }}>
            50 million tokens. No ICO. No pre-mine. 85% earned by miners over 10 years.
          </p>
        </motion.div>

        {/* ── top stat pills ───────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.15 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '3rem' }}
        >
          {[
            { label: 'Max Supply',    val: 50,        suffix: 'M A50', color: '#E8A020' },
            { label: 'To Miners',     val: 85,        suffix: '%',     color: '#22C55E' },
            { label: 'Block Time',    val: 2,         suffix: ' min',  color: '#4FA8D5' },
            { label: 'Halving Cycle', val: 210000,    suffix: ' blocks',color: '#8B5CF6' },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="glass"
              style={{ borderRadius: 16, padding: '1.25rem', textAlign: 'center' }}
            >
              <div style={{ fontFamily: 'Space Mono', fontWeight: 700, fontSize: '1.6rem', color: s.color }}>
                <Counter to={s.val} suffix={s.suffix} />
              </div>
              <div style={{ color: 'rgba(232,237,245,0.5)', fontSize: '0.8rem', marginTop: '4px' }}>{s.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Halving chart ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.35 }}
          className="glass"
          style={{ borderRadius: 24, padding: '2rem', marginBottom: '2rem' }}
        >
          <h3 style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1.1rem', color: '#E8EDF5', marginBottom: '0.5rem' }}>
            Block Reward Halvings
          </h3>
          <p style={{ color: 'rgba(232,237,245,0.45)', fontSize: '0.8rem', marginBottom: '1.75rem' }}>Like Bitcoin — rewards halve every ~1 year</p>

          {/* column chart */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: 160, marginBottom: '0.75rem' }}>
            {halvings.map((h, i) => {
              const heightPct = (h.reward / maxReward) * 100
              return (
                <div key={h.period} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{ color: h.color, fontFamily: 'Space Mono', fontSize: '0.65rem', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {h.reward.toFixed(0)}
                  </span>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={inView ? { height: `${heightPct}%` } : {}}
                    transition={{ duration: 1.0, delay: 0.5 + i * 0.1, ease: 'easeOut' }}
                    style={{
                      width: '100%', borderRadius: '6px 6px 2px 2px',
                      background: `linear-gradient(to top, ${h.color}40, ${h.color}CC)`,
                      boxShadow: `0 0 12px ${h.color}30`,
                      minHeight: 4,
                    }}
                  />
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {halvings.map(h => (
              <div key={h.period} style={{ flex: 1, textAlign: 'center', color: 'rgba(232,237,245,0.4)', fontSize: '0.72rem' }}>
                {h.period}
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '1.5rem', paddingTop: '1.25rem' }}>
            <p style={{ color: 'rgba(232,237,245,0.5)', fontSize: '0.82rem', lineHeight: 1.6 }}>
              Rewards halve every 52,560 blocks (~1 year). Total mining period: <span style={{ color: '#E8A020' }}>10 years</span>. After that, only transaction fees.
            </p>
          </div>
        </motion.div>

        {/* ── Trust-based fees ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5 }}
          className="glass-gold"
          style={{ borderRadius: 24, padding: '2rem' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.75rem' }}>
            <div>
              <h3 style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1.1rem', color: '#E8EDF5', marginBottom: '0.4rem' }}>
                Trust-Based Fee System
              </h3>
              <p style={{ color: 'rgba(232,237,245,0.5)', fontSize: '0.85rem' }}>
                The longer you participate, the less you pay. Impossible on any other blockchain.
              </p>
            </div>
            <div style={{ background: 'rgba(232,160,32,0.12)', border: '1px solid rgba(232,160,32,0.25)', borderRadius: 12, padding: '8px 16px', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#E8A020', fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '0.85rem' }}>World First</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {feeTiers.map((t, i) => (
              <motion.div
                key={t.tier}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
                transition={{ delay: 0.6 + i * 0.1 }}
                whileHover={{ y: -4, scale: 1.03 }}
                onMouseEnter={() => setActiveTier(i)}
                onMouseLeave={() => setActiveTier(null)}
                style={{
                  background: activeTier === i ? `${t.color}12` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${activeTier === i ? t.color + '40' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 16, padding: '1.25rem',
                  cursor: 'default', transition: 'all 0.25s',
                }}
              >
                <div style={{ marginBottom: '0.75rem' }}>
                  <span style={{ color: t.color, fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '0.95rem' }}>{t.tier}</span>
                  <div style={{ color: 'rgba(232,237,245,0.4)', fontSize: '0.78rem', marginTop: '2px' }}>{t.age}</div>
                </div>

                {/* fee big display */}
                <div style={{ fontFamily: 'Space Mono', fontWeight: 700, fontSize: '1.8rem', color: t.color, marginBottom: '0.5rem', lineHeight: 1 }}>
                  {t.fee}
                </div>

                {/* savings bar */}
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 100, marginBottom: '6px' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={inView ? { width: `${t.save}%` } : { width: 0 }}
                    transition={{ duration: 1.0, delay: 0.7 + i * 0.1, ease: 'easeOut' }}
                    style={{ height: '100%', borderRadius: 100, background: t.color }}
                  />
                </div>
                <div style={{ color: 'rgba(232,237,245,0.4)', fontSize: '0.75rem' }}>
                  {t.save > 0 ? `${t.save}% cheaper than new users` : 'Base rate'}
                </div>
              </motion.div>
            ))}
          </div>

          {/* example calculation */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 1.1 }}
            style={{
              marginTop: '1.5rem', padding: '1rem 1.25rem',
              background: 'rgba(255,255,255,0.02)', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center',
            }}
          >
            <span style={{ color: 'rgba(232,237,245,0.5)', fontSize: '0.85rem' }}>Sending 100 A50:</span>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <span style={{ color: '#EF4444', fontSize: '0.85rem' }}>New user: <strong style={{ fontFamily: 'Space Mono' }}>0.10 A50</strong></span>
              <span style={{ color: '#22C55E', fontSize: '0.85rem' }}>Legend: <strong style={{ fontFamily: 'Space Mono' }}>0.001 A50</strong></span>
              <span style={{ color: '#E8A020', fontSize: '0.85rem', fontWeight: 600 }}>99% savings</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

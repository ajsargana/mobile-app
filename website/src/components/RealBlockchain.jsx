import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

/* ── Bitcoin-style block animation ─────────────────────────────── */
function BlockChainAnim({ inView }) {
  const blocks = [
    { hash: '000a7f3c...', prev: 'genesis', txs: 1000, height: 840000 },
    { hash: '0003b8e1...', prev: '000a7f3c', txs: 847, height: 840001 },
    { hash: '000c1a9d...', prev: '0003b8e1', txs: 923, height: 840002 },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0', overflowX: 'auto', paddingBottom: '0.5rem' }}>
      {blocks.map((b, i) => (
        <div key={b.hash} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.3 + i * 0.25, type: 'spring', stiffness: 200, damping: 18 }}
            style={{
              background: 'rgba(232,160,32,0.06)',
              border: '1px solid rgba(232,160,32,0.2)',
              borderRadius: 12, padding: '1rem',
              minWidth: 160,
            }}
          >
            <div style={{ color: 'rgba(232,237,245,0.4)', fontSize: '0.68rem', marginBottom: '4px', fontFamily: 'Space Grotesk', letterSpacing: '0.06em' }}>
              BLOCK #{b.height}
            </div>
            <div style={{ color: '#E8A020', fontFamily: 'Space Mono', fontSize: '0.78rem', marginBottom: '8px', wordBreak: 'break-all' }}>
              {b.hash}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div>
                <div style={{ color: 'rgba(232,237,245,0.35)', fontSize: '0.65rem' }}>PREV</div>
                <div style={{ color: '#4FA8D5', fontFamily: 'Space Mono', fontSize: '0.7rem' }}>{b.prev.slice(0, 8)}…</div>
              </div>
              <div>
                <div style={{ color: 'rgba(232,237,245,0.35)', fontSize: '0.65rem' }}>TXS</div>
                <div style={{ color: '#E8EDF5', fontFamily: 'Space Mono', fontSize: '0.7rem' }}>{b.txs}</div>
              </div>
            </div>
          </motion.div>

          {i < blocks.length - 1 && (
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={inView ? { opacity: 1, scaleX: 1 } : {}}
              transition={{ delay: 0.5 + i * 0.25 }}
              style={{ width: 24, height: 2, background: 'linear-gradient(to right, #E8A020, #4FA8D5)', flexShrink: 0 }}
            />
          )}
        </div>
      ))}
      {/* next block breathing */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ width: 24, height: 2, background: 'rgba(255,255,255,0.08)' }} />
        <motion.div
          animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.97, 1.02, 0.97] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          style={{
            border: '1px dashed rgba(232,160,32,0.25)',
            borderRadius: 12, padding: '1rem', minWidth: 160,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '6px', flexShrink: 0,
          }}
        >
          <div style={{ color: 'rgba(232,237,245,0.3)', fontSize: '0.7rem', fontFamily: 'Space Grotesk' }}>NEXT BLOCK</div>
          <div style={{ color: 'rgba(232,160,32,0.4)', fontFamily: 'Space Mono', fontSize: '0.75rem' }}>mining…</div>
        </motion.div>
      </div>
    </div>
  )
}

/* ── Fake vs Real comparison ────────────────────────────────────── */
const fakeVsReal = [
  {
    fake: 'Tap a button to "mine"',
    real: 'SHA-256 Proof-of-Work — identical algorithm to Bitcoin',
  },
  {
    fake: 'Central server decides your balance',
    real: 'Immutable blockchain ledger — no server can alter your balance',
  },
  {
    fake: '"Coins" have no chain — just a database row',
    real: 'Real blocks with cryptographic hashes, Merkle trees, signatures',
  },
  {
    fake: 'Can be deleted, modified, or stolen by the company',
    real: 'Your keys on your device. We literally cannot touch your coins.',
  },
  {
    fake: 'Promises future exchange listings that never happen',
    real: 'Open-source protocol — any exchange can list A50 permissionlessly',
  },
  {
    fake: 'One company controls everything',
    real: 'DAO governance — community votes, 2-day timelock, no master key',
  },
]

export default function RealBlockchain() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const isMobile = useIsMobile()

  const containerStyle = isMobile
    ? { width: '100%', maxWidth: '100%', margin: '0 auto', position: 'relative' }
    : { maxWidth: 'min(62vw, 740px)', marginLeft: 'auto', marginRight: '4vw', position: 'relative' }

  return (
    <section
      id="real-blockchain"
      ref={ref}
      data-coin-side="left"
      style={{ position: 'relative', zIndex: 1, padding: '6rem 1rem' }}
    >
      <div style={{
        position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)',
        width: 900, height: 400,
        background: 'radial-gradient(ellipse, rgba(249,115,22,0.04) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      <div style={containerStyle}>
        {/* header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '4rem' }}
        >
          <span style={{ display: 'inline-block', color: '#F97316', fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: '0.85rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1rem' }}>
            100% Real Blockchain
          </span>
          <h2 style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 'clamp(1.8rem, 4vw, 3rem)', letterSpacing: '-0.02em', marginBottom: '1rem' }}>
            We Use Bitcoin's Actual{' '}
            <span className="text-gradient-gold">Proof-of-Work</span>
          </h2>
          <p style={{ color: 'rgba(232,237,245,0.6)', maxWidth: 600, margin: '0 auto', fontSize: '1.05rem', lineHeight: 1.7 }}>
            Not a "tap to earn" app. Not a point system. Not a promise.
            AURA50 runs <strong style={{ color: '#E8EDF5' }}>SHA-256 hashing</strong> — the same algorithm Satoshi Nakamoto chose for Bitcoin — adapted for mobile.
          </p>
        </motion.div>

        {/* Fake vs Real table */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2 }}
          style={{ marginBottom: '2rem' }}
        >
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <span style={{ color: '#EF4444', fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Spot the difference
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            {/* Fake column */}
            <div className="glass" style={{ borderRadius: 20, overflow: 'hidden', borderColor: 'rgba(239,68,68,0.15)' }}>
              <div style={{ background: 'rgba(239,68,68,0.08)', padding: '1rem 1.5rem', borderBottom: '1px solid rgba(239,68,68,0.12)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />
                  <span style={{ color: '#EF4444', fontFamily: 'Space Grotesk', fontWeight: 700 }}>Fake "Tap to Earn" Apps</span>
                </div>
              </div>
              {fakeVsReal.map((row, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.3 + i * 0.07 }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                    padding: '12px 1.5rem',
                    borderBottom: i < fakeVsReal.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 2 }}>
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                  <span style={{ color: 'rgba(232,237,245,0.5)', fontSize: '0.875rem', lineHeight: 1.6 }}>{row.fake}</span>
                </motion.div>
              ))}
            </div>

            {/* Real column */}
            <div className="glass" style={{ borderRadius: 20, overflow: 'hidden', borderColor: 'rgba(34,197,94,0.15)' }}>
              <div style={{ background: 'rgba(34,197,94,0.08)', padding: '1rem 1.5rem', borderBottom: '1px solid rgba(34,197,94,0.12)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22C55E' }} />
                  <span style={{ color: '#22C55E', fontFamily: 'Space Grotesk', fontWeight: 700 }}>AURA50 — Real Blockchain</span>
                </div>
              </div>
              {fakeVsReal.map((row, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 10 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.3 + i * 0.07 }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                    padding: '12px 1.5rem',
                    borderBottom: i < fakeVsReal.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 2 }}>
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                  <span style={{ color: 'rgba(232,237,245,0.8)', fontSize: '0.875rem', lineHeight: 1.6 }}>{row.real}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Bitcoin heritage card */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.4 }}
          className="glass"
          style={{
            borderRadius: 24, padding: '2.5rem', marginBottom: '2rem',
            borderColor: 'rgba(232,160,32,0.2)',
            background: 'linear-gradient(135deg, rgba(232,160,32,0.04) 0%, rgba(6,12,24,0.9) 100%)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '3rem', alignItems: 'start' }}>
            {/* left: heritage */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '1.5rem' }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #F7931A, #E8A020)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 20px rgba(247,147,26,0.4)',
                  flexShrink: 0,
                }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
                    <path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.546z"/>
                    <path d="M17.01 10.907c.28-1.86-.93-2.86-2.51-3.527l.513-2.054-1.252-.312-.5 2-.999-.249.5-2L11.51 4.45l-.5 2-.8-.199-.001.005-1.726-.43-.333 1.336s.924.212.904.225c.504.126.596.46.58.725l-.58 2.326-.068-.017-.852 3.413c-.065.16-.228.4-.597.308.013.018-.905-.226-.905-.226l-.619 1.433 1.628.406.886.222-.517 2.075 1.251.312.513-2.055c.344.094.678.181 1.005.263l-.51 2.044 1.252.312.517-2.07c2.134.405 3.74.242 4.415-1.69.544-1.552-.027-2.447-1.147-3.03.815-.188 1.43-.724 1.594-1.832z"/>
                  </svg>
                </div>
                <div>
                  <h3 style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1.1rem', color: '#E8EDF5' }}>
                    Bitcoin-Proven Technology
                  </h3>
                  <p style={{ color: 'rgba(232,237,245,0.5)', fontSize: '0.85rem' }}>Same cryptographic foundation, mobile-adapted</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { label: 'Hashing Algorithm', val: 'SHA-256 (identical to Bitcoin)', color: '#F7931A' },
                  { label: 'Signature Scheme', val: 'ECDSA secp256k1 (Bitcoin-compatible)', color: '#E8A020' },
                  { label: 'Wallet Format', val: 'BIP32/BIP39 HD wallets', color: '#4FA8D5' },
                  { label: 'Consensus', val: 'Hybrid PoW + Proof-of-Participation', color: '#22C55E' },
                  { label: 'Block Structure', val: 'Hash chains with Merkle trees', color: '#8B5CF6' },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, x: -15 }}
                    animate={inView ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.55 + i * 0.08 }}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <span style={{ color: 'rgba(232,237,245,0.5)', fontSize: '0.8rem' }}>{item.label}</span>
                    <span style={{ color: item.color, fontSize: '0.8rem', fontFamily: 'Space Mono', fontWeight: 600, textAlign: 'right', maxWidth: '55%' }}>{item.val}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* right: live block chain visual */}
            <div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ color: 'rgba(232,237,245,0.4)', fontSize: '0.75rem', letterSpacing: '0.1em', marginBottom: '0.75rem', fontFamily: 'Space Grotesk', textTransform: 'uppercase' }}>
                  Live Blockchain — Immutable Chain of Blocks
                </div>
                <BlockChainAnim inView={inView} />
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : {}}
                transition={{ delay: 0.9 }}
                style={{
                  marginTop: '1.5rem', padding: '1rem 1.25rem',
                  background: 'rgba(232,160,32,0.06)',
                  border: '1px solid rgba(232,160,32,0.15)',
                  borderRadius: 12,
                }}
              >
                <p style={{ color: 'rgba(232,237,245,0.7)', fontSize: '0.85rem', lineHeight: 1.7 }}>
                  Each block references the hash of the previous block.
                  Altering any block breaks every block after it — making the chain
                  <strong style={{ color: '#E8A020' }}> mathematically tamper-proof</strong>.
                  This is exactly how Bitcoin works. This is exactly what AURA50 uses.
                </p>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.9 }}
          style={{ textAlign: 'center' }}
        >
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '12px',
            background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
            borderRadius: 16, padding: '1rem 2rem',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span style={{ color: 'rgba(232,237,245,0.8)', fontSize: '0.95rem' }}>
              AURA50's code is <a href="https://github.com/aura50/aura50" target="_blank" rel="noopener noreferrer" style={{ color: '#22C55E', textDecoration: 'underline' }}>open source</a>.
              {' '}Read every line. Verify it yourself. Trust the math, not a company.
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

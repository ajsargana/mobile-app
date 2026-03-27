import { motion, useInView, AnimatePresence } from 'framer-motion'
import { useRef, useState } from 'react'

const faqs = [
  {
    q: 'What is AURA50?',
    a: 'AURA50 is the world\'s first mobile-native blockchain. It uses real SHA-256 Proof-of-Work — the same algorithm as Bitcoin — but engineered to run on any Android or iOS smartphone. It requires only 32MB of storage and works on 2G mobile networks.',
  },
  {
    q: 'Can I mine A50 on my phone without special hardware?',
    a: 'Yes. Unlike Bitcoin which requires expensive ASIC rigs, any Android 7.0+ or iOS 14+ device can mine A50 tokens. Tap start and earn 2–5 A50 per day with zero special equipment.',
  },
  {
    q: 'How does AURA50 fit a full blockchain in 32MB?',
    a: 'AURA50 uses a patent-pending temporal-spatial compression algorithm that achieves 31.25 million times compression — reducing what would be 979TB of raw blockchain data for 10 million users down to 32MB. Cryptographic proofs fit inside a single SMS.',
  },
  {
    q: 'What is the A50 max supply and how are tokens distributed?',
    a: 'A50 has a hard cap of 50 million tokens. 85% are earned by miners over a 10-year period through Proof-of-Work — just like Bitcoin. There was no ICO, no pre-mine, and no insider pre-allocation.',
  },
  {
    q: 'Does AURA50 work without an internet connection?',
    a: 'Yes. AURA50 supports offline transaction queuing. Create and sign transactions without internet, and they auto-sync when your connection returns. The app is also optimised for 2G and 3G networks.',
  },
  {
    q: 'When is AURA50 mainnet launching?',
    a: 'Mainnet is scheduled for Q2 2026. Join the waitlist at aura50.io to be first in line and earn a 5% mining bonus on launch day.',
  },
  {
    q: 'Is AURA50 open source?',
    a: 'Yes. The full blockchain core is open source on GitHub (github.com/aura50/aura50). Read it, audit it, or contribute to it.',
  },
]

function FAQItem({ faq, index, inView }) {
  const [open, setOpen] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
      className="glass"
      style={{ borderRadius: 16, overflow: 'hidden' }}
      itemScope
      itemType="https://schema.org/Question"
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', textAlign: 'left',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '1.25rem 1.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
        }}
        aria-expanded={open}
      >
        <span
          itemProp="name"
          style={{ fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: '0.975rem', color: '#E8EDF5', lineHeight: 1.4 }}
        >
          {faq.q}
        </span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.22 }}
          style={{ color: '#E8A020', flexShrink: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
            itemScope
            itemType="https://schema.org/Answer"
          >
            <p
              itemProp="text"
              style={{
                color: 'rgba(232,237,245,0.6)', fontSize: '0.9rem', lineHeight: 1.75,
                padding: '0 1.5rem 1.25rem',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                paddingTop: '1rem',
              }}
            >
              {faq.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function FAQ() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.2 })

  return (
    <section id="faq" ref={ref} style={{ position: 'relative', zIndex: 1, padding: '6rem 1rem' }}
      itemScope itemType="https://schema.org/FAQPage"
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '3rem' }}
        >
          <span style={{
            display: 'inline-block', color: '#E8A020',
            fontFamily: 'Space Grotesk', fontWeight: 600,
            fontSize: '0.85rem', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: '1rem',
          }}>
            FAQ
          </span>
          <h2 style={{
            fontFamily: 'Space Grotesk', fontWeight: 700,
            fontSize: 'clamp(1.8rem, 4vw, 3rem)',
            letterSpacing: '-0.02em', marginBottom: '1rem',
          }}>
            Common <span className="text-gradient-gold">Questions</span>
          </h2>
          <p style={{ color: 'rgba(232,237,245,0.55)', maxWidth: 480, margin: '0 auto', fontSize: '1rem' }}>
            Everything you need to know about AURA50 before you start mining.
          </p>
        </motion.div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {faqs.map((faq, i) => (
            <FAQItem key={faq.q} faq={faq} index={i} inView={inView} />
          ))}
        </div>
      </div>
    </section>
  )
}

import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useEffect } from 'react'

const Section = ({ title, children }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5 }}
    style={{ marginBottom: '2.5rem' }}
  >
    <h2 style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1.25rem', color: '#E8EDF5', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      {title}
    </h2>
    <div style={{ color: 'rgba(232,237,245,0.7)', fontSize: '0.95rem', lineHeight: 1.8 }}>
      {children}
    </div>
  </motion.div>
)

export default function Cookies() {
  useEffect(() => { window.scrollTo(0, 0) }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#060C18', position: 'relative', zIndex: 1 }}>
      <div style={{
        background: 'rgba(139,92,246,0.04)',
        borderBottom: '1px solid rgba(139,92,246,0.12)',
        padding: '6rem 1rem 3rem',
        textAlign: 'center',
      }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#8B5CF6', textDecoration: 'none', fontSize: '0.85rem', marginBottom: '2rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Home
        </Link>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 'clamp(2rem, 5vw, 3rem)', color: '#E8EDF5', marginBottom: '0.75rem' }}
        >
          Cookie Policy
        </motion.h1>
        <p style={{ color: 'rgba(232,237,245,0.5)', fontSize: '0.95rem' }}>
          Effective: March 1, 2026
        </p>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>
        <Section title="1. What Are Cookies?">
          <p>
            Cookies are small text files stored on your device by a website. They help us remember your
            preferences and understand how you interact with our website.
          </p>
        </Section>

        <Section title="2. How We Use Cookies">
          <p>The AURA50 website uses minimal cookies:</p>
          <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li><strong style={{ color: '#E8EDF5' }}>Strictly necessary cookies</strong> — Required for the website to function (session management, security tokens)</li>
            <li><strong style={{ color: '#E8EDF5' }}>Preference cookies</strong> — Remember your language and display preferences</li>
          </ul>
          <p style={{ marginTop: '0.75rem' }}>
            <strong style={{ color: '#22C55E' }}>We do not use advertising cookies, tracking pixels, or third-party analytics cookies.</strong>
          </p>
        </Section>

        <Section title="3. The AURA50 Mobile App">
          <p>
            The AURA50 mobile application does not use browser cookies. App data is stored in your device's
            secure storage as described in our Privacy Policy.
          </p>
        </Section>

        <Section title="4. Managing Cookies">
          <p>
            You can control cookies through your browser settings. Disabling strictly necessary cookies
            may affect website functionality.
          </p>
          <p style={{ marginTop: '0.75rem' }}>
            For more information on managing cookies, visit{' '}
            <a href="https://www.aboutcookies.org" target="_blank" rel="noopener noreferrer" style={{ color: '#8B5CF6' }}>aboutcookies.org</a>.
          </p>
        </Section>

        <Section title="5. Contact">
          <p>
            Questions about our cookie practices? Email us at{' '}
            <a href="mailto:privacy@aura50.network" style={{ color: '#8B5CF6' }}>privacy@aura50.network</a>.
          </p>
        </Section>
      </div>
    </div>
  )
}

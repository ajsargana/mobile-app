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

export default function Terms() {
  useEffect(() => { window.scrollTo(0, 0) }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#060C18', position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div style={{
        background: 'rgba(79,168,213,0.04)',
        borderBottom: '1px solid rgba(79,168,213,0.12)',
        padding: '6rem 1rem 3rem',
        textAlign: 'center',
      }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#4FA8D5', textDecoration: 'none', fontSize: '0.85rem', marginBottom: '2rem' }}>
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
          Terms of Service
        </motion.h1>
        <p style={{ color: 'rgba(232,237,245,0.5)', fontSize: '0.95rem' }}>
          Effective: March 1, 2026 · Last Updated: March 1, 2026
        </p>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>
        <Section title="1. Acceptance of Terms">
          <p>
            By downloading, installing, or using the AURA50 mobile application ("App"), you agree to be bound by
            these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the App.
          </p>
          <p style={{ marginTop: '0.75rem' }}>
            These Terms apply to all users of the AURA50 App, website (aura50.io), and related services
            (collectively, the "Services"). AURA50 is provided by AURA50 Team ("Company," "we," "us," or "our").
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p>You must be at least 18 years of age (or the age of majority in your jurisdiction) to use the Services. By using the Services, you represent that:</p>
          <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li>You are at least 18 years old</li>
            <li>You have the legal capacity to enter into these Terms</li>
            <li>You are not located in, or a citizen or resident of, any country subject to comprehensive sanctions</li>
            <li>You are not using the Services for unlawful purposes</li>
          </ul>
        </Section>

        <Section title="3. Description of Services">
          <p>AURA50 provides a mobile blockchain platform that enables users to:</p>
          <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li>Create and manage A50 cryptocurrency wallets</li>
            <li>Participate in block validation ("mining") to earn A50 tokens</li>
            <li>Send and receive A50 tokens</li>
            <li>Participate in decentralized governance (DAO voting)</li>
            <li>Invite others via a referral program</li>
          </ul>
          <p style={{ marginTop: '0.75rem' }}>
            <strong style={{ color: '#E8A020' }}>A50 tokens are a utility token</strong> on the AURA50 blockchain. They are not securities, investment products, or currency. No representation is made about future value.
          </p>
        </Section>

        <Section title="4. Wallet and Custody">
          <p>
            AURA50 is a <strong style={{ color: '#E8EDF5' }}>self-custody</strong> application. This means:
          </p>
          <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li>Your 24-word seed phrase and private keys are stored exclusively on your device</li>
            <li>We do not have access to your private keys or seed phrase</li>
            <li><strong style={{ color: '#EF4444' }}>If you lose your seed phrase, we cannot recover your wallet or tokens</strong></li>
            <li>You are solely responsible for safeguarding your credentials</li>
          </ul>
        </Section>

        <Section title="5. Mining and Rewards">
          <p>
            Block participation ("mining") allows you to earn A50 tokens according to the blockchain protocol.
            You acknowledge that:
          </p>
          <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li>Mining rewards are determined by the protocol and may change via governance</li>
            <li>The 2–5 A50/day estimate is not guaranteed and depends on network participation</li>
            <li>Halving events will reduce block rewards over time per the published schedule</li>
            <li>You are responsible for any tax obligations arising from mined tokens</li>
          </ul>
        </Section>

        <Section title="6. Prohibited Activities">
          <p>You agree not to:</p>
          <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li>Use multiple accounts, bots, emulators, or other means to gain unfair mining advantages (Sybil attacks)</li>
            <li>Attempt to reverse-engineer, decompile, or circumvent the App's security measures</li>
            <li>Use the Services for money laundering, terrorist financing, or other illegal activities</li>
            <li>Transmit malware, viruses, or harmful code through the network</li>
            <li>Impersonate AURA50 Team members or other users</li>
            <li>Violate any applicable laws or regulations</li>
          </ul>
          <p style={{ marginTop: '0.75rem' }}>
            Violations may result in permanent account termination and forfeiture of accumulated tokens.
          </p>
        </Section>

        <Section title="7. Intellectual Property">
          <p>
            The AURA50 name, logo, and website content are trademarks and copyrighted works of AURA50 Team.
            © {new Date().getFullYear()} AURA50 Team. All rights reserved.
          </p>
          <p style={{ marginTop: '0.75rem' }}>
            The blockchain core software is open source and released under applicable open source licenses.
            See our <a href="https://github.com/aura50/aura50" target="_blank" rel="noopener noreferrer" style={{ color: '#E8A020' }}>GitHub repository</a> for license details.
          </p>
        </Section>

        <Section title="8. Disclaimer of Warranties">
          <p>
            THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND. WE DISCLAIM
            ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
            AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT:
          </p>
          <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li>The Services will be uninterrupted, error-free, or secure</li>
            <li>Any defects will be corrected</li>
            <li>The A50 token will have any monetary value</li>
            <li>Mining rewards will be continuous or at any particular rate</li>
          </ul>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, AURA50 TEAM SHALL NOT BE LIABLE FOR ANY INDIRECT,
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA,
            OR TOKENS, ARISING FROM YOUR USE OF THE SERVICES.
          </p>
          <p style={{ marginTop: '0.75rem' }}>
            Our total liability shall not exceed the greater of (a) the amount you paid us in the 12 months
            preceding the claim, or (b) $100 USD.
          </p>
        </Section>

        <Section title="10. Risk Disclosure">
          <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }}>
            <p><strong style={{ color: '#EF4444' }}>Important Risk Factors:</strong></p>
            <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
              <li>Cryptocurrency values are highly volatile and can go to zero</li>
              <li>Regulatory changes may affect availability of the Services in your jurisdiction</li>
              <li>Smart contract bugs or protocol vulnerabilities may result in loss of tokens</li>
              <li>Network attacks could affect block rewards or token balances</li>
              <li>AURA50 is a new protocol — mainnet has not launched at time of writing</li>
            </ul>
          </div>
          <p>Do not invest more than you can afford to lose. This is not financial advice.</p>
        </Section>

        <Section title="11. Governing Law">
          <p>
            These Terms shall be governed by the laws of [Jurisdiction TBD], without regard to conflict of law provisions.
            Any disputes shall be resolved through binding arbitration, except where prohibited by law.
          </p>
        </Section>

        <Section title="12. Changes to Terms">
          <p>
            We may update these Terms at any time. Continued use of the Services after changes constitutes
            acceptance. We will notify you of material changes through the App.
          </p>
        </Section>

        <Section title="13. Contact">
          <div style={{ background: 'rgba(79,168,213,0.06)', border: '1px solid rgba(79,168,213,0.15)', borderRadius: 16, padding: '1.5rem' }}>
            <p><strong style={{ color: '#E8EDF5' }}>AURA50 Team</strong></p>
            <p>General: <a href="mailto:hello@aura50.io" style={{ color: '#4FA8D5' }}>hello@aura50.io</a></p>
            <p>Legal: <a href="mailto:legal@aura50.io" style={{ color: '#4FA8D5' }}>legal@aura50.io</a></p>
            <p>Partnerships: <a href="mailto:partnerships@aura50.io" style={{ color: '#4FA8D5' }}>partnerships@aura50.io</a></p>
          </div>
        </Section>
      </div>
    </div>
  )
}

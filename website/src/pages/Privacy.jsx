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

const Table = ({ headers, rows }) => (
  <div style={{ overflowX: 'auto', margin: '1rem 0' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {headers.map(h => (
            <th key={h} style={{
              background: 'rgba(232,160,32,0.08)', color: '#E8A020',
              padding: '10px 14px', fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: '0.85rem',
              border: '1px solid rgba(255,255,255,0.06)', textAlign: 'left',
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} style={{
                padding: '10px 14px', fontSize: '0.875rem',
                color: 'rgba(232,237,245,0.7)',
                border: '1px solid rgba(255,255,255,0.04)',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
              }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

export default function Privacy() {
  useEffect(() => { window.scrollTo(0, 0) }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#060C18', position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div style={{
        background: 'rgba(232,160,32,0.04)',
        borderBottom: '1px solid rgba(232,160,32,0.12)',
        padding: '6rem 1rem 3rem',
        textAlign: 'center',
      }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#E8A020', textDecoration: 'none', fontSize: '0.85rem', marginBottom: '2rem' }}>
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
          Privacy Policy
        </motion.h1>
        <p style={{ color: 'rgba(232,237,245,0.5)', fontSize: '0.95rem' }}>
          Effective: March 1, 2026 · Last Updated: March 1, 2026
        </p>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>
        <Section title="1. Introduction">
          <p>
            AURA50 ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains
            what information we collect when you use the AURA50 mobile application ("App"), how we use it, with
            whom we share it, and what rights you have over your data.
          </p>
          <p style={{ marginTop: '0.75rem' }}>
            By downloading or using the App, you agree to this Privacy Policy. If you do not agree, please do not use the App.
          </p>
        </Section>

        <Section title="2. Information We Collect">
          <h3 style={{ color: '#E8EDF5', fontWeight: 600, marginBottom: '0.5rem', marginTop: '1rem' }}>2.1 Account Information</h3>
          <p>When you register an account, we collect:</p>
          <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li><strong style={{ color: '#E8EDF5' }}>Username</strong> — your chosen display name</li>
            <li><strong style={{ color: '#E8EDF5' }}>User ID</strong> — a unique identifier assigned to your account</li>
            <li><strong style={{ color: '#E8EDF5' }}>Referral code</strong> — the code you use or generate for invitations</li>
            <li><strong style={{ color: '#E8EDF5' }}>Account creation date</strong></li>
          </ul>
          <p style={{ marginTop: '0.75rem' }}>We do <strong style={{ color: '#E8A020' }}>not</strong> collect your email address or phone number unless you provide one voluntarily.</p>

          <h3 style={{ color: '#E8EDF5', fontWeight: 600, marginBottom: '0.5rem', marginTop: '1.5rem' }}>2.2 Wallet and Transaction Data</h3>
          <p>To provide blockchain functionality, we collect and store wallet addresses, transaction history, account balance, and block participation records.</p>
          <p style={{ marginTop: '0.75rem' }}>
            <strong style={{ color: '#E8A020' }}>Your 24-word seed phrase and private keys are stored exclusively on your device</strong> using your operating system's secure storage (iOS Keychain / Android Keystore). They are <strong style={{ color: '#E8A020' }}>never transmitted</strong> to our servers.
          </p>

          <h3 style={{ color: '#E8EDF5', fontWeight: 600, marginBottom: '0.5rem', marginTop: '1.5rem' }}>2.3 Device Information</h3>
          <p>We collect device ID, model, OS version, battery level, and charging status to optimize performance and prevent Sybil attacks. We detect emulators to verify you're using a real physical device.</p>

          <h3 style={{ color: '#E8EDF5', fontWeight: 600, marginBottom: '0.5rem', marginTop: '1.5rem' }}>2.4 Location Data</h3>
          <p>We collect approximate location (country/region/city) derived from your IP address for geographic diversity verification. Precise GPS is only used if you grant permission and only for node verification.</p>

          <h3 style={{ color: '#E8EDF5', fontWeight: 600, marginBottom: '0.5rem', marginTop: '1.5rem' }}>2.5 Local Storage Summary</h3>
          <Table
            headers={['Storage Type', 'Data Stored']}
            rows={[
              ['Secure OS Storage (encrypted)', 'Seed phrase (mnemonic), video encryption keys, master encryption key'],
              ['Local App Storage', 'Auth token, wallet structure, transaction cache, block participation history, device attestation'],
            ]}
          />
        </Section>

        <Section title="3. How We Use Your Information">
          <Table
            headers={['Purpose', 'Data Used']}
            rows={[
              ['Operate your wallet and process transactions', 'Wallet addresses, transaction history, account balance'],
              ['Verify you are a real, unique human participant', 'Device ID, emulator flag, liveness video, location, behavioral patterns'],
              ['Prevent Sybil attacks and fraud', 'Device fingerprint, location, behavioral data, account age'],
              ['Optimize performance for your device', 'Battery level, memory, network type'],
              ['Maintain network geographic diversity', 'IP-based approximate location'],
              ['Comply with legal obligations', 'Any data as required by applicable law'],
            ]}
          />
          <p style={{ marginTop: '1rem' }}>
            We do <strong style={{ color: '#E8A020' }}>not</strong> use your data for: targeted advertising, selling to data brokers, profiling unrelated to network integrity, or any automated decision-making with legal effect on you.
          </p>
        </Section>

        <Section title="4. Data Retention">
          <Table
            headers={['Data Category', 'Retention Period']}
            rows={[
              ['Account data', 'Until account deletion'],
              ['Wallet addresses and transaction history', 'Until account deletion (blockchain records are permanent by nature)'],
              ['Device attestation', '12 months, refreshed on each app launch'],
              ['Block participation session data', '24 months'],
              ['Behavioral/Sybil score data', '24 months'],
              ['IP address logs', '90 days'],
              ['Location data', 'Session only; not persistently stored'],
            ]}
          />
        </Section>

        <Section title="5. Third-Party Services">
          <p>We use the following third-party services:</p>
          <ul style={{ marginLeft: '1.5rem', marginTop: '0.75rem' }}>
            <li><strong style={{ color: '#E8EDF5' }}>ipapi.co</strong> — IP geolocation (country/region/city). Receives your IP address only.</li>
            <li><strong style={{ color: '#E8EDF5' }}>api.ipify.org</strong> — Looks up your current public IP address.</li>
            <li><strong style={{ color: '#E8EDF5' }}>Expo / React Native</strong> — App platform; may collect limited diagnostic data.</li>
          </ul>
          <p style={{ marginTop: '0.75rem' }}>
            We do <strong style={{ color: '#E8A020' }}>not</strong> integrate advertising networks, Google Analytics, Firebase Analytics, or social media tracking pixels.
          </p>
        </Section>

        <Section title="6. Data Security">
          <ul style={{ marginLeft: '1.5rem' }}>
            <li>Seed phrases and private keys stored only in OS-level encrypted storage, never leave your device</li>
            <li>All API communication uses HTTPS/TLS encryption in transit</li>
            <li>Authentication tokens stored in secure device storage and expire automatically</li>
            <li>No plaintext passwords are ever stored</li>
          </ul>
        </Section>

        <Section title="7. Children's Privacy">
          <p>The App is not directed at children under 13 (or 16 in jurisdictions requiring higher protection). We do not knowingly collect personal information from children. Contact us at <a href="mailto:privacy@aura50.network" style={{ color: '#E8A020' }}>privacy@aura50.network</a> if you believe a child has provided data.</p>
        </Section>

        <Section title="8. Your Rights">
          <h3 style={{ color: '#E8EDF5', fontWeight: 600, marginBottom: '0.5rem', marginTop: '1rem' }}>All Users</h3>
          <p>Access, deletion, and correction of your personal data.</p>

          <h3 style={{ color: '#E8EDF5', fontWeight: 600, marginBottom: '0.5rem', marginTop: '1.25rem' }}>EEA / UK / Switzerland (GDPR)</h3>
          <p>Data portability, restriction of processing, right to object, and right to lodge a complaint with your supervisory authority.</p>

          <h3 style={{ color: '#E8EDF5', fontWeight: 600, marginBottom: '0.5rem', marginTop: '1.25rem' }}>California (CCPA/CPRA)</h3>
          <p>Right to know, delete, and opt out of sale. <strong style={{ color: '#22C55E' }}>We do not sell your personal information.</strong></p>

          <p style={{ marginTop: '1rem' }}>
            To exercise your rights, email: <a href="mailto:privacy@aura50.network" style={{ color: '#E8A020' }}>privacy@aura50.network</a>. Response within 30 days.
          </p>
        </Section>

        <Section title="9. Permissions We Request">
          <Table
            headers={['Permission', 'Why We Need It']}
            rows={[
              ['Internet', 'Required to connect to the blockchain network and API'],
              ['Camera', 'Liveness verification and QR code scanning'],
              ['Location (approximate)', 'Geographic diversity verification for network participation'],
              ['Location (precise / GPS)', 'Optional — only if you grant it; for node geographic verification'],
              ['Biometric / Device Lock', 'To check whether your device has security enabled (yes/no only)'],
              ['Background execution', 'To maintain your node connection during the session'],
              ['Network state', 'To detect WiFi vs mobile data and adjust performance'],
            ]}
          />
        </Section>

        <Section title="10. Changes to This Policy">
          <p>We may update this Privacy Policy from time to time. We will update the "Last Updated" date at the top. For material changes, we will notify you within the App.</p>
        </Section>

        <Section title="11. Contact Us">
          <div style={{
            background: 'rgba(232,160,32,0.06)',
            border: '1px solid rgba(232,160,32,0.15)',
            borderRadius: 16, padding: '1.5rem', marginTop: '0.5rem',
          }}>
            <p><strong style={{ color: '#E8EDF5' }}>AURA50 Team</strong></p>
            <p>General: <a href="mailto:privacy@aura50.network" style={{ color: '#E8A020' }}>privacy@aura50.network</a></p>
            <p>GDPR: <a href="mailto:gdpr@aura50.network" style={{ color: '#E8A020' }}>gdpr@aura50.network</a></p>
            <p style={{ marginTop: '0.75rem', color: 'rgba(232,237,245,0.5)', fontSize: '0.85rem' }}>
              This Privacy Policy was prepared to comply with Google Play Developer Distribution Agreement,
              Apple App Store Review Guidelines, GDPR, CCPA/CPRA, and applicable mobile platform privacy requirements.
            </p>
          </div>
        </Section>
      </div>
    </div>
  )
}

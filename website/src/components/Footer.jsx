import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

const Logo = () => (
  <img src="/coin-face.png" width="32" height="32" alt="AURA50" style={{ borderRadius: '50%', display: 'block' }} />
)

const links = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'Technology', href: '#technology' },
    { label: 'Tokenomics', href: '#tokenomics' },
    { label: 'Roadmap', href: '#roadmap' },
    { label: 'Download', href: '#download' },
  ],
  Community: [
    { label: 'Discord', href: 'https://discord.gg/aura50', external: true },
    { label: 'Twitter / X', href: 'https://twitter.com/aura50_io', external: true },
    { label: 'Telegram', href: 'https://t.me/aura50', external: true },
    { label: 'GitHub', href: 'https://github.com/aura50/aura50', external: true },
  ],
  Resources: [
    { label: 'Whitepaper', href: 'https://docs.aura50.io/whitepaper', external: true },
    { label: 'Documentation', href: 'https://docs.aura50.io', external: true },
    { label: 'Bug Bounty', href: 'https://aura50.io/security', external: true },
    { label: 'Press Kit', href: 'https://aura50.io/press', external: true },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy', internal: true },
    { label: 'Terms of Service', href: '/terms', internal: true },
    { label: 'Cookie Policy', href: '/cookies', internal: true },
    { label: 'Contact', href: 'mailto:hello@aura50.io', external: true },
  ],
}

function NavLink({ link }) {
  if (link.internal) {
    return (
      <Link
        to={link.href}
        style={{ color: 'rgba(232,237,245,0.55)', textDecoration: 'none', fontSize: '0.875rem', transition: 'color 0.2s' }}
        onMouseEnter={e => e.target.style.color = '#E8A020'}
        onMouseLeave={e => e.target.style.color = 'rgba(232,237,245,0.55)'}
      >
        {link.label}
      </Link>
    )
  }
  if (link.external) {
    return (
      <a
        href={link.href}
        target={link.href.startsWith('mailto') ? undefined : '_blank'}
        rel="noopener noreferrer"
        style={{ color: 'rgba(232,237,245,0.55)', textDecoration: 'none', fontSize: '0.875rem', transition: 'color 0.2s' }}
        onMouseEnter={e => e.target.style.color = '#E8A020'}
        onMouseLeave={e => e.target.style.color = 'rgba(232,237,245,0.55)'}
      >
        {link.label}
      </a>
    )
  }
  return (
    <button
      onClick={() => {
        const el = document.querySelector(link.href)
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'rgba(232,237,245,0.55)', fontSize: '0.875rem', transition: 'color 0.2s',
        padding: 0, textAlign: 'left',
        fontFamily: 'Inter',
      }}
      onMouseEnter={e => e.target.style.color = '#E8A020'}
      onMouseLeave={e => e.target.style.color = 'rgba(232,237,245,0.55)'}
    >
      {link.label}
    </button>
  )
}

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer style={{
      position: 'relative', zIndex: 1,
      borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: '4rem 1rem 2rem',
    }}>
      {/* Top section */}
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '3rem',
          marginBottom: '4rem',
        }}>
          {/* Brand column */}
          <div style={{ gridColumn: 'span 1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
              <Logo />
              <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1.2rem', color: '#E8EDF5', letterSpacing: '-0.02em' }}>
                AURA<span style={{ color: '#E8A020' }}>50</span>
              </span>
            </div>
            <p style={{ color: 'rgba(232,237,245,0.45)', fontSize: '0.875rem', lineHeight: 1.7, maxWidth: 220, marginBottom: '1.5rem' }}>
              Bitcoin Proved It. AURA50 Brought It Home. The Revolution Fits in Your Pocket.
            </p>
            {/* Social icons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              {[
                { href: 'https://twitter.com/aura50_io', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
                { href: 'https://discord.gg/aura50', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg> },
                { href: 'https://t.me/aura50', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg> },
                { href: 'https://github.com/aura50/aura50', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg> },
              ].map(({ href, icon }, i) => (
                <a
                  key={i}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'rgba(232,237,245,0.5)',
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(232,160,32,0.1)'; e.currentTarget.style.color = '#E8A020'; e.currentTarget.style.borderColor = 'rgba(232,160,32,0.3)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(232,237,245,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                >
                  {icon}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([section, items]) => (
            <div key={section}>
              <h4 style={{ fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(232,237,245,0.4)', marginBottom: '1.25rem' }}>
                {section}
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {items.map(link => (
                  <li key={link.label}>
                    <NavLink link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: '2rem',
          display: 'flex', flexWrap: 'wrap', gap: '1rem',
          alignItems: 'center', justifyContent: 'space-between',
        }}>
          <p style={{ color: 'rgba(232,237,245,0.35)', fontSize: '0.82rem' }}>
            © {year} AURA50 Team. All rights reserved. AURA50 is a trademark of AURA50 Team.
          </p>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Privacy Policy', href: '/privacy' },
              { label: 'Terms of Service', href: '/terms' },
              { label: 'Cookie Policy', href: '/cookies' },
            ].map(l => (
              <Link
                key={l.label}
                to={l.href}
                style={{ color: 'rgba(232,237,245,0.35)', fontSize: '0.82rem', textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => e.target.style.color = '#E8A020'}
                onMouseLeave={e => e.target.style.color = 'rgba(232,237,245,0.35)'}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem 1.25rem',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.04)',
        }}>
          <p style={{ color: 'rgba(232,237,245,0.25)', fontSize: '0.75rem', lineHeight: 1.7 }}>
            <strong style={{ color: 'rgba(232,237,245,0.4)' }}>Risk Disclaimer:</strong>{' '}
            Cryptocurrency investments involve significant risk. The value of A50 tokens may fluctuate
            dramatically. Mining rewards are variable and not guaranteed. This website does not constitute
            financial or investment advice. AURA50 is a technology project; token value projections are
            speculative estimates only. Please do your own research before participating.
          </p>
        </div>
      </div>
    </footer>
  )
}

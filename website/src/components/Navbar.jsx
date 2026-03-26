import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useLocation } from 'react-router-dom'

const navLinks = [
  { label: 'Features',    href: '#features',    id: 'features' },
  { label: 'Technology',  href: '#technology',  id: 'technology' },
  { label: 'Tokenomics',  href: '#tokenomics',  id: 'tokenomics' },
  { label: 'Community',   href: '#community',   id: 'community' },
]

const CoinLogo = () => (
  <img src="/coin-face.png" width="36" height="36" alt="AURA50" style={{ borderRadius: '50%', display: 'block' }} />
)

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('')
  const location = useLocation()

  useEffect(() => {
    const ids = navLinks.map(l => l.id)
    const onScroll = () => {
      setScrolled(window.scrollY > 40)
      const offset = window.scrollY + 120
      let current = ''
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.offsetTop <= offset) current = id
      }
      setActiveSection(current)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [location])

  const handleNavClick = (href) => {
    setMobileOpen(false)
    if (href.startsWith('#')) {
      const el = document.querySelector(href)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <>
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="fixed top-4 left-4 z-50"
        style={{ width: 'calc(100% - 2rem)', maxWidth: '1200px' }}
      >
        <div
          className="flex items-center justify-between px-5 py-3 rounded-2xl"
          style={{
            background: scrolled
              ? 'rgba(6, 12, 24, 0.92)'
              : 'rgba(6, 12, 24, 0.7)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: scrolled ? '0 8px 40px rgba(0,0,0,0.4)' : 'none',
            transition: 'all 0.3s ease',
          }}
        >
          {/* Logo + desktop nav grouped on the left */}
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-3 cursor-pointer" style={{ textDecoration: 'none' }}>
              <CoinLogo />
              <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '1.2rem', color: '#E8EDF5', letterSpacing: '-0.02em' }}>
                AURA<span style={{ color: '#E8A020' }}>50</span>
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-5">
              {navLinks.map((link) => {
                const isActive = activeSection === link.id
                return (
                  <button
                    key={link.label}
                    onClick={() => handleNavClick(link.href)}
                    className="cursor-pointer"
                    style={{
                      background: 'none', border: 'none',
                      color: isActive ? '#E8A020' : 'rgba(232,237,245,0.65)',
                      fontFamily: 'Inter', fontSize: '0.9rem', fontWeight: isActive ? 600 : 500,
                      transition: 'color 0.25s, font-weight 0.25s',
                      padding: '4px 0',
                      position: 'relative',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#E8EDF5' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'rgba(232,237,245,0.65)' }}
                  >
                    {link.label}
                    {isActive && (
                      <motion.span
                        layoutId="nav-underline"
                        style={{
                          position: 'absolute', bottom: -2, left: 0, right: 0,
                          height: '2px', borderRadius: 2,
                          background: 'linear-gradient(90deg, #E8A020, #F5C842)',
                        }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <a
              href="#download"
              onClick={(e) => { e.preventDefault(); document.querySelector('#download')?.scrollIntoView({ behavior: 'smooth' }) }}
              className="btn-primary hidden md:block"
              style={{ padding: '8px 20px', fontSize: '0.9rem', textDecoration: 'none', display: 'inline-block' }}
            >
              Download App
            </a>
            {/* Mobile menu toggle */}
            <button
              className="md:hidden flex flex-col gap-1 cursor-pointer"
              style={{ background: 'none', border: 'none', padding: '4px' }}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              <motion.span
                animate={mobileOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
                style={{ display: 'block', width: 22, height: 2, background: '#E8EDF5', borderRadius: 2 }}
              />
              <motion.span
                animate={mobileOpen ? { opacity: 0 } : { opacity: 1 }}
                style={{ display: 'block', width: 22, height: 2, background: '#E8EDF5', borderRadius: 2 }}
              />
              <motion.span
                animate={mobileOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
                style={{ display: 'block', width: 22, height: 2, background: '#E8EDF5', borderRadius: 2 }}
              />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              style={{
                background: 'rgba(6,12,24,0.96)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                marginTop: '8px',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '1rem' }}>
                {navLinks.map((link, i) => (
                  <motion.button
                    key={link.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => handleNavClick(link.href)}
                    className="block w-full text-left cursor-pointer"
                    style={{
                      background: 'none', border: 'none',
                      color: 'rgba(232,237,245,0.8)',
                      fontFamily: 'Inter', fontSize: '1rem',
                      padding: '12px 8px',
                      borderBottom: i < navLinks.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    }}
                  >
                    {link.label}
                  </motion.button>
                ))}
                <a
                  href="#download"
                  onClick={(e) => { e.preventDefault(); document.querySelector('#download')?.scrollIntoView({ behavior: 'smooth' }); setMobileOpen(false) }}
                  className="btn-primary"
                  style={{ display: 'block', textAlign: 'center', padding: '12px', marginTop: '12px', textDecoration: 'none' }}
                >
                  Download App
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>
    </>
  )
}

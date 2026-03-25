import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import ParticleBackground from './components/ParticleBackground'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Problem from './components/Problem'
import Features from './components/Features'
import Comparison from './components/Comparison'
import Tokenomics from './components/Tokenomics'
import Download from './components/Download'
import Community from './components/Community'
import RealBlockchain from './components/RealBlockchain'
import CoinCanvas from './components/CoinCanvas'
import Footer from './components/Footer'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import Cookies from './pages/Cookies'

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -16 },
}
const pageTransition = { duration: 0.35, ease: 'easeInOut' }

function HomePage() {
  return (
    <motion.main
      variants={pageVariants}
      initial="initial"
      animate="in"
      exit="out"
      transition={pageTransition}
    >
      <Hero />
      <Problem />
      <RealBlockchain />
      <Features />
      <Comparison />
      <Tokenomics />
      <Download />
      <Community />
    </motion.main>
  )
}

export default function App() {
  const location = useLocation()

  return (
    <div style={{ background: '#060C18', minHeight: '100vh', color: '#E8EDF5' }}>
      <ParticleBackground />
      <CoinCanvas />
      <Navbar />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<HomePage />} />
          <Route path="/privacy" element={
            <motion.div variants={pageVariants} initial="initial" animate="in" exit="out" transition={pageTransition}>
              <Privacy />
            </motion.div>
          } />
          <Route path="/terms" element={
            <motion.div variants={pageVariants} initial="initial" animate="in" exit="out" transition={pageTransition}>
              <Terms />
            </motion.div>
          } />
          <Route path="/cookies" element={
            <motion.div variants={pageVariants} initial="initial" animate="in" exit="out" transition={pageTransition}>
              <Cookies />
            </motion.div>
          } />
          <Route path="*" element={
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem', zIndex: 1, position: 'relative' }}>
              <h1 style={{ fontFamily: 'Space Grotesk', fontSize: '8rem', fontWeight: 700, color: 'rgba(232,160,32,0.2)', lineHeight: 1 }}>404</h1>
              <h2 style={{ fontFamily: 'Space Grotesk', fontSize: '1.5rem', marginBottom: '1rem' }}>Block not found</h2>
              <p style={{ color: 'rgba(232,237,245,0.5)', marginBottom: '2rem' }}>This page doesn't exist on the chain.</p>
              <a href="/" className="btn-primary" style={{ padding: '12px 28px', textDecoration: 'none' }}>Go Home</a>
            </div>
          } />
        </Routes>
      </AnimatePresence>
      <Footer />
    </div>
  )
}

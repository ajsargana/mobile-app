import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

export default function ParticleBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const isMobile = window.innerWidth < 768
    const PARTICLE_COUNT = isMobile ? 20 : 75
    const CONNECTION_DIST = isMobile ? 0 : 120  // skip connections on mobile
    const FRAME_SKIP = isMobile ? 2 : 1          // mobile renders every 2nd frame

    let animId
    let frameCount = 0
    let particles = []

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize, { passive: true })

    class Particle {
      constructor() { this.reset() }
      reset() {
        this.x     = Math.random() * canvas.width
        this.y     = Math.random() * canvas.height
        this.vx    = (Math.random() - 0.5) * 0.3
        this.vy    = (Math.random() - 0.5) * 0.3
        this.size  = Math.random() * 1.5 + 0.5
        this.alpha = Math.random() * 0.35 + 0.08
        this.color = Math.random() > 0.6 ? '#E8A020'
                   : Math.random() > 0.5 ? '#4FA8D5'
                   : '#8B5CF6'
      }
      update() {
        this.x += this.vx
        this.y += this.vy
        if (this.x < 0 || this.x > canvas.width)  this.vx *= -1
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1
      }
      draw() {
        ctx.globalAlpha = this.alpha
        ctx.fillStyle   = this.color
        // No shadowBlur — it's the single most expensive canvas op on mobile
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle())

    const drawConnections = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx   = particles[i].x - particles[j].x
          const dy   = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECTION_DIST) {
            ctx.globalAlpha  = (1 - dist / CONNECTION_DIST) * 0.07
            ctx.strokeStyle  = '#4FA8D5'
            ctx.lineWidth    = 0.5
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }
    }

    const animate = () => {
      animId = requestAnimationFrame(animate)
      frameCount++
      if (frameCount % FRAME_SKIP !== 0) return  // throttle on mobile

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.globalAlpha = 1

      if (CONNECTION_DIST > 0) drawConnections()

      particles.forEach(p => { p.update(); p.draw() })
      ctx.globalAlpha = 1
    }
    animate()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animId)
    }
  }, [])

  const isMobileOrb = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed', top: 0, left: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 0,
        }}
      />
      {/* Floating orbs — desktop only (expensive on Android) */}
      {!isMobileOrb && (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
          <motion.div
            style={{
              position: 'absolute', borderRadius: '50%',
              width: 600, height: 600,
              background: 'radial-gradient(circle, rgba(232,160,32,0.08) 0%, transparent 70%)',
              top: '-10%', left: '-10%',
            }}
            animate={{ x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.1, 1] }}
            transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            style={{
              position: 'absolute', borderRadius: '50%',
              width: 500, height: 500,
              background: 'radial-gradient(circle, rgba(79,168,213,0.08) 0%, transparent 70%)',
              bottom: '10%', right: '-5%',
            }}
            animate={{ x: [0, -30, 0], y: [0, -40, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            style={{
              position: 'absolute', borderRadius: '50%',
              width: 400, height: 400,
              background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
              top: '40%', left: '40%',
            }}
            animate={{ x: [0, 50, 0], y: [0, -30, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      )}
    </>
  )
}

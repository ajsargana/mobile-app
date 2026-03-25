import { Suspense, useRef, useEffect, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, useTexture } from '@react-three/drei'
import * as THREE from 'three'

/* ─── module-level mutable coin state (zero React re-renders) ──── */
const coinState = {
  side:    'right',
  visible: true,
  scrollY: 0,
}

/* ─── 3D Coin mesh ─────────────────────────────────────────────── */
function CoinMesh() {
  const meshRef   = useRef()
  const { viewport } = useThree()

  /* load icon.png as face texture */
  const faceTexture = useTexture('/coin-face.png')

  /* per-material array — drei v9 compatible */
  const materials = useMemo(() => {
    const edge = new THREE.MeshStandardMaterial({
      color:             new THREE.Color(0.35, 0.25, 0.01),
      metalness:         0.99,
      roughness:         0.20,
      envMapIntensity:   2.5,
    })
    const face = new THREE.MeshStandardMaterial({
      color:             new THREE.Color(0.90, 0.65, 0.06),
      metalness:         0.92,
      roughness:         0.07,
      envMapIntensity:   3.0,
      map:               faceTexture,
    })
    return [edge, face, face.clone()]
  }, [faceTexture])

  /* smoothed live values */
  const sx = useRef(viewport.width * 0.27)
  const sy = useRef(0.8)
  const ss = useRef(0)
  const sr = useRef(0)

  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current
    if (!mesh) return

    const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight)
    const t         = Math.min(coinState.scrollY / maxScroll, 1)

    /* — continuous Y spin */
    mesh.rotation.y += delta * 0.9

    /* — scroll-driven X roll: 4 full flips page top→bottom */
    const targetRoll = t * Math.PI * 8
    sr.current += (targetRoll - sr.current) * 0.07
    mesh.rotation.x = sr.current

    /* — gentle Z wobble */
    mesh.rotation.z = Math.sin(clock.elapsedTime * 0.8) * 0.04

    /* — X: glide left ↔ right */
    const targetX = coinState.side === 'left'
      ? -viewport.width * 0.27
      :  viewport.width * 0.27
    sx.current += (targetX - sx.current) * 0.05

    /* — Y: travel top → bottom as user scrolls */
    const targetY = 1.0 - t * 2.0
    sy.current += (targetY - sy.current) * 0.04

    mesh.position.x = sx.current
    mesh.position.y = sy.current + Math.sin(clock.elapsedTime * 1.4) * 0.05

    /* — scale / visibility */
    const want = coinState.visible && window.innerWidth > 900 ? 1 : 0
    ss.current  += (want - ss.current) * 0.07
    const scale  = ss.current * 1.0
    mesh.scale.setScalar(scale)
  })

  return (
    <mesh ref={meshRef} material={materials}>
      <cylinderGeometry args={[1, 1, 0.12, 64]} />
    </mesh>
  )
}

/* ─── Scene ────────────────────────────────────────────────────── */
function Scene() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[ 4,  8,  5]} intensity={2.2} color="#fff8e8" />
      <directionalLight position={[-3, -4,  2]} intensity={0.6} color="#182840" />
      <pointLight position={[-3,  3,  4]} intensity={4}   color="#E8A020" distance={12} decay={2} />
      <pointLight position={[ 3, -2,  3]} intensity={2}   color="#4FA8D5" distance={10} decay={2} />
      <pointLight position={[ 0,  0,  6]} intensity={1.5} color="#ffffff"  distance={14} decay={2} />

      <Suspense fallback={null}>
        <Environment preset="studio" />
        <CoinMesh />
      </Suspense>
    </>
  )
}

/* ─── Main export ───────────────────────────────────────────────── */
export default function CoinCanvas() {
  useEffect(() => {
    /* track scroll */
    const onScroll = () => { coinState.scrollY = window.scrollY }
    coinState.scrollY = window.scrollY
    window.addEventListener('scroll', onScroll, { passive: true })

    /* observe sections that carry data-coin-side attribute */
    const active   = new Set()
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          active.add(entry.target)
          coinState.side    = entry.target.dataset.coinSide ?? 'right'
          coinState.visible = true
        } else {
          active.delete(entry.target)
          if (active.size === 0) {
            coinState.visible = false
          } else {
            coinState.side = [...active].at(-1)?.dataset.coinSide ?? 'right'
          }
        }
      })
    }, { threshold: 0.12 })

    const observeAll = () =>
      document.querySelectorAll('[data-coin-side]').forEach(el => observer.observe(el))

    /* initial pass + retry to catch any late-mounted sections */
    const t1 = setTimeout(observeAll, 300)
    const t2 = setTimeout(observeAll, 800)
    const t3 = setTimeout(observeAll, 1600)

    return () => {
      window.removeEventListener('scroll', onScroll)
      observer.disconnect()
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent', pointerEvents: 'none' }}
        dpr={[1, 2]}
        flat={false}
      >
        <Scene />
      </Canvas>
    </div>
  )
}

import { useRef, useState, useEffect } from 'react'
import { useInView, useMotionValue, animate } from 'framer-motion'

export default function Counter({ to, suffix = '', prefix = '', duration = 1.8, decimals = 0 }) {
  const ref   = useRef(null)
  const inView = useInView(ref, { once: true })
  const mv    = useMotionValue(0)
  const [display, setDisplay] = useState('0')

  useEffect(() => {
    if (!inView) return
    const ctrl = animate(mv, to, {
      duration,
      ease: 'easeOut',
      onUpdate: v =>
        setDisplay(decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString()),
    })
    return ctrl.stop
  }, [inView])

  return <span ref={ref}>{prefix}{display}{suffix}</span>
}

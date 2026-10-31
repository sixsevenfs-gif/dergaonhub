import { useEffect, useRef } from 'react'

// Motion-graphics background for the launch countdown, drawn on a canvas: rising bokeh lights,
// leaves tumbling in 3D with depth blur, groceries floating far behind, parallax on mouse or tilt.
// Made for cheap phones too: every blurred leaf, light and grocery is drawn once into a small
// picture (sprite) and each frame only moves those pictures. The amount of things and the frame
// rate follow the phone's power, and drop by themselves if frames start taking too long.
const LEAF = new Path2D('M3 21C3 10 10 3.5 22 2.5 21 14 14 21 3 21Z')
const VEIN = new Path2D('M4.5 19.5 15 9')
const GROCERIES = ['atta', 'oil', 'snacks', 'colddrinks', 'vegetables', 'dairy', 'rice', 'masala']
const LEAF_COLORS = ['#7CC24F', '#5FA63F', '#9BD46A', '#4E8F33']
const BACK = '#3E7A2A'
const BLURS = [0, 1.5, 3] // sharp, soft, far

// low / mid / high: how much to draw and how often
const TIERS = [
  { leaves: 10, bokeh: 8, items: 0, fps: 30, dpr: 1 },
  { leaves: 18, bokeh: 14, items: 4, fps: 30, dpr: 1.25 },
  { leaves: 28, bokeh: 22, items: 6, fps: 60, dpr: 1.5 },
]

const rand = (a, b) => a + Math.random() * (b - a)

function startTier() {
  const cores = navigator.hardwareConcurrency || 4
  const memory = navigator.deviceMemory || 4
  const small = window.innerWidth < 640
  if (cores <= 4 || memory <= 2) return 0
  if (small || cores <= 6 || memory <= 4) return 1
  return 2
}

function sprite(size, paint) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  paint(c.getContext('2d'), size)
  return c
}

// One leaf picture per colour and blur level, front and back.
function leafSprites() {
  const out = {}
  for (const blur of BLURS) {
    for (const color of [...LEAF_COLORS, BACK]) {
      out[`${color}|${blur}`] = sprite(64, (ctx) => {
        ctx.filter = blur ? `blur(${blur}px)` : 'none'
        ctx.translate(8, 8)
        ctx.scale(2, 2)
        ctx.fillStyle = color
        ctx.fill(LEAF)
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'
        ctx.lineWidth = 0.6
        ctx.stroke(VEIN)
      })
    }
  }
  return out
}

function bokehSprite(rgb) {
  return sprite(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, `rgba(${rgb},0.5)`)
    g.addColorStop(0.55, `rgba(${rgb},0.18)`)
    g.addColorStop(1, `rgba(${rgb},0)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
}

export default function LaunchBackground() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d', { alpha: true })
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let tier = startTier()
    let cfg = TIERS[tier]
    let w = 0
    let h = 0
    let raf = 0
    let last = performance.now()
    let lastDraw = 0
    let slowFrames = 0
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }

    const leafPics = leafSprites()
    const lights = { gold: bokehSprite('246,195,67'), green: bokehSprite('183,224,127') }
    // Groceries: soft and see-through, baked once when each picture arrives.
    const itemPics = GROCERIES.map((name) => {
      const pic = { canvas: null }
      const img = new Image()
      img.onload = () => {
        pic.canvas = sprite(120, (c, s) => {
          c.filter = 'blur(1.5px)'
          c.globalAlpha = 0.28
          c.drawImage(img, 6, 6, s - 12, s - 12)
        })
      }
      img.src = `/categories/${name}.webp`
      return pic
    })

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * cfg.dpr)
      canvas.height = Math.round(h * cfg.dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(cfg.dpr, 0, 0, cfg.dpr, 0, 0)
    }

    // depth z: 0 = far, 1 = near (bigger, faster, sharper, more parallax)
    const newLeaf = (anywhere, z = Math.random() ** 1.3) => ({
      z, x: rand(-0.05, 1.05) * w, y: anywhere ? rand(-0.1, 1) * h : rand(-0.2, -0.05) * h,
      size: 12 + z * (w < 640 ? 30 : 42), speed: 20 + z * 55, sway: rand(18, 50), phase: rand(0, 6.28),
      spin: rand(0.4, 1.3) * (Math.random() < 0.5 ? -1 : 1), flip: rand(0.8, 2), color: LEAF_COLORS[Math.floor(rand(0, 4))],
      blur: z < 0.3 ? 3 : z < 0.55 ? 1.5 : 0,
    })
    const newLight = (anywhere) => ({
      z: Math.random(), x: rand(0, 1) * w, y: anywhere ? rand(0, 1) * h : h + 40,
      r: rand(10, w < 640 ? 30 : 42), speed: rand(6, 18), phase: rand(0, 6.28), pic: Math.random() < 0.35 ? lights.gold : lights.green,
    })
    let leaves = []
    let bokeh = []
    let items = []
    const build = () => {
      leaves = Array.from({ length: cfg.leaves }, () => newLeaf(true)).sort((a, b) => a.z - b.z) // far first, kept in order
      bokeh = Array.from({ length: cfg.bokeh }, () => newLight(true))
      items = itemPics.slice(0, cfg.items).map((pic, i, all) => ({
        pic, z: rand(0.15, 0.45), size: (w < 640 ? 64 : 100) * rand(0.85, 1.15),
        x: (0.5 + (i % 2 ? 1 : -1) * rand(0.3, 0.46)) * w, y: ((i + 0.5) / all.length) * h, phase: rand(0, 6.28), rot: rand(-0.3, 0.3),
      }))
    }
    resize()
    build()

    const onMove = (e) => {
      pointer.tx = (e.clientX / w - 0.5) * 2
      pointer.ty = (e.clientY / h - 0.5) * 2
    }
    const onTilt = (e) => {
      if (e.gamma == null) return
      pointer.tx = Math.max(-1, Math.min(1, e.gamma / 30))
      pointer.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30))
    }
    const onResize = () => {
      resize()
      build()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('deviceorientation', onTilt, { passive: true })

    const draw = (t) => {
      raf = requestAnimationFrame(draw)
      if (t - lastDraw < 1000 / cfg.fps - 2) return // frame cap (30 fps on weaker phones)
      lastDraw = t
      const dt = Math.min(0.06, (t - last) / 1000)
      last = t
      const s = t / 1000

      // Too slow for a few seconds? Step down a level.
      if (dt > 0.045 && tier > 0) {
        if (++slowFrames > 45) {
          tier -= 1
          cfg = TIERS[tier]
          slowFrames = 0
          resize()
          build()
        }
      } else if (slowFrames > 0) {
        slowFrames -= 1
      }

      pointer.x += (pointer.tx - pointer.x) * 0.05
      pointer.y += (pointer.ty - pointer.y) * 0.05
      ctx.setTransform(cfg.dpr, 0, 0, cfg.dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      for (const it of items) {
        if (!it.pic.canvas) continue
        const x = it.x - pointer.x * 30 * it.z + Math.sin(s * 0.4 + it.phase) * 12
        const y = it.y - pointer.y * 20 * it.z + Math.cos(s * 0.5 + it.phase) * 16
        const a = it.rot + Math.sin(s * 0.3 + it.phase) * 0.12
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        ctx.setTransform(cos * cfg.dpr, sin * cfg.dpr, -sin * cfg.dpr, cos * cfg.dpr, x * cfg.dpr, y * cfg.dpr)
        ctx.drawImage(it.pic.canvas, -it.size / 2, -it.size / 2, it.size, it.size)
      }
      ctx.setTransform(cfg.dpr, 0, 0, cfg.dpr, 0, 0)

      ctx.globalCompositeOperation = 'lighter'
      for (const b of bokeh) {
        if (!still) {
          b.y -= b.speed * dt
          b.x += Math.sin(s * 0.5 + b.phase) * 0.15
        }
        if (b.y < -60) Object.assign(b, newLight(false))
        ctx.globalAlpha = 0.5 + Math.sin(s * 1.3 + b.phase) * 0.4
        const d = b.r * 2
        ctx.drawImage(b.pic, b.x - pointer.x * 40 * b.z - b.r, b.y - pointer.y * 25 * b.z - b.r, d, d)
      }
      ctx.globalCompositeOperation = 'source-over'

      for (const l of leaves) {
        if (!still) {
          l.y += l.speed * dt
          l.phase += dt
        }
        if (l.y > h + 60) Object.assign(l, newLeaf(false, l.z), { y: rand(-0.2, -0.05) * h })
        const x = l.x + Math.sin(l.phase * 0.9) * l.sway - pointer.x * 60 * l.z
        const y = l.y - pointer.y * 35 * l.z
        const turn = Math.cos(l.phase * l.flip) // 3D flip: narrow when edge-on, darker back side
        const sx = (0.25 + Math.abs(turn) * 0.75) * l.size / 48
        const sy = l.size / 48
        const a = l.phase * l.spin
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        ctx.globalAlpha = 0.4 + l.z * 0.55
        ctx.setTransform(cos * sx * cfg.dpr, sin * sx * cfg.dpr, -sin * sy * cfg.dpr, cos * sy * cfg.dpr, x * cfg.dpr, y * cfg.dpr)
        ctx.drawImage(leafPics[`${turn > 0 ? l.color : BACK}|${l.blur}`], -32, -32)
      }
      ctx.globalAlpha = 1
    }

    const onVisible = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) {
        last = lastDraw = performance.now()
        raf = requestAnimationFrame(draw)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('deviceorientation', onTilt)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return <canvas ref={ref} className="pointer-events-none absolute inset-0" aria-hidden="true" />
}

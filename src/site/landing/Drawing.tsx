import type { ReactNode } from 'react'

// The drawings: a traced fine-line machine (public/brand/assets) with Gasket's
// own cards over it as real text, joined by violet leader lines. Each drawing
// is one labelled image; its parts sit in a viewBox of the drawing's own size,
// so the leaders, dots and cards stay on the machine at every width.

/** A whole drawing, one labelled image; landing.css gives `drawing-<name>` its box's aspect ratio. */
export function Drawing({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  return (
    <figure className={`drawing drawing-${name}`} role="img" aria-label={label}>
      <div className="drawing-box">{children}</div>
    </figure>
  )
}

/** A machine drawing (its served path) placed in the box (its position and size are set in landing.css by `className`). */
export function Machine({ src, className }: { src: string; className: string }) {
  return <img className={`drawing-machine ${className}`} src={src} alt="" />
}

/** The violet leader lines and the dots where they meet the machine. */
export function Leaders({ width, height, paths, dots, arrow }: { width: number; height: number; paths: string[]; dots: [number, number][]; arrow?: string }) {
  return (
    <svg className="drawing-leaders" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">
      {arrow && <path className="drawing-return" d={arrow} />}
      {paths.map(path => <path key={path} d={path} />)}
      {dots.map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r={7} />)}
    </svg>
  )
}

/** A white card on the drawing; `className` places it. */
export function Callout({ className, children }: { className: string; children: ReactNode }) {
  return <div className={`callout ${className}`}>{children}</div>
}

/** A step number in a violet circle. */
export const Step = ({ n }: { n: number }) => <span className="callout-step" aria-hidden="true">{n}</span>

// Pieces every homepage section shares: the section frame with its stage-and-date
// eyebrow, ultramarine heading and lead, initials avatars and the painted art.
import type { ReactNode } from 'react'

type Tone = 'white' | 'pale' | 'band'

/** One story section: eyebrow, heading and lead (left, centred or beside the drawing; `after` sits under the lead), then the drawing. */
export function Section({ id, tone = 'white', eyebrow, title, lead, after, align = 'left', layout = 'stack', children }: {
  id: string; tone?: Tone; eyebrow: string; title: ReactNode; lead: ReactNode; after?: ReactNode; align?: 'left' | 'center'
  layout?: 'stack' | 'copy-left' | 'copy-right'; children: ReactNode
}) {
  const copy = (
    <div className={`section-copy copy-${align}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={`${id}-title`}>{title}</h2>
      <p className="lead">{lead}</p>
      {after}
    </div>
  )
  return (
    <section className={`section section-${tone} layout-${layout}`} id={id} aria-labelledby={`${id}-title`}>
      <div className="wrap">
        {layout === 'copy-right' ? <>{children}{copy}</> : <>{copy}{children}</>}
      </div>
    </section>
  )
}

/** Initials on a soft disc, the way the app shows a person. */
export function Avatar({ initials, tone = 'blue' }: { initials: string; tone?: 'blue' | 'copper' | 'slate' | 'solid-blue' | 'solid-copper' | 'solid-slate' }) {
  return <span className={`avatar avatar-${tone}`} aria-hidden="true">{initials}</span>
}

/** A painted plate in AVIF and WebP at three widths, with an optional phone crop below `phoneBelow` px. */
export function Art({ name, width, height, phone, phoneBelow = 760, className, alt = '', eager = false }: {
  name: string; width: number; height: number; phone?: { name: string; widths: number[]; width: number; height: number }
  phoneBelow?: number; className?: string; alt?: string; eager?: boolean
}) {
  const set = (format: string) => [768, 1152, 1536].map(w => `/site/${name}-${w}.${format} ${w}w`).join(', ')
  const phoneSet = (format: string) => phone!.widths.map(w => `/site/${phone!.name}-${w}.${format} ${w}w`).join(', ')
  const media = `(max-width: ${phoneBelow - 1}px)`
  return (
    <picture className={className}>
      {phone ? <source media={media} type="image/avif" srcSet={phoneSet('avif')} sizes="100vw" width={phone.width} height={phone.height} /> : null}
      {phone ? <source media={media} type="image/webp" srcSet={phoneSet('webp')} sizes="100vw" width={phone.width} height={phone.height} /> : null}
      <source type="image/avif" srcSet={set('avif')} sizes="100vw" />
      <source type="image/webp" srcSet={set('webp')} sizes="100vw" />
      <img src={`/site/${name}-1536.webp`} alt={alt} width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : undefined} />
    </picture>
  )
}

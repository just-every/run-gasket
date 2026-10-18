import { demo } from '../links'

/** The hero's actions: Run Gasket → to /run, then the demo and the docs as text links. */
export function Actions() {
  return (
    <div className="actions">
      <a className="btn" href="/run">Run Gasket →</a>
      <p className="actions-links">
        <a href={demo}>Try the demo</a>
        <a href="/docs">Read the docs</a>
      </p>
    </div>
  )
}

/** The page's two actions: Run Gasket (the Run page) and the docs. */
export function Actions() {
  return (
    <div className="landing-actions">
      <a className="pill" href="/run">Run Gasket <span aria-hidden="true">→</span></a>
      <a className="pill" href="https://demo.run-gasket.com/">Try the demo</a>
      <a className="landing-docs" href="/docs">Read the docs</a>
    </div>
  )
}

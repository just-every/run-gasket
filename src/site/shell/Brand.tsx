/** The mark (a copper gasket squeezed between two cobalt flanges) and the Gasket wordmark, linking home. */
export function Brand({ size = 38 }: { size?: number }) {
  return (
    <a className="site-brand" href="/">
      <img src="/brand/mark.svg" alt="" width={size} height={size} />
      Gasket
    </a>
  )
}

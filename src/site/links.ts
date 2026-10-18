import pkg from '../../package.json'

// Where the run site's links go: the public source repository is package.json's.
export const repository: string = pkg.repository
export const license = `${repository}/blob/main/LICENSE`
/** The hosted demo (deploy-demo.json, DEMO.md): each visitor gets their own signed-in copy with sample data. */
export const demo = 'https://demo.run-gasket.com/'

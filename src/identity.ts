// This edition's identity: what its installed Lobby and its run site say.
// The name and colour are the ones setup saves in src/branding.json.
import type { EditionIdentity } from './base/identity'
import branding from './branding.json'
import site from '../deploy-site.json'

export const identity: EditionIdentity = {
  product: branding.name,
  deployment: branding.name,
  purpose: '{deployment} keeps this plant\'s equipment in service: the asset register, preventive schedules, work orders, inspections, parts and downtime history.',
  tagline: 'Gasket turns operator requests, PM schedules and sensor readings into work with parts and people. 100% free, open source alternative to MaintainX, UpKeep and Fiix.',
  signInPath: '/signin',
  // The run site `rer deploy --site` publishes (deploy-site.json).
  runSite: `https://${site.domain}`,
  // An installed instance serves the Lobby at /.
  installedHome: 'lobby',
  theme: '/rer-theme.css',
  mark: '/brand/mark.svg',
  // Linked before the theme on the Lobby and the Run pages: Gasket's look (the faces are in the theme).
  fonts: '/look.css',
  accentColor: branding.primaryColor,
}

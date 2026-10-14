// This edition's identity: what its installed Lobby and its run site say.
// The name and colour are the ones setup saves in src/branding.json.
import type { EditionIdentity } from './base/identity'
import branding from './branding.json'
import site from '../deploy-site.json'

export const identity: EditionIdentity = {
  product: branding.name,
  deployment: branding.name,
  purpose: '{deployment} keeps this site\'s equipment in service: the asset register, preventive schedules, work orders, inspections, parts and downtime history.',
  tagline: 'Maintenance for the equipment a small team owns: schedules, work orders, inspections, parts and downtime, kept by the owner.',
  signInPath: '/signin',
  // The run site `rer deploy --site` publishes (deploy-site.json).
  runSite: `https://${site.domain}`,
  // An installed instance serves the Lobby at /.
  installedHome: 'lobby',
  theme: '/rer-theme.css',
  mark: '/brand/mark.svg',
  // The run site's ground strip (/run, the 404): the floor line with the equipment row small at the right.
  band: '/brand/ground.svg',
  fonts: '/fonts/fonts.css',
  accentColor: branding.primaryColor,
}

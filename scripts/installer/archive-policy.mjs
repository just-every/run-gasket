// Restore imports inert domain data. Source automation is unchanged by export.
// Owners must rotate the webhook signing key and explicitly resume each rule.
export default {
  includeTables: ['oa_operators', 'oa_bootstrap', 'oa_external_identities', 'oa_invitation_cancellations', 'oa_auth_settings', 'oa_auth_audit', 'oa_domain_rules', 'oa_logout_events', 'oc_owner_claims', 'oc_idp_grants'],
  excludeTables: ['rer_dependency_keys', 'rer_dependency_pending', 'rer_dependency_codes'],
  product: ['runeditrun', 'foundation'].join('/'),
  requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
  exportRow(table, row) {
    // An encrypted connector signing key is still a secret, even without its wrapping key.
    if (table === 'gk_api_credentials') return { ...row, token_hash: `inactive-${row.id}` }
    return table === 'gk_connector_subscriptions' ? { ...row, secret_cipher: '' } : row
  },
  importSafety: {
    gk_resource_grants: { active: [0] },
    gk_api_credentials: { revoked_at: [0] },
    gk_automation_rules: { paused: [1], reason: ['Restored inactive; review before resuming.'] },
    gk_schedules: { active: [0] },
    gk_connector_subscriptions: { paused: [1], secret_cipher: [''] },
  },
  importRow(table, row) {
    if (table === 'gk_resource_grants') return { ...row, active: 0 }
    if (table === 'gk_api_credentials') return { ...row, revoked_at: 0, token_hash: `inactive-${row.id}` }
    if (table === 'gk_automation_rules') return { ...row, paused: 1, reason: 'Restored inactive; review before resuming.' }
    if (table === 'gk_schedules') return { ...row, active: 0 }
    if (table === 'gk_connector_subscriptions') return { ...row, paused: 1, secret_cipher: '' }
    return row
  },
}

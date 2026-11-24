// @ts-nocheck
/*global browser, chrome*/

const RULE_ID_START = 10000
const RULE_ID_END = 19999
let syncQueue = Promise.resolve()

export function normalizeHttpsRedirectDomain(value) {
  const input = String(value || '').trim().toLowerCase()
  if (!input || input.includes('*') || input.includes('/') || input.includes(':')) {
    return ''
  }

  try {
    const url = new URL(`http://${input}/`)
    return url.hostname || ''
  } catch {
    return ''
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildHttpsRedirectRules(domains) {
  const uniqueDomains = [...new Set(
    (domains || [])
      .map(normalizeHttpsRedirectDomain)
      .filter(Boolean)
  )].sort()

  return uniqueDomains.map((domain, index) => ({
    id: RULE_ID_START + index,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        regexSubstitution: `http://${domain}\\1`
      }
    },
    condition: {
      regexFilter: `^https://${escapeRegex(domain)}(?::443)?(/.*)?$`,
      resourceTypes: ['main_frame']
    }
  }))
}

export function updateHttpsRedirectRules(domains) {
  const rules = buildHttpsRedirectRules(domains)
  syncQueue = syncQueue
    .catch(() => undefined)
    .then(() => applyHttpsRedirectRules(rules))
  return syncQueue
}

async function applyHttpsRedirectRules(rules) {
  const extension = getRedirectExtension()
  if (!extension) {
    console.warn('HTTPS redirect rules are not supported by this browser')
    return false
  }

  const existingRules = await getDynamicRules(extension)
  const removeRuleIds = existingRules
    .filter(rule => rule.id >= RULE_ID_START && rule.id <= RULE_ID_END)
    .map(rule => rule.id)

  if (!removeRuleIds.length && !rules.length) return true

  await updateDynamicRules(extension, {
    removeRuleIds,
    addRules: rules
  })
  return true
}

function getRedirectExtension() {
  const hasBrowserApi = typeof browser !== 'undefined'
  const isFirefox =
    hasBrowserApi &&
    typeof browser.runtime?.getBrowserInfo === 'function' &&
    browser.declarativeNetRequest

  if (isFirefox) {
    return { api: browser, isFirefox: true }
  }
  if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest) {
    return { api: chrome, isFirefox: false }
  }
  return null
}

function getDynamicRules(extension) {
  if (extension.isFirefox) {
    return extension.api.declarativeNetRequest.getDynamicRules()
  }

  return new Promise((resolve, reject) => {
    extension.api.declarativeNetRequest.getDynamicRules(rules => {
      const error = extension.api.runtime?.lastError
      error ? reject(new Error(error.message)) : resolve(rules || [])
    })
  })
}

function updateDynamicRules(extension, options) {
  if (extension.isFirefox) {
    return extension.api.declarativeNetRequest.updateDynamicRules(options)
  }

  return new Promise((resolve, reject) => {
    extension.api.declarativeNetRequest.updateDynamicRules(options, () => {
      const error = extension.api.runtime?.lastError
      error ? reject(new Error(error.message)) : resolve(undefined)
    })
  })
}

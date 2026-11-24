// @ts-nocheck
/*global browser, chrome*/
export const isIP = address =>
  /^(?!0)(?!.*\.$)((1?\d?\d|25[0-5]|2[0-4]\d)(\.|$)){4}$/.test(address)
export const isDomain = name =>
  /localhost/.test(name) ||
  /^((?:(?:(?:\w[\.\-\+]?)*)\w)+)((?:(?:(?:\w[\.\-\+]?){0,62})\w)+)\.(\w{2,6})$/.test(
    name
  )
export const isLocalHost = name => /\w+/.test(name)  
export const isProxy = proxy => /^SOCKS/.test(proxy)
export const removeComment = str => str.replace(/#.+/gm, '')

export const splitLines = (content) => {
  return removeComment(content).split('\n')
    .filter(line => line.trim() !== '')
    .map(line => line.trim().split(/\s/))
    .map(hosts => {
      return hosts.filter(host => {
        return host.trim() !== ''
      })
    })
}
export const getHosts = (lines) => {
  return lines.filter(host =>
    isIP(
      host[0].indexOf(':') > 0
        ? host[0].substr(0, host[0].indexOf(':'))
        : host[0]
    )
  )
}
export const getAddress = (add) => {
  return add.indexOf(':') > -1 ? add : add + ':80'
}
export const getProxies = (lines) => {
  return lines.filter(proxy => isProxy(proxy[0]))
}

export const getHostEntries = content => {
  const entries = []
  getHosts(splitLines(content)).forEach(([address, ...domains]) => {
    domains.forEach(domain => entries.push({ domain, address }))
  })
  return entries
}

export const parseRules = content => {
  const lines = splitLines(content)
  const proxies = getProxies(lines)

  const hostContent = getHostEntries(content).map(({ domain, address }) => {
    return `      if (host == "${domain}") return "PROXY ${address}; DIRECT";`
  }).join('\n')

  // const getHostContent = arr => {
  //   let hosts = arr.slice()
  //   let address = getAddress(hosts.shift())
  //   let result = []
  //
  //   hosts.forEach(host => {
  //     result.push(`if(host == "${host}"){ return "PROXY ${address}; SYSTEM"; }`)
  //   })
  //   return result.join('\n')
  // }
  const getProxyContent = arr => {
    let method = arr.slice()
    let address = method.shift()
    let result = ''

    method.forEach(add => {
      result += `${address} ${add}; `
    })
    return result
  }

  let proxyContent = proxies.reduce(
    (sum, value) => (sum += getProxyContent(value)),
    ''
  )

  return { hostContent, proxyContent }
}

export function setProxy(content) {
  const result = parseRules(content)
  const defaultMethod =
    localStorage.getItem('AWESOME_HOST_otherProxies') || 'DIRECT'

  const pacContent = `
  function FindProxyForURL(url, host) {
    if (shExpMatch(url, "http:*") || shExpMatch(url, "https:*")) {
${result.hostContent}
      return "${result.proxyContent ? result.proxyContent + ' ' + defaultMethod : defaultMethod}";
    }
    
    return "DIRECT";
  }`
  return updateProxy(result, pacContent)
}

export async function clearProxy() {
  console.log('clear.')
  const extension = getProxyExtension()
  if (!extension) {
    throw new Error('当前浏览器不支持 proxy 扩展 API')
  }

  if (extension.isFirefox) {
    await ensureFirefoxPrivateAccess(extension.api)
    await extension.api.proxy.settings.clear({})
    return
  }

  await new Promise((resolve, reject) => {
    extension.api.proxy.settings.clear({ scope: 'regular' }, () => {
      const error = extension.api.runtime?.lastError
      error ? reject(new Error(error.message)) : resolve(undefined)
    })
  })
}

async function updateProxy(result, pacContent) {
  console.log('proxy to:\n' + pacContent)
  const extension = getProxyExtension()
  if (!extension) {
    throw new Error('当前浏览器不支持 proxy 扩展 API')
  }

  if (extension.isFirefox) {
    await ensureFirefoxPrivateAccess(extension.api)
    await extension.api.proxy.settings.clear({})

    if (result.hostContent === '' && result.proxyContent === '') return

    const autoConfigUrl =
      'data:application/x-ns-proxy-autoconfig;charset=utf-8,' +
      encodeURIComponent(pacContent)
    await extension.api.proxy.settings.set({
      value: {
        proxyType: 'autoConfig',
        autoConfigUrl
      }
    })
    return
  }

  await clearProxy()
  if (result.hostContent === '' && result.proxyContent === '') return

  await new Promise((resolve, reject) => {
    extension.api.proxy.settings.set(
      {
        value: {
          mode: 'pac_script',
          pacScript: {
            data: pacContent
          }
        },
        scope: 'regular'
      },
      () => {
        const error = extension.api.runtime?.lastError
        error ? reject(new Error(error.message)) : resolve(undefined)
      }
    )
  })
}

function getProxyExtension() {
  const hasBrowserApi = typeof browser !== 'undefined'
  const isFirefox =
    hasBrowserApi &&
    typeof browser.runtime?.getBrowserInfo === 'function' &&
    browser.proxy?.settings

  if (isFirefox) {
    return { api: browser, isFirefox: true }
  }
  if (typeof chrome !== 'undefined' && chrome.proxy?.settings) {
    return { api: chrome, isFirefox: false }
  }
  return null
}

async function ensureFirefoxPrivateAccess(api) {
  if (typeof api.extension?.isAllowedIncognitoAccess !== 'function') return

  const allowed = await api.extension.isAllowedIncognitoAccess()
  if (!allowed) {
    throw new Error('请在 Firefox 扩展设置中允许此扩展“在隐私窗口中运行”，然后重试')
  }
}

import { h, Component } from 'preact'
import { isIP, isDomain, isLocalHost, isProxy, removeComment, setProxy, clearProxy, getHostEntries } from './proxy'
import { updateHttpsRedirectRules } from './httpsRedirect'
import {SvgIcon} from "./Svg";
import {shortUuid} from "./uuid";

// 类型定义
interface Category { id: string; name: string; enabled: boolean }
interface Host { cid: string; content: string }
interface Notice { type: string; content: string; active: boolean }

interface AppState {
  categories: Category[]
  hosts: Host[]
  enabled: boolean
  selected: string | null
  content: string
  editing: string
  notice: Notice
}

export default class App extends Component<{}, AppState> {
  DB_PREFIX = 'AWESOME_HOST_'

  inputRefs: Record<string, HTMLInputElement> = {};
  textarea: HTMLTextAreaElement | null = null;
  lineNumbers: HTMLDivElement | null = null;

  constructor() {
    super()
    this.state = {
      categories: [],
      hosts: [],
      enabled: true,
      selected: null,
      content: '',
      editing: '',
      notice: { type: 'error', content: '', active: false }
    }
  }

  componentDidMount() {
    const categories = this.getData('categories') || []
    const hosts = this.getData('hosts') || []
    const enabled = this.getData('enabled')
    const selected = this.getData('selected')

    this.setState({ categories, hosts, enabled: enabled ?? true }, () => {
      this.syncHttpsRedirects()
      if (hosts.length) {
        setTimeout(() => {
          if (selected) {
            this.handleLoadHost(selected)
          } else {
            this.loadAllHost(categories, hosts)
          }
        }, 300)
      }
    })
  }
  componentDidUpdate() {
    this.saveData('categories')
    this.saveData('hosts')
    this.saveData('enabled')
  }

  // storage
  saveData(key: string, value?: any) {
    localStorage.setItem(
      `${this.DB_PREFIX}${key}`,
      value !== undefined ? JSON.stringify(value) : JSON.stringify(this.state[key as keyof AppState])
    )
  }
  getData(key: string) {
    const value = localStorage.getItem(`${this.DB_PREFIX}${key}`)
    try {
      return value ? JSON.parse(value) : null
    } catch {
      return value
    }
  }

  // category
  getCategoryMap(categories: Category[]) {
    return categories.reduce((map, c) => {
      map[c.id] = { name: c.name, enabled: c.enabled }
      return map
    }, {} as Record<string, { name: string; enabled: boolean }>)
  }
  updateProxy() {
    this.syncHttpsRedirects()
    setTimeout(async () => {
      const content = this.getHostContent(this.state.hosts)
      try {
        if (this.state.enabled) await setProxy(content)
        else await clearProxy()
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误'
        this.notice(`代理设置失败：${message}`)
      }
    }, 300)
  }
  syncHttpsRedirects() {
    const domains: string[] = []
    if (this.state.enabled) {
      this.state.categories
        .filter(category => category.enabled)
        .forEach(category => {
          getHostEntries(this.getHostContentById(category.id))
            .forEach(entry => domains.push(entry.domain))
        })
    }

    updateHttpsRedirectRules(domains).catch(error => {
      console.warn('Unable to update HTTPS redirect rules:', error)
    })
  }
  onToggleEnableAll = () => {
    this.setState(
      s => ({ enabled: !s.enabled }),
      () => this.updateProxy()
    )
  }
  toggleEnable = (id: string) => {
    this.setState(
      s => ({
        categories: s.categories.map(c =>
          c.id === id ? { ...c, enabled: !c.enabled } : c
        )
      }),
      () => {
        if (this.state.selected) this.setCurrentContent(this.state.selected)
        else this.loadAllHost(this.state.categories, this.state.hosts)
        this.updateProxy()
      }
    )
  }
  editCategory = (id: string, name: string) => {
    this.setState(s => ({
      categories: s.categories.map(c => (c.id === id ? { ...c, name } : c))
    }))
  }
  addCategory = (name: string) => {
    const id = shortUuid()
    this.setState(s => ({
      categories: [...s.categories, { id, name, enabled: true }]
    }))
  }
  removeCategory = (id: string | null) => {
    if (!id) return this.notice('请选择分组')

    const idx = this.state.categories.findIndex(c => c.id === id)
    const targetIdx = idx + 1 === this.state.categories.length
      ? idx - 1
      : Math.min(this.state.categories.length - 1, idx + 1)
    const selected = this.state.categories[targetIdx]?.id ?? null

    this.setState(
      s => ({
        categories: s.categories.filter(c => c.id !== id),
        hosts: s.hosts.filter(h => h.cid !== id),
        selected
      }), () => {
        this.setState({ content: this.getHostContentById(this.state.selected) })
        this.saveData('selected', this.state.selected)
        this.updateProxy()
      }
    )
  }

  // host
  loadAllHost = (categories: Category[], hosts: Host[]) => {
    const cMap = this.getCategoryMap(categories)
    let content = ''
    hosts.forEach(h => {
      if (cMap[h.cid] && cMap[h.cid].enabled) {
        content += `# ${cMap[h.cid].name}\n${h.content}\n`
      }
    })
    this.setState({ selected: null, content })
    this.saveData('selected', null)
  }
  getHostContent(hosts: Host[]) {
    let result = ''
    const cMap = this.getCategoryMap(this.state.categories)
    hosts
      .filter(h => cMap[h.cid] && cMap[h.cid].enabled)
      .forEach(h => (result += h.content + '\n'))
    return result
  }
  setCurrentContent(id: string | null) {
    this.setState({ content: this.getHostContentById(id) })
  }
  getHostContentById(id: string | null) {
    if (!id) return ''
    const host = this.state.hosts.find(h => h.cid === id)
    return host ? host.content : ''
  }
  handleLoadHost = (id: string) => {
    this.setState({ selected: id, content: this.getHostContentById(id) })
    this.saveData('selected', id)
    setTimeout(() => {
      this.textarea?.focus()
      if (this.textarea) this.textarea.scrollTop = 0
      if (this.lineNumbers) this.lineNumbers.scrollTop = 0
    }, 100)
  }
  editHost = (content?: string) => {
    if (typeof content === 'string') {
      this.setState({ content })
    }
  }
  handleSave = (e: any) => {
    if (e.altKey) {
      this.copyHost()
    } else {
      this.saveHost()
    }
  }
  saveHost = () => {
    const { selected, content, hosts } = this.state
    if (!selected) return this.notice('请先选择分组')
    const error = this.validate(content)
    if (error) return this.notice(error)
    let found = false
    const newHosts = hosts.map(h => {
      if (h.cid === selected) {
        found = true
        return { ...h, content }
      }
      return h
    })
    if (!found) newHosts.push({ cid: selected, content })
    this.setState({ hosts: newHosts }, () => this.updateProxy())
  }
  removeComment(content: string) {
    return content.replace(/#.+/gm, '')
  }
  validate(value: string) {
    const rules = removeComment(value.trim()).split('\n')
    let ipRE = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?::(6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5]|[1-5]?\d{1,4}))?$/
    let error: string | null = null
    rules.forEach((rule: string) => {
      let r = rule.split(/\s+/)
      if (isProxy(r[0])) {
        if (!ipRE.test(r[1])) {
          return this.notice("IP 地址不正确")
        }
        return
      }
      if (!ipRE.test(r[0])) {
        return this.notice("IP 地址不正确")
      }
      if (!r[1] || r[1].trim() === "") {
        return this.notice("Host 地址不能为空")
      }
      r.shift()
      if (r.length) {
        r.filter(h => h.trim() !== '').forEach(h => {
          let isValidHost = isDomain(h) || isLocalHost(h)
          if (!isValidHost) error = `host name[${r}] maybe not valid.`
        })
      }
    })
    return error
  }
  notice(content: string) {
    toastMessage(content)
  }
  copyHost = () => {
    this.notice('Host content is copied.')
    this.copy(this.state.content)
  }
  copy(text: string) {
    const input = document.createElement('textarea')
    document.body.appendChild(input)
    input.value = text
    input.focus()
    input.select()
    document.execCommand('Copy')
    input.remove()
  }

  getRuleCount(content: string) {
    return removeComment(content)
      .split('\n')
      .filter((line: string) => line.trim() !== '').length
  }

  getCategoryRuleCount(id: string) {
    return this.getRuleCount(this.getHostContentById(id))
  }

  getActiveRuleCount() {
    return this.state.categories
      .filter(category => category.enabled)
      .reduce((total, category) => total + this.getCategoryRuleCount(category.id), 0)
  }

  render() {
    const { categories, enabled, selected, content, hosts, editing } = this.state
    const selectedCategory = categories.find(category => category.id === selected)
    const selectedIndex = selectedCategory
      ? categories.findIndex(category => category.id === selectedCategory.id)
      : -1
    const isAllView = !selectedCategory
    const activeGroupCount = categories.filter(category => category.enabled).length
    const activeRuleCount = this.getActiveRuleCount()
    const currentRuleCount = this.getRuleCount(content)
    const isDirty = Boolean(
      selectedCategory && content !== this.getHostContentById(selectedCategory.id)
    )
    const lineCount = Math.max(1, content.split('\n').length)
    const lineNumbers = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n')
    const sheetIndex = isAllView
      ? 'ALL'
      : `0${selectedIndex + 1}`.slice(-2)

    return (
      <div className={`ledger-app${enabled ? '' : ' proxy-paused'}${isAllView ? ' is-all-view' : ''}${isDirty ? ' is-dirty' : ''}`}>
        <header className="ledger-masthead">
          <div className="ledger-brand">
            <span className="ledger-monogram">AH</span>
            <div>
              <strong>THE HOST LEDGER</strong>
              <span>Local routing notes · Est. 2017</span>
            </div>
          </div>
          <div className="masthead-meta">
            <span>Vol. 07</span>
            <span className="issue-line"></span>
            <span>{categories.length} Groups</span>
            <span className="ledger-live" aria-live="polite">
              {enabled ? 'Live' : 'Paused'}
            </span>
            <a
              className="masthead-settings"
              href="options.html"
              target="_blank"
              rel="noreferrer"
              title="Open settings"
              aria-label="Open settings"
            >
              <SvgIcon name="setting" />
            </a>
          </div>
        </header>

        <div className="ledger-body">
          <aside className="ledger-sidebar">
            <div className="all-hosts-entry">
              <div
                className={`all-hosts-select${isAllView ? ' is-selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => this.loadAllHost(categories, hosts)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    this.loadAllHost(categories, hosts)
                  }
                }}
              >
                <span className="all-hosts-kicker">Master switch</span>
                <strong>All hosts</strong>
                <small>
                  {enabled
                    ? `${activeGroupCount} of ${categories.length} groups in use`
                    : 'All proxying is paused'}
                </small>
              </div>
              <button
                className={`all-hosts-toggle${enabled ? ' is-on' : ''}`}
                type="button"
                onClick={this.onToggleEnableAll}
                aria-label={enabled ? 'Pause all hosts' : 'Enable all hosts'}
                aria-pressed={enabled}
              >
                <span className="switch-track"><span className="switch-thumb"></span></span>
              </button>
            </div>

            <div className="ledger-section-title">
              <span>Filed groups</span>
              <span>{activeRuleCount} routes</span>
            </div>

            <div className="group-list">
              {categories.map((category, index) => {
                const ruleCount = this.getCategoryRuleCount(category.id)
                return (
                  <div
                    key={category.id}
                    data-id={category.id}
                    className={`group-item${category.enabled ? ' is-enabled' : ' is-disabled'}${selected === category.id ? ' is-selected' : ''}`}
                  >
                    <div
                      className="group-select"
                      role="button"
                      tabIndex={0}
                      onClick={() => this.handleLoadHost(category.id)}
                      onDblClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        this.handleEdit(category.id)
                      }}
                      onKeyDown={e => {
                        if (e.target instanceof HTMLInputElement) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          this.handleLoadHost(category.id)
                        }
                      }}
                    >
                      <span className="group-index">
                        {`0${index + 1}`.slice(-2)}
                      </span>
                      <span className="group-copy">
                        {editing === category.id
                          ? (
                            <input
                              className="update-input"
                              ref={el => {
                                if (el) this.inputRefs[category.id] = el
                              }}
                              type="text"
                              value={category.name}
                              aria-label="Group name"
                              onBlur={() => this.handleBlur(category.id)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === 'Escape') {
                                  e.preventDefault()
                                  this.handleBlur(category.id)
                                  this.focusTextarea()
                                }
                              }}
                              onClick={e => e.stopPropagation()}
                              onDblClick={e => e.stopPropagation()}
                              onInput={e => this.handleChange(category.id, e)}
                            />
                          )
                          : <span className="group-name">{category.name}</span>
                        }
                        <span className="group-meta">
                          {ruleCount} {ruleCount === 1 ? 'rule' : 'rules'}
                        </span>
                      </span>
                    </div>
                    <button
                      className={`group-toggle${category.enabled ? ' is-on' : ''}`}
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        this.toggleEnable(category.id)
                      }}
                      aria-label={`${category.enabled ? 'Pause' : 'Enable'} ${category.name}`}
                      aria-pressed={category.enabled}
                    >
                      <span className="switch-track"><span className="switch-thumb"></span></span>
                    </button>
                  </div>
                )
              })}
            </div>

            <button
              className="add-group-button"
              type="button"
              onClick={() => this.addCategory('unnamed')}
            >
              <span aria-hidden="true">+</span>
              Add a new group
            </button>
            <p className="ledger-footnote">Select a group and use Rename, or double-click its name.</p>
          </aside>

          <main className="ledger-main">
            <header className="ledger-article-head">
              <div>
                <span className="article-kicker">
                  {isAllView ? 'Master file' : 'Rule sheet'}
                </span>
                <h1>{isAllView ? 'All hosts' : selectedCategory.name}</h1>
                <p>
                  {isAllView
                    ? `${activeGroupCount} of ${categories.length} groups in use · ${activeRuleCount} active routes`
                    : `${selectedCategory.enabled ? 'Enabled' : 'Paused'} · ${currentRuleCount} ${currentRuleCount === 1 ? 'rule' : 'rules'}`}
                </p>
              </div>
              <div className="article-actions">
                <button
                  className="rename-button"
                  type="button"
                  disabled={isAllView}
                  onClick={() => selected && this.handleEdit(selected)}
                >
                  <SvgIcon name="edit" />
                  Rename
                </button>
                <button
                  className="delete-button"
                  type="button"
                  disabled={isAllView}
                  onClick={() => this.removeCategory(selected)}
                >
                  <SvgIcon name="trash" />
                  Delete
                </button>
                <span className="ledger-save-state">
                  {isAllView ? 'Read only' : isDirty ? 'Edited' : 'Filed'}
                </span>
              </div>
            </header>

            <section className="rule-sheet">
              <header className="sheet-head">
                <div>
                  <span>Active file</span>
                  <strong>
                    {currentRuleCount} {currentRuleCount === 1 ? 'rule' : 'rules'}
                  </strong>
                </div>
                <span className="sheet-index">No. {sheetIndex} / PAC</span>
              </header>
              <div className="editor-body sheet-body">
                <div
                  className="line-numbers"
                  ref={element => {
                    this.lineNumbers = element
                  }}
                  aria-hidden="true"
                >
                  {lineNumbers}
                </div>
                <textarea
                  ref={element => {
                    this.textarea = element
                  }}
                  id="textarea"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  name="host"
                  value={content}
                  onInput={(e: any) => this.editHost(e.target?.value)}
                  onScroll={(e: any) => {
                    if (this.lineNumbers) {
                      this.lineNumbers.scrollTop = e.currentTarget.scrollTop
                    }
                  }}
                  readOnly={isAllView}
                  wrap="off"
                  spellcheck={false}
                  placeholder="127.0.0.1 localhost"
                />
              </div>
              <footer className="sheet-footer">
                <span>
                  {isAllView
                    ? 'Select a group to edit its rules.'
                    : 'Alt-click Apply rules to copy instead.'}
                </span>
                <div>
                  <button className="copy-button" type="button" onClick={this.copyHost}>
                    Copy
                  </button>
                  <button className="apply-button" type="button" onClick={this.handleSave}>
                    Apply rules
                  </button>
                </div>
              </footer>
            </section>
          </main>
        </div>
      </div>
    )
  }

  handleChange(id: string, e: any) {
    this.editCategory(id, e.target.value)
  }
  handleBlur(id: string) {
    this.setState({ ...this.state, editing: "" })
  }

  handleEdit(id: string) {
    this.setState({
      selected: id,
      editing: id,
      content: this.getHostContentById(id)
    }, () => {
      this.saveData('selected', id)
      this.inputRefs[id]?.select()
    })
  }
  focusTextarea() {
    if (this.textarea) {
      this.textarea.focus()
    }
  }
}

function toastMessage(text: string) {
  console.error(text);
  if ((window as any).Toastify) {
    var toast = (window as any).Toastify({
      text,
      duration: 3000,
      position: 'center',
      onClick: function () {
        toast.hideToast();
      }
    }).showToast();
  }
}

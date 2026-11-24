(() => {
  const app = document.querySelector("[data-app]")
  if (!app) return

  const storageKey = app.dataset.storageKey || "awesome-host-preview"
  const role = name => app.querySelector(`[data-role="${name}"]`)
  const roles = name => [...app.querySelectorAll(`[data-role="${name}"]`)]
  const editor = role("editor")
  const groupsElement = role("groups")
  const lineNumbers = role("line-numbers")
  const settingsPanel = role("settings-panel")
  const toast = role("toast")

  const defaultGroups = [
    {
      id: "production",
      name: "AyaNeo Production",
      enabled: true,
      content: [
        "81.71.151.14 ayaneo.com.cn",
        "81.71.151.14 store.ayaneo.com.cn",
        "81.71.151.14 account.ayaneo.com.cn"
      ].join("\n")
    },
    {
      id: "internal",
      name: "Internal APIs",
      enabled: true,
      content: [
        "10.20.0.12 api.internal",
        "10.20.0.18 auth.internal",
        "10.20.0.22 metrics.internal"
      ].join("\n")
    },
    {
      id: "workspace",
      name: "Local workspace",
      enabled: true,
      content: [
        "127.0.0.1 app.local",
        "127.0.0.1 design.local",
        "127.0.0.1 docs.local"
      ].join("\n")
    },
    {
      id: "relay",
      name: "SOCKS relay",
      enabled: false,
      content: [
        "# Route unresolved traffic through the local proxy",
        "SOCKS5 127.0.0.1:1080"
      ].join("\n")
    }
  ]

  const makeDefaultState = () => ({
    groups: JSON.parse(JSON.stringify(defaultGroups)),
    selectedId: "production"
  })

  let state = loadState()
  let dirty = false
  let toastTimer = 0

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey))
      if (saved && Array.isArray(saved.groups)) {
        return {
          groups: saved.groups.filter(
            group => group && typeof group.id === "string" && typeof group.name === "string"
          ),
          selectedId: saved.selectedId || "production"
        }
      }
    } catch {
      localStorage.removeItem(storageKey)
    }
    return makeDefaultState()
  }

  function persist() {
    localStorage.setItem(storageKey, JSON.stringify(state))
  }

  function groupById(id) {
    return state.groups.find(group => group.id === id)
  }

  function selectedGroup() {
    return state.selectedId === "all" ? null : groupById(state.selectedId)
  }

  function ruleCount(content) {
    return content
      .split("\n")
      .filter(line => {
        const value = line.trim()
        return value && !value.startsWith("#")
      }).length
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[character]
    })
  }

  function allHostsContent() {
    return state.groups
      .map(group => {
        const header = group.enabled ? `# ${group.name}` : `# ${group.name} (paused)`
        return `${header}\n${group.content}`
      })
      .join("\n\n")
  }

  function currentContent() {
    const group = selectedGroup()
    return group ? group.content : allHostsContent()
  }

  function renderOverview() {
    if (!state.groups.length) {
      state.selectedId = "all"
    } else if (state.selectedId !== "all" && !selectedGroup()) {
      state.selectedId = state.groups[0].id
    }

    if (!groupsElement) return

    groupsElement.innerHTML = state.groups
      .map((group, index) => {
        const isSelected = state.selectedId === group.id
        const meta = `${ruleCount(group.content)} ${ruleCount(group.content) === 1 ? "rule" : "rules"}`
        return `
          <div class="group-item${group.enabled ? " is-enabled" : " is-disabled"}${isSelected ? " is-selected" : ""}" data-group-id="${escapeHtml(group.id)}" style="--i:${index}">
            <div class="group-select" data-action="select-group" role="button" tabindex="0">
              <span class="group-index">${String(index + 1).padStart(2, "0")}</span>
              <span class="group-copy">
                <span class="group-name">${escapeHtml(group.name)}</span>
                <span class="group-meta">${meta}</span>
              </span>
            </div>
            <button class="group-toggle${group.enabled ? " is-on" : ""}" data-action="toggle-group" type="button" aria-label="${group.enabled ? "Pause" : "Enable"} ${escapeHtml(group.name)}" aria-pressed="${group.enabled}">
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </button>
          </div>
        `
      })
      .join("")

    const activeGroups = state.groups.filter(group => group.enabled).length
    const totalRoutes = state.groups
      .filter(group => group.enabled)
      .reduce((total, group) => total + ruleCount(group.content), 0)
    const allToggle = app.querySelector('[data-action="toggle-all"]')
    const allSelect = app.querySelector('[data-action="select-all"]')
    const deleteButton = app.querySelector('[data-action="delete-group"]')
    const saveButton = app.querySelector('[data-action="save"]')

    roles("active-count").forEach(element => {
      element.textContent = String(activeGroups)
    })
    roles("group-total").forEach(element => {
      element.textContent = String(state.groups.length)
    })
    roles("route-total").forEach(element => {
      element.textContent = String(totalRoutes)
    })
    roles("status-label").forEach(element => {
      element.textContent = activeGroups
        ? element.dataset.activeLabel || "ACTIVE"
        : element.dataset.pausedLabel || "PAUSED"
    })

    app.style.setProperty(
      "--active-ratio",
      String(state.groups.length ? activeGroups / state.groups.length : 0)
    )
    app.classList.toggle("has-active-routes", activeGroups > 0)
    app.classList.toggle("is-all-view", state.selectedId === "all")

    if (allToggle) {
      const allEnabled = state.groups.length > 0 && activeGroups === state.groups.length
      allToggle.classList.toggle("is-on", allEnabled)
      allToggle.classList.toggle("is-mixed", activeGroups > 0 && !allEnabled)
      allToggle.setAttribute("aria-pressed", String(allEnabled))
      allToggle.setAttribute(
        "aria-label",
        allEnabled ? "Pause all groups" : "Enable all groups"
      )
    }

    if (allSelect) {
      allSelect.classList.toggle("is-selected", state.selectedId === "all")
    }

    if (deleteButton) deleteButton.disabled = state.selectedId === "all"
    if (saveButton) saveButton.disabled = state.selectedId === "all"
    updateHeader()
  }

  function updateHeader() {
    const group = selectedGroup()
    const isAll = state.selectedId === "all" || !group
    const activeGroups = state.groups.filter(item => item.enabled).length
    const totalRoutes = state.groups
      .filter(item => item.enabled)
      .reduce((total, item) => total + ruleCount(item.content), 0)

    roles("main-title").forEach(element => {
      element.textContent = isAll ? "All hosts" : group.name
    })
    roles("selected-kicker").forEach(element => {
      element.textContent = isAll
        ? element.dataset.allLabel || "OVERVIEW"
        : element.dataset.groupLabel || "CURRENT GROUP"
    })
    roles("subtitle").forEach(element => {
      element.textContent = isAll
        ? `${activeGroups} active groups · ${totalRoutes} active routes`
        : `${group.enabled ? "Enabled" : "Paused"} · ${ruleCount(group.content)} ${
            ruleCount(group.content) === 1 ? "rule" : "rules"
          }`
    })
    app.classList.toggle("is-current-disabled", Boolean(group && !group.enabled))
  }

  function loadEditor() {
    const group = selectedGroup()
    if (!group) state.selectedId = "all"

    editor.value = currentContent()
    editor.readOnly = state.selectedId === "all"
    editor.placeholder = state.selectedId === "all"
      ? "Toggle a group and select it to edit its rules."
      : "127.0.0.1 localhost"
    app.classList.toggle("is-all-view", state.selectedId === "all")
    updateHeader()
    dirty = false
    syncLineNumbers()
    syncEditorMeta()
    setDirty(false)
    editor.scrollTop = 0
  }

  function syncLineNumbers() {
    if (!lineNumbers) return
    const lines = Math.max(1, editor.value.split("\n").length)
    lineNumbers.textContent = Array.from({ length: lines }, (_, index) => index + 1).join("\n")
    lineNumbers.scrollTop = editor.scrollTop
  }

  function syncEditorMeta() {
    const count = ruleCount(editor.value)
    roles("rule-count").forEach(element => {
      element.textContent = `${count} ${count === 1 ? "rule" : "rules"}`
    })
  }

  function setDirty(value) {
    dirty = value
    app.classList.toggle("is-dirty", dirty)
    roles("save-state").forEach(element => {
      if (state.selectedId === "all") {
        element.textContent = element.dataset.readOnlyLabel || "READ ONLY"
      } else {
        element.textContent = dirty
          ? element.dataset.dirtyLabel || "UNSAVED"
          : element.dataset.savedLabel || "SAVED"
      }
    })
  }

  function commitDraft() {
    const group = selectedGroup()
    if (!group || !dirty) return
    group.content = editor.value
    persist()
    dirty = false
  }

  function selectGroup(id) {
    commitDraft()
    state.selectedId = id
    persist()
    renderOverview()
    loadEditor()
  }

  function selectAll() {
    commitDraft()
    state.selectedId = "all"
    persist()
    renderOverview()
    loadEditor()
  }

  function toggleGroup(id) {
    const group = groupById(id)
    if (!group) return
    group.enabled = !group.enabled
    persist()
    renderOverview()
    if (state.selectedId === "all") loadEditor()
    setDirty(dirty)
  }

  function toggleAll() {
    const allEnabled =
      state.groups.length > 0 && state.groups.every(group => group.enabled)
    state.groups.forEach(group => {
      group.enabled = !allEnabled
    })
    persist()
    renderOverview()
    if (state.selectedId === "all") loadEditor()
    showToast(allEnabled ? "All groups paused" : "All groups enabled")
  }

  function addGroup() {
    commitDraft()
    const id = `group-${Date.now().toString(36)}`
    state.groups.push({
      id,
      name: "New group",
      enabled: true,
      content: "127.0.0.1 new.local"
    })
    state.selectedId = id
    persist()
    renderOverview()
    loadEditor()
    requestAnimationFrame(() => {
      const name = groupsElement.querySelector(
        `[data-group-id="${id}"] .group-name`
      )
      if (name) startRename(name, id)
    })
    showToast("New group created")
  }

  function deleteGroup() {
    const group = selectedGroup()
    if (!group) {
      showToast("Select a group to delete")
      return
    }

    const index = state.groups.findIndex(item => item.id === group.id)
    state.groups.splice(index, 1)
    const next = state.groups[Math.min(index, state.groups.length - 1)]
    state.selectedId = next ? next.id : "all"
    dirty = false
    persist()
    renderOverview()
    loadEditor()
    showToast("Group deleted")
  }

  function saveDraft() {
    const group = selectedGroup()
    if (!group) {
      showToast("Open a group to edit its rules")
      return
    }

    group.content = editor.value
    dirty = false
    persist()
    renderOverview()
    syncLineNumbers()
    syncEditorMeta()
    setDirty(false)
    showToast("Hosts applied")
  }

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(editor.value)
    } catch {
      const temporary = document.createElement("textarea")
      temporary.value = editor.value
      temporary.style.position = "fixed"
      temporary.style.opacity = "0"
      document.body.appendChild(temporary)
      temporary.select()
      document.execCommand("copy")
      temporary.remove()
    }
    showToast("Rules copied")
  }

  function setSettings(open) {
    if (!settingsPanel) return
    settingsPanel.hidden = !open
    const trigger = app.querySelector('[data-action="toggle-settings"]')
    if (trigger) trigger.setAttribute("aria-expanded", String(open))
  }

  function toggleSettings() {
    if (!settingsPanel) return
    setSettings(settingsPanel.hidden)
  }

  function resetDemo() {
    state = makeDefaultState()
    dirty = false
    persist()
    renderOverview()
    loadEditor()
    setSettings(false)
    showToast("Demo data reset")
  }

  function startRename(element, id) {
    if (element.isContentEditable) return
    const group = groupById(id)
    if (!group) return

    const original = group.name
    element.contentEditable = "true"
    element.classList.add("is-editing")
    element.focus()

    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(element)
    selection.removeAllRanges()
    selection.addRange(range)

    element.addEventListener(
      "keydown",
      event => {
        if (event.key === "Enter") {
          event.preventDefault()
          element.blur()
        }
        if (event.key === "Escape") {
          event.preventDefault()
          element.textContent = original
          element.blur()
        }
        event.stopPropagation()
      },
      { once: false }
    )

    element.addEventListener(
      "blur",
      () => {
        const name = element.textContent.trim() || original
        group.name = name
        element.contentEditable = "false"
        element.classList.remove("is-editing")
        persist()
        renderOverview()
        showToast("Group renamed")
      },
      { once: true }
    )
  }

  function showToast(message) {
    if (!toast) return
    toast.textContent = message
    toast.classList.add("is-visible")
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible")
    }, 2200)
  }

  app.addEventListener("click", event => {
    const actionElement = event.target.closest("[data-action]")
    if (!actionElement || !app.contains(actionElement)) return

    if (event.target.closest('.group-name[contenteditable="true"]')) return

    const action = actionElement.dataset.action
    const groupElement = actionElement.closest(".group-item")

    if (action === "select-all") selectAll()
    if (action === "toggle-all") toggleAll()
    if (action === "add-group") addGroup()
    if (action === "select-group" && groupElement) selectGroup(groupElement.dataset.groupId)
    if (action === "toggle-group" && groupElement) toggleGroup(groupElement.dataset.groupId)
    if (action === "delete-group") deleteGroup()
    if (action === "save") saveDraft()
    if (action === "copy") copyContent()
    if (action === "toggle-settings") toggleSettings()
    if (action === "close-settings") setSettings(false)
    if (action === "reset-demo") resetDemo()
  })

  app.addEventListener("dblclick", event => {
    const name = event.target.closest(".group-name")
    if (!name) return
    const groupElement = name.closest(".group-item")
    if (!groupElement) return
    event.preventDefault()
    event.stopPropagation()
    startRename(name, groupElement.dataset.groupId)
  })

  app.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault()
      saveDraft()
      return
    }

    if (event.key === "Escape" && settingsPanel && !settingsPanel.hidden) {
      setSettings(false)
      return
    }

    const groupSelect = event.target.closest(".group-select")
    if (groupSelect && !event.target.isContentEditable) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        const groupElement = groupSelect.closest(".group-item")
        if (groupElement) selectGroup(groupElement.dataset.groupId)
      }
    }

    const selectAllTarget = event.target.closest('[data-action="select-all"]')
    if (selectAllTarget && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault()
      selectAll()
    }
  })

  editor.addEventListener("input", () => {
    if (state.selectedId === "all") return
    setDirty(true)
    syncLineNumbers()
    syncEditorMeta()
  })

  editor.addEventListener("scroll", () => {
    if (lineNumbers) lineNumbers.scrollTop = editor.scrollTop
  })

  document.addEventListener("click", event => {
    if (!settingsPanel || settingsPanel.hidden) return
    if (event.target.closest('[data-role="settings-panel"]')) return
    if (event.target.closest('[data-action="toggle-settings"]')) return
    setSettings(false)
  })

  const savedSelection = state.selectedId
  if (savedSelection === "all" || groupById(savedSelection)) {
    state.selectedId = savedSelection
  } else {
    state.selectedId = state.groups[0]?.id || "all"
  }
  persist()
  renderOverview()
  loadEditor()
})()

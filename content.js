(() => {
  const HELLO = "WA_EXPORT_HELLO";
  const STATUS = "WA_EXPORT_STATUS";
  const CATALOG = "WA_EXPORT_CATALOG";
  const CATALOG_RES = "WA_EXPORT_CATALOG_RES";
  const RUN = "WA_EXPORT_RUN";
  const QUICK = "WA_EXPORT_QUICK";
  const PROGRESS = "WA_EXPORT_PROGRESS";
  const RUN_RES = "WA_EXPORT_RES";

  if (window.top !== window) return;
  if (document.getElementById("wa-contacts-export-host")) return;

  function detectLang() {
    try {
      const raw = (
        (chrome?.i18n?.getUILanguage && chrome.i18n.getUILanguage()) ||
        navigator.language ||
        "en"
      ).toLowerCase();
      if (raw.startsWith("fr")) return "fr";
      if (raw.startsWith("de")) return "de";
      return "en";
    } catch {
      return "en";
    }
  }

  function t(key, subs) {
    try {
      const msg = chrome.i18n.getMessage(key, subs);
      return msg || key;
    } catch {
      return key;
    }
  }

  const TABS = [
    { id: "contacts", labelKey: "tabContacts" },
    { id: "chats", labelKey: "tabMessages" },
    { id: "groups", labelKey: "tabGroups" },
    { id: "labels", labelKey: "tabLabels" },
  ];

  const EXPORT_TYPES = [
    {
      id: "contacts",
      titleKey: "typeContactsTitle",
      descKey: "typeContactsDesc",
      formats: ["csv", "vcf", "json"],
    },
    {
      id: "chats",
      titleKey: "typeChatsTitle",
      descKey: "typeChatsDesc",
      formats: ["csv", "json"],
    },
    {
      id: "groups",
      titleKey: "typeGroupsTitle",
      descKey: "typeGroupsDesc",
      formats: ["csv", "json"],
    },
    {
      id: "group-members",
      titleKey: "typeMembersTitle",
      descKey: "typeMembersDesc",
      formats: ["csv", "vcf", "json"],
    },
    {
      id: "labels",
      titleKey: "typeLabelsTitle",
      descKey: "typeLabelsDesc",
      formats: ["csv", "vcf", "json"],
    },
  ];

  const host = document.createElement("div");
  host.id = "wa-contacts-export-host";
  Object.assign(host.style, {
    position: "fixed",
    right: "20px",
    bottom: "72px",
    zIndex: "2147483647",
    pointerEvents: "none",
  });
  (document.body || document.documentElement).appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host {
        position: fixed !important;
        right: 20px !important;
        bottom: 72px !important;
        z-index: 2147483647 !important;
        pointer-events: none;
      }
      *, *::before, *::after { box-sizing: border-box; }
      .ui {
        pointer-events: auto;
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        color: #e9edef;
        font-size: 13px;
        line-height: 1.4;
        -webkit-font-smoothing: antialiased;
      }
      button, input, select { font: inherit; }
      .fab {
        width: 52px; height: 52px; border: 0; border-radius: 16px;
        background: linear-gradient(145deg, #06cf9c, #00a884);
        color: #022c22; cursor: pointer;
        box-shadow: 0 10px 30px rgba(0,168,132,.35);
        display: grid; place-items: center;
        transition: transform .15s ease, box-shadow .15s ease;
      }
      .fab:hover { transform: translateY(-1px); box-shadow: 0 14px 34px rgba(0,168,132,.42); }
      .panel {
        display: none; width: 392px; max-height: min(680px, calc(100vh - 40px));
        background: #111b21;
        border: 1px solid #233138;
        border-radius: 20px;
        box-shadow: 0 24px 60px rgba(0,0,0,.55);
        overflow: hidden;
      }
      .open .fab { display: none; }
      .open .panel { display: flex; flex-direction: column; animation: slideUp .2s ease; }
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .head {
        padding: 16px 16px 12px;
        background: linear-gradient(180deg, #0b141a 0%, #111b21 100%);
        border-bottom: 1px solid #233138;
      }
      .head-top { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
      .logo {
        width: 36px; height: 36px; border-radius: 12px;
        background: linear-gradient(145deg, #06cf9c, #00a884);
        color: #022c22; display: grid; place-items: center; flex-shrink: 0;
      }
      .head h1 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -.02em; }
      .head .sub { margin: 2px 0 0; color: #8696a0; font-size: 11px; }
      .grow { flex: 1; }
      .icon-btn {
        width: 32px; height: 32px; border: 0; border-radius: 10px;
        background: #1f2c34; color: #aebac1; cursor: pointer;
        display: grid; place-items: center;
        transition: background .15s, color .15s;
      }
      .icon-btn:hover { background: #2a3942; color: #e9edef; }
      .pill {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600;
        background: #1f2c34; color: #8696a0;
      }
      .pill.ok { background: rgba(0,168,132,.15); color: #25d366; }
      .pill.err { background: rgba(241,92,109,.12); color: #f15c6d; }
      .pill.busy { background: rgba(0,168,132,.12); color: #00a884; }
      .pill-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
      .pill.ok .pill-dot { box-shadow: 0 0 0 3px rgba(37,211,102,.2); }
      .progress { height: 3px; background: #1f2c34; border-radius: 99px; overflow: hidden; margin-top: 10px; display: none; }
      .progress.on { display: block; }
      .progress span { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #00a884, #25d366); transition: width .2s ease; }
      .modes {
        display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
        padding: 12px 14px 0;
      }
      .mode-btn {
        border: 1px solid #233138; border-radius: 12px; padding: 10px;
        background: #0b141a; color: #8696a0; cursor: pointer; font-weight: 650; font-size: 12px;
        transition: border-color .15s, background .15s, color .15s;
      }
      .mode-btn.active {
        border-color: rgba(0,168,132,.45); background: rgba(0,168,132,.08); color: #25d366;
      }
      .body { flex: 1; overflow: auto; padding: 12px 14px 14px; min-height: 0; }
      .section-title {
        margin: 0 0 10px; font-size: 11px; font-weight: 700;
        letter-spacing: .06em; text-transform: uppercase; color: #667781;
      }
      .cards { display: grid; gap: 8px; }
      .card {
        display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center;
        padding: 12px 14px; border: 1px solid #233138; border-radius: 14px;
        background: #0b141a; cursor: pointer; text-align: left;
        transition: border-color .15s, background .15s, transform .15s;
      }
      .card:hover { border-color: #2a3942; background: #111b21; }
      .card.selected { border-color: rgba(0,168,132,.55); background: rgba(0,168,132,.07); }
      .card-icon {
        width: 38px; height: 38px; border-radius: 12px;
        background: #1f2c34; color: #25d366;
        display: grid; place-items: center;
      }
      .card.selected .card-icon { background: rgba(0,168,132,.18); }
      .card h3 { margin: 0; font-size: 13px; font-weight: 700; color: #e9edef; }
      .card p { margin: 3px 0 0; font-size: 11px; color: #8696a0; }
      .card-check {
        width: 18px; height: 18px; border-radius: 50%;
        border: 2px solid #3b4a54; display: grid; place-items: center;
      }
      .card.selected .card-check { border-color: #00a884; background: #00a884; color: #022c22; }
      .formats {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px;
      }
      .fmt-btn {
        border: 0; border-radius: 12px; padding: 12px 8px; cursor: pointer;
        background: #1f2c34; color: #e9edef; font-weight: 700; font-size: 12px;
        transition: background .15s, transform .15s;
      }
      .fmt-btn.primary { background: linear-gradient(145deg, #06cf9c, #00a884); color: #022c22; }
      .fmt-btn:hover:not(:disabled) { transform: translateY(-1px); }
      .fmt-btn:disabled { opacity: .4; cursor: default; transform: none; }
      .hint {
        margin-top: 12px; padding: 10px 12px; border-radius: 12px;
        background: #1f2c34; color: #8696a0; font-size: 11px;
      }
      .advanced { display: none; }
      .advanced.open { display: block; }
      .quick-view { display: block; }
      .quick-view.hidden { display: none; }
      .tabs {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 10px;
      }
      .tab {
        border: 0; border-radius: 10px; padding: 8px 4px;
        background: #1f2c34; color: #8696a0; cursor: pointer; font-weight: 650; font-size: 11px;
        transition: background .15s, color .15s;
      }
      .tab.active { background: rgba(0,168,132,.18); color: #25d366; }
      .search-wrap { position: relative; margin-bottom: 8px; }
      .search-wrap svg {
        position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
        color: #667781; pointer-events: none;
      }
      input[type="search"] {
        width: 100%; border: 1px solid #233138; border-radius: 12px;
        background: #0b141a; color: #e9edef; padding: 10px 10px 10px 34px;
        outline: none; font-size: 12px;
      }
      input[type="search"]:focus { border-color: rgba(0,168,132,.5); box-shadow: 0 0 0 3px rgba(0,168,132,.1); }
      .toolbar {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 8px; color: #8696a0; font-size: 11px;
      }
      .toolbar-actions { display: flex; gap: 10px; }
      .link {
        border: 0; background: transparent; color: #25d366; cursor: pointer;
        font-size: 11px; font-weight: 650; padding: 0;
      }
      .list {
        border: 1px solid #233138; border-radius: 14px; overflow: auto;
        max-height: 240px; background: #0b141a;
      }
      .row {
        display: grid; grid-template-columns: 18px 32px 1fr auto; gap: 10px; align-items: center;
        padding: 9px 12px; cursor: pointer; border-bottom: 1px solid #1a252d;
      }
      .row:last-child { border-bottom: 0; }
      .row:hover { background: #111b21; }
      .row input { accent-color: #00a884; width: 15px; height: 15px; cursor: pointer; }
      .avatar {
        width: 32px; height: 32px; border-radius: 50%;
        background: #2a3942; color: #aebac1; font-size: 12px; font-weight: 700;
        display: grid; place-items: center; text-transform: uppercase;
      }
      .row .name {
        min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        font-weight: 600; font-size: 12px;
      }
      .row .meta { color: #667781; font-size: 10px; white-space: nowrap; }
      .empty {
        padding: 28px 16px; color: #667781; text-align: center; font-size: 12px;
      }
      .opts {
        display: grid; gap: 8px; margin-top: 12px;
        padding: 12px; border-radius: 14px; background: #0b141a; border: 1px solid #233138;
      }
      .opt {
        display: flex; align-items: center; gap: 8px; color: #aebac1; font-size: 11px; cursor: pointer;
      }
      .opt input { accent-color: #00a884; }
      .adv-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 10px; }
      .adv-actions button {
        border: 0; border-radius: 11px; padding: 10px 6px; cursor: pointer;
        background: #1f2c34; color: #e9edef; font-weight: 650; font-size: 11px;
      }
      .adv-actions button.primary { background: linear-gradient(145deg, #06cf9c, #00a884); color: #022c22; }
      .adv-actions button:disabled { opacity: .4; cursor: default; }
      .export-all {
        width: 100%; margin-top: 8px; border: 1px dashed #2a3942; border-radius: 12px;
        padding: 10px; background: transparent; color: #25d366; font-weight: 650;
        font-size: 12px; cursor: pointer;
      }
      .export-all:disabled { opacity: .4; cursor: default; }
      .foot {
        padding: 10px 14px 14px; border-top: 1px solid #233138;
        background: #0b141a; min-height: 36px;
      }
      .status { font-size: 11px; color: #667781; }
      .status.ok { color: #25d366; }
      .status.err { color: #f15c6d; }
    </style>
    <div class="ui wrap">
      <button class="fab" type="button" title="${t("exportFabTitle")}" aria-label="${t("exportFabAria")}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <section class="panel" aria-label="${t("exportFabTitle")}">
        <div class="head">
          <div class="head-top">
            <div class="logo" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div>
              <h1>${t("headTitle")}</h1>
              <p class="sub">${t("headSubtitle")}</p>
            </div>
            <span class="grow"></span>
            <button class="icon-btn" type="button" data-act="refresh" title="${t("btnRefresh")}" aria-label="${t("btnRefresh")}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M21 3v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="icon-btn" type="button" data-act="close" title="${t("btnClose")}" aria-label="${t("btnClose")}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>
          <div class="pill" data-ready-pill><span class="pill-dot"></span><span data-ready-text>${t("pillConnecting")}</span></div>
          <div class="progress" data-progress><span></span></div>
        </div>
        <div class="modes">
          <button class="mode-btn active" type="button" data-mode="quick">${t("modeQuick")}</button>
          <button class="mode-btn" type="button" data-mode="advanced">${t("modeAdvanced")}</button>
        </div>
        <div class="body">
          <div class="quick-view">
            <p class="section-title">${t("quickSectionTitle")}</p>
            <div class="cards" data-cards></div>
            <div class="formats">
              <button class="fmt-btn primary" type="button" data-quick-fmt="csv" disabled>${t("fmtCsv")}</button>
              <button class="fmt-btn" type="button" data-quick-fmt="vcf" disabled>${t("fmtVcf")}</button>
              <button class="fmt-btn" type="button" data-quick-fmt="json" disabled>${t("fmtJson")}</button>
            </div>
            <div class="hint" data-hint>${t("quickHintDefault")}</div>
          </div>
          <div class="advanced">
            <nav class="tabs"></nav>
            <div class="search-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              <input type="search" placeholder="${t("searchPlaceholder")}" autocomplete="off">
            </div>
            <div class="toolbar">
              <span class="count">${t("toolbarSelectedCount", ["0", "0"])}</span>
              <div class="toolbar-actions">
                <button class="link" type="button" data-act="all">${t("toolbarAll")}</button>
                <button class="link" type="button" data-act="none">${t("toolbarNone")}</button>
              </div>
            </div>
            <div class="list"><div class="empty">${t("listEmptyNoTab")}</div></div>
            <div class="opts">
              <label class="opt" data-opt="dedupe"><input type="checkbox" data-dedupe checked> ${t("optDedupe")}</label>
              <label class="opt" data-opt="simple"><input type="checkbox" data-simple checked> ${t("optSimple")}</label>
              <label class="opt" data-opt="split"><input type="checkbox" data-split-conv checked> ${t("optSplit")}</label>
            </div>
            <button class="export-all" type="button" data-act="export-tab-all" disabled>${t("exportAllBtn")}</button>
            <div class="adv-actions">
              <button type="button" data-fmt="csv" class="primary" disabled>${t("fmtCsv")}</button>
              <button type="button" data-fmt="vcf" disabled>${t("fmtVcf")}</button>
              <button type="button" data-fmt="json" disabled>${t("fmtJson")}</button>
            </div>
          </div>
        </div>
        <div class="foot"><div class="status" data-status></div></div>
      </section>
    </div>
  `;

  const wrap = shadow.querySelector(".wrap");
  const quickView = shadow.querySelector(".quick-view");
  const advancedEl = shadow.querySelector(".advanced");
  const modeBtns = [...shadow.querySelectorAll(".mode-btn")];
  const cardsEl = shadow.querySelector("[data-cards]");
  const hintEl = shadow.querySelector("[data-hint]");
  const tabsEl = shadow.querySelector(".tabs");
  const listEl = shadow.querySelector(".list");
  const searchEl = shadow.querySelector("input[type='search']");
  const countEl = shadow.querySelector(".count");
  const statusEl = shadow.querySelector("[data-status]");
  const readyPill = shadow.querySelector("[data-ready-pill]");
  const readyText = shadow.querySelector("[data-ready-text]");
  const barEl = shadow.querySelector("[data-progress]");
  const barFill = shadow.querySelector("[data-progress] span");
  const quickBtns = [...shadow.querySelectorAll("[data-quick-fmt]")];
  const exportTabAllBtn = shadow.querySelector("[data-act='export-tab-all']");
  const exportBtns = [...shadow.querySelectorAll(".adv-actions button")];
  const dedupeEl = shadow.querySelector("[data-dedupe]");
  const simpleEl = shadow.querySelector("[data-simple]");
  const splitConvEl = shadow.querySelector("[data-split-conv]");
  const optDedupe = shadow.querySelector('[data-opt="dedupe"]');
  const optSimple = shadow.querySelector('[data-opt="simple"]');
  const optSplit = shadow.querySelector('[data-opt="split"]');

  const state = {
    ready: false,
    lang: detectLang(),
    mode: "quick",
    quickType: "contacts",
    tab: "contacts",
    query: "",
    catalogs: {},
    selected: { contacts: new Set(), chats: new Set(), groups: new Set(), labels: new Set() },
    pending: new Map(),
    busy: false,
    listBuilt: false,
  };

  const QUICK_LABEL_KEYS = {
    contacts: "quickLabelContacts",
    chats: "quickLabelChats",
    groups: "quickLabelGroups",
    "group-members": "quickLabelGroupMembers",
    labels: "quickLabelLabels",
  };

  function exportingLabel(quickTypeOrTab) {
    const key = QUICK_LABEL_KEYS[quickTypeOrTab];
    return t("exportingLabel", [key ? t(key) : quickTypeOrTab]);
  }

  function renderCards() {
    cardsEl.innerHTML = EXPORT_TYPES.map((type) => {
      const selected = state.quickType === type.id;
      return `<button type="button" class="card${selected ? " selected" : ""}" data-type="${type.id}">
        <div class="card-icon">${iconFor(type.id)}</div>
        <div>
          <h3>${t(type.titleKey)}</h3>
          <p>${t(type.descKey)}</p>
        </div>
        <div class="card-check">${selected ? "✓" : ""}</div>
      </button>`;
    }).join("");
  }

  function iconFor(id) {
    const icons = {
      contacts: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      chats: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
      groups: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="3" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="10" r="2.5" stroke="currentColor" stroke-width="2"/><path d="M3 20c0-3 2.7-5.5 6-5.5M14 20c0-2.5 2-4.5 4.5-4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      "group-members": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8 6h8M8 10h8M8 14h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="2"/></svg>',
      labels: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 12V6a2 2 0 0 1 2-2h6l8 8-8 8H6a2 2 0 0 1-2-2v-6z" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/></svg>',
    };
    return icons[id] || icons.contacts;
  }

  for (const tab of TABS) {
    const button = document.createElement("button");
    button.className = "tab" + (tab.id === state.tab ? " active" : "");
    button.type = "button";
    button.dataset.tab = tab.id;
    button.textContent = t(tab.labelKey);
    tabsEl.appendChild(button);
  }
  renderCards();

  function setStatus(text, kind) {
    statusEl.textContent = text || "";
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function setReadyPill(ready, busy, error) {
    readyPill.className = "pill" + (busy ? " busy" : ready ? " ok" : error ? " err" : "");
    if (busy) readyText.textContent = t("pillExporting");
    else if (ready) readyText.textContent = t("pillConnected");
    else if (error) readyText.textContent = t("pillDisconnected");
    else readyText.textContent = t("pillWaiting");
  }

  function resolveTab(tab) {
    if (tab === "group-members") return { tab: "groups", groupMode: "members" };
    return { tab, groupMode: tab === "groups" ? "messages" : undefined };
  }

  function isMessageTab(tab) {
    return tab === "chats" || tab === "groups";
  }

  function isMessageExport(tab, groupMode) {
    if (tab === "chats") return true;
    if (tab === "groups") return groupMode !== "members";
    return false;
  }

  function currentQuickFormats() {
    return EXPORT_TYPES.find((t) => t.id === state.quickType)?.formats || ["csv", "json"];
  }

  function updateOptionsVisibility() {
    const msgTab = state.mode === "quick" ? isMessageExport(resolveTab(state.quickType).tab, resolveTab(state.quickType).groupMode) : isMessageTab(state.tab);
    const contactTab = state.mode === "quick" ? !msgTab : !isMessageTab(state.tab);
    optSplit.style.display = msgTab ? "flex" : "none";
    optSimple.style.display = contactTab ? "flex" : "none";
    optDedupe.style.display = contactTab || state.tab === "groups" ? "flex" : "none";
  }

  function updateButtons() {
    const hasSel = selectedIds().length > 0;
    const formats = currentQuickFormats();
    for (const button of quickBtns) {
      const fmt = button.dataset.quickFmt;
      const allowed = formats.includes(fmt);
      button.style.display = allowed ? "" : "none";
      button.disabled = state.busy || !state.ready || !allowed;
      button.classList.toggle("primary", fmt === "csv");
    }
    for (const button of exportBtns) {
      const vcf = button.dataset.fmt === "vcf";
      const blocked = vcf && isMessageTab(state.tab);
      button.disabled = state.busy || !state.ready || !hasSel || blocked;
    }
    if (exportTabAllBtn) exportTabAllBtn.disabled = state.busy || !state.ready;
    const type = EXPORT_TYPES.find((t) => t.id === state.quickType);
    hintEl.textContent = type ? `${t(type.titleKey)} · ${t(type.descKey)}` : "";
    updateOptionsVisibility();
  }

  function setBusy(busy) {
    state.busy = busy;
    setReadyPill(state.ready, busy, !state.ready && statusEl.classList.contains("err"));
    updateButtons();
  }

  function selectedIds() {
    return [...state.selected[state.tab]];
  }

  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts[0][0] + (parts[1]?.[0] || "")).slice(0, 2);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  function visibleItems() {
    const items = state.catalogs[state.tab] || [];
    const query = state.query.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => `${item.name} ${item.meta || ""}`.toLowerCase().includes(query));
  }

  function selectedCountText() {
    const selected = state.selected[state.tab];
    const total = (state.catalogs[state.tab] || []).length;
    return t("toolbarSelectedCount", [String(selected.size), String(total)]);
  }

  function buildList() {
    const items = visibleItems();
    countEl.textContent = selectedCountText();

    if (!state.catalogs[state.tab]) {
      listEl.innerHTML = `<div class="empty">${state.ready ? t("listEmptyLoading") : t("listEmptyConnectFirst")}</div>`;
      state.listBuilt = false;
      updateButtons();
      return;
    }
    if (!items.length) {
      listEl.innerHTML = `<div class="empty">${t("listEmptyNoResults", [escapeHtml(state.query)])}</div>`;
      state.listBuilt = false;
      updateButtons();
      return;
    }

    const selected = state.selected[state.tab];
    listEl.innerHTML = items
      .map((item) => {
        const checked = selected.has(item.id) ? "checked" : "";
        return `<label class="row" data-id="${escapeAttr(item.id)}">
          <input type="checkbox" ${checked}>
          <span class="avatar">${escapeHtml(initials(item.name))}</span>
          <span class="name">${escapeHtml(item.name)}</span>
          <span class="meta">${escapeHtml(item.meta || "")}</span>
        </label>`;
      })
      .join("");
    state.listBuilt = true;
    updateButtons();
  }

  function syncRowCheckboxes() {
    if (!state.listBuilt) {
      buildList();
      return;
    }
    const selected = state.selected[state.tab];
    for (const row of listEl.querySelectorAll(".row")) {
      const input = row.querySelector("input");
      if (input) input.checked = selected.has(row.dataset.id);
    }
    countEl.textContent = selectedCountText();
    updateButtons();
  }

  function request(type, extra = {}, timeoutMs = 120000) {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      state.pending.set(id, { resolve, reject });
      window.postMessage({ type, id, lang: state.lang, ...extra }, "*");
      setTimeout(() => {
        if (state.pending.has(id)) {
          state.pending.delete(id);
          reject(new Error(t("statusTimeout")));
        }
      }, timeoutMs);
    });
  }

  async function loadCatalog(force = false) {
    if (!state.ready) return;
    if (!force && state.catalogs[state.tab]) {
      buildList();
      return;
    }
    listEl.innerHTML = `<div class="empty">${t("listEmptyLoading")}</div>`;
    state.listBuilt = false;
    try {
      const result = await request(CATALOG, { tab: state.tab }, 120000);
      state.catalogs[state.tab] = result.items || [];
      state.selected[state.tab] = new Set(state.catalogs[state.tab].map((item) => item.id));
      buildList();
      setStatus(t("statusItemsLoaded", [String(state.catalogs[state.tab].length)]), "ok");
    } catch (error) {
      listEl.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
      setStatus(error.message, "err");
    }
  }

  function setMode(mode) {
    state.mode = mode;
    for (const btn of modeBtns) btn.classList.toggle("active", btn.dataset.mode === mode);
    quickView.classList.toggle("hidden", mode !== "quick");
    advancedEl.classList.toggle("open", mode === "advanced");
    if (mode === "advanced") loadCatalog();
    updateButtons();
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function toCsv(rows, simple) {
    if (simple) {
      const lines = [t("csvHeaderSimple")];
      for (const row of rows) lines.push(`${csvEscape(row.name)},${csvEscape(row.phone)}`);
      return lines.join("\r\n") + "\r\n";
    }
    const lines = [t("csvHeaderFull")];
    for (const row of rows) {
      lines.push([row.name, row.phone, row.source, row.group, row.admin ? t("yesLabel") : ""].map(csvEscape).join(","));
    }
    return lines.join("\r\n") + "\r\n";
  }

  function vcfEscape(value) {
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,");
  }

  function toMessagesCsv(rows, singleChat = false) {
    const lines = [singleChat ? t("csvHeaderMsgSingle") : t("csvHeaderMsgMulti")];
    for (const row of rows) {
      const cols = singleChat ? [row.date, row.from, row.message] : [row.chat, row.date, row.from, row.message];
      lines.push(cols.map(csvEscape).join(","));
    }
    return lines.join("\r\n") + "\r\n";
  }

  function safeFilename(name) {
    return (
      String(name || "conversation")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s.-]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 60) || "conversation"
    );
  }

  function groupMessagesByChat(rows) {
    const map = new Map();
    for (const row of rows) {
      const key = row.chatId || row.chat;
      if (!map.has(key)) map.set(key, { title: row.chat, messages: [] });
      map.get(key).messages.push(row);
    }
    return map;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function downloadMessageExports(rows, fmt, splitByChat) {
    if (!splitByChat) {
      const base = `whatsapp-messages-${stamp()}`;
      if (fmt === "csv") download(`${base}.csv`, "text/csv;charset=utf-8", toMessagesCsv(rows));
      else download(`${base}.json`, "application/json;charset=utf-8", JSON.stringify(rows, null, 2));
      return 1;
    }
    const groups = groupMessagesByChat(rows);
    let n = 0;
    for (const [, group] of groups) {
      const fname = `whatsapp-${safeFilename(group.title)}-${stamp()}`;
      if (fmt === "csv") download(`${fname}.csv`, "text/csv;charset=utf-8", toMessagesCsv(group.messages, true));
      else download(`${fname}.json`, "application/json;charset=utf-8", JSON.stringify(group.messages, null, 2));
      n += 1;
      if (n < groups.size) await sleep(350);
    }
    return groups.size;
  }

  function toVcf(rows) {
    return (
      rows
        .map((row) =>
          ["BEGIN:VCARD", "VERSION:3.0", `FN:${vcfEscape(row.name)}`, `TEL;TYPE=CELL:${row.phone}`, "END:VCARD"].join("\r\n")
        )
        .join("\r\n") + "\r\n"
    );
  }

  function download(filename, mime, text) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function stamp() {
    return new Date().toISOString().slice(0, 10);
  }

  async function runExport({ tab, ids, all, fmt, label, groupMode }) {
    setBusy(true);
    barEl.classList.add("on");
    barFill.style.width = "5%";
    setStatus(label || t("pillExporting"));
    const messageExport = isMessageExport(tab, groupMode);
    try {
      const result = await request(
        all ? QUICK : RUN,
        { tab, ids, all, groupMode, dedupe: dedupeEl.checked, simple: simpleEl.checked },
        messageExport ? 600000 : 300000
      );
      barFill.style.width = "100%";

      if (result.kind === "messages") {
        const rows = result.messages || [];
        if (!rows.length) {
          setStatus(t("statusNoMessages", [String(result.scanned || 0), String(result.skipped || 0)]), "err");
          return;
        }
        const fileCount = await downloadMessageExports(rows, fmt, splitConvEl.checked);
        setStatus(t("statusMessagesExported", [String(rows.length), String(fileCount)]), "ok");
        return;
      }

      const rows = result.contacts || [];
      if (!rows.length) {
        setStatus(t("statusNoNumbers", [String(result.scanned || 0), String(result.skipped || 0)]), "err");
        return;
      }
      const base = `whatsapp-${tab}-${stamp()}`;
      const simple = simpleEl.checked;
      if (fmt === "csv") download(`${base}.csv`, "text/csv;charset=utf-8", toCsv(rows, simple));
      else if (fmt === "vcf") download(`${base}.vcf`, "text/vcard;charset=utf-8", toVcf(rows));
      else download(`${base}.json`, "application/json;charset=utf-8", JSON.stringify(rows, null, 2));
      const extra = result.skipped ? t("statusExtraNoNumber", [String(result.skipped)]) : "";
      setStatus(t("statusContactsExported", [String(rows.length), extra]), "ok");
    } catch (error) {
      setStatus(error.message, "err");
    } finally {
      setBusy(false);
      setTimeout(() => barEl.classList.remove("on"), 600);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data) return;

    if (data.type === STATUS) {
      state.ready = !!data.ready;
      setReadyPill(state.ready, state.busy, !!data.error);
      if (state.ready) {
        setStatus(t("statusReady"), "ok");
        if (state.mode === "advanced") loadCatalog();
      } else if (data.error) setStatus(data.error, "err");
      else setStatus(t("statusConnectFirst"));
      updateButtons();
      return;
    }

    if (data.type === PROGRESS) {
      barEl.classList.add("on");
      const pct = data.total ? Math.max(5, Math.round((data.current / data.total) * 100)) : 5;
      barFill.style.width = `${pct}%`;
      if (data.label) setStatus(`${data.current}/${data.total} — ${data.label}`);
      return;
    }

    const waiter = state.pending.get(data.id);
    if (!waiter) return;
    if (data.type !== CATALOG_RES && data.type !== RUN_RES) return;
    state.pending.delete(data.id);
    if (data.ok) waiter.resolve(data);
    else waiter.reject(new Error(data.error || t("statusExportFailed")));
  });

  shadow.querySelector(".fab").addEventListener("click", () => wrap.classList.add("open"));
  shadow.querySelector("[data-act='close']").addEventListener("click", () => wrap.classList.remove("open"));
  shadow.querySelector("[data-act='refresh']").addEventListener("click", () => {
    state.catalogs[state.tab] = null;
    if (state.mode === "advanced") loadCatalog(true);
  });

  for (const btn of modeBtns) {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  }

  cardsEl.addEventListener("click", (event) => {
    const card = event.target.closest("[data-type]");
    if (!card) return;
    state.quickType = card.dataset.type;
    renderCards();
    updateButtons();
  });

  shadow.querySelector("[data-act='all']").addEventListener("click", () => {
    for (const item of visibleItems()) state.selected[state.tab].add(item.id);
    syncRowCheckboxes();
  });
  shadow.querySelector("[data-act='none']").addEventListener("click", () => {
    state.selected[state.tab].clear();
    syncRowCheckboxes();
  });

  tabsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    state.tab = button.dataset.tab;
    for (const tab of tabsEl.querySelectorAll(".tab")) tab.classList.toggle("active", tab.dataset.tab === state.tab);
    searchEl.value = state.query = "";
    updateButtons();
    loadCatalog();
  });

  searchEl.addEventListener("input", () => {
    state.query = searchEl.value;
    buildList();
  });

  listEl.addEventListener("change", (event) => {
    const row = event.target.closest(".row");
    if (!row) return;
    if (event.target.checked) state.selected[state.tab].add(row.dataset.id);
    else state.selected[state.tab].delete(row.dataset.id);
    countEl.textContent = selectedCountText();
    updateButtons();
  });

  listEl.addEventListener("click", (event) => {
    if (event.target.tagName === "INPUT") return;
    const row = event.target.closest(".row");
    if (!row) return;
    const input = row.querySelector("input");
    input.checked = !input.checked;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  for (const button of quickBtns) {
    button.addEventListener("click", () => {
      const resolved = resolveTab(state.quickType);
      runExport({
        tab: resolved.tab,
        groupMode: resolved.groupMode,
        all: true,
        fmt: button.dataset.quickFmt,
        label: exportingLabel(state.quickType),
      });
    });
  }

  exportTabAllBtn.addEventListener("click", () => {
    runExport({
      tab: state.tab,
      groupMode: state.tab === "groups" ? "messages" : undefined,
      all: true,
      fmt: "csv",
      label: exportingLabel(state.tab),
    });
  });

  for (const button of exportBtns) {
    button.addEventListener("click", () => {
      const ids = selectedIds();
      if (!ids.length) {
        setStatus(t("statusSelectAtLeastOne"), "err");
        return;
      }
      runExport({
        tab: state.tab,
        ids,
        fmt: button.dataset.fmt,
        groupMode: state.tab === "groups" ? "messages" : undefined,
      });
    });
  }

  setMode("quick");
  window.postMessage({ type: HELLO, lang: state.lang }, "*");
})();

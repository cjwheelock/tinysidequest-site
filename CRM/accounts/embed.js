"use strict";
// Campuses & cities: every Campus and City Edition in the app, where outreach stands,
// the outreach code (with live use count) and the private landing page link.
// Owner-only. Data comes from public.crm_account_request through the CRM session.
(() => {
  const STAGES = ["Not contacted", "Researched", "Emailed", "Replied", "Meeting booked", "Pilot", "Customer", "Not now"];
  const STAGE_CLASS = {
    "Not contacted": "st-none", Researched: "st-research", Emailed: "st-emailed", Replied: "st-replied",
    "Meeting booked": "st-meeting", Pilot: "st-pilot", Customer: "st-customer", "Not now": "st-notnow",
  };
  const RANK = { Customer: 0, Pilot: 1, "Meeting booked": 2, Replied: 3, Emailed: 4, Researched: 5, "Not contacted": 6, "Not now": 7 };
  const mounts = new WeakMap();

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
  }
  const fmtDate = (d) => {
    if (!d) return "—";
    const t = new Date(String(d).length === 10 ? d + "T12:00:00" : d);
    return isNaN(t) ? "—" : t.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };
  const stageBadge = (s) => h("span", { class: "acct-stage " + (STAGE_CLASS[s] || ""), text: s });

  function mount(root, { rpc }) {
    const state = { rows: [], kind: "campus", stage: "all", q: "", sel: null, detail: null, busy: false, toast: "" };
    try { const saved = JSON.parse(localStorage.getItem("sq-accounts-view") || "{}"); if (saved.kind) state.kind = saved.kind; } catch {}
    let alive = true;

    const toast = (msg, err) => {
      const t = h("div", { class: "acct-toast" + (err ? " error" : ""), text: msg, role: "status" });
      document.body.append(t); setTimeout(() => t.remove(), 2600);
    };
    const copy = async (text, label) => {
      try { await navigator.clipboard.writeText(text); toast(label + " copied"); } catch { toast("Copy failed", true); }
    };

    async function load() {
      try { state.rows = await rpc("list"); if (alive) render(); }
      catch (e) { if (alive) { root.replaceChildren(h("div", { class: "surface acct-error", text: e.message || "Could not load accounts." })); } }
    }
    async function open(id) {
      state.sel = id; state.detail = null; render();
      try { state.detail = await rpc("get", id); } catch (e) { toast(e.message, true); state.sel = null; }
      if (alive) render();
    }
    async function save(id, payload, msg) {
      state.busy = true; render();
      try {
        const updated = await rpc("update", id, payload);
        state.detail = updated;
        const i = state.rows.findIndex((r) => r.id === id);
        if (i >= 0) state.rows[i] = { ...state.rows[i], ...updated };
        toast(msg || "Saved");
      } catch (e) { toast(e.message || "Save failed", true); }
      state.busy = false; if (alive) render();
    }
    async function log(id, text, contact) {
      state.busy = true; render();
      try {
        const updated = await rpc("log", id, { text, contact });
        state.detail = updated;
        const i = state.rows.findIndex((r) => r.id === id);
        if (i >= 0) state.rows[i] = { ...state.rows[i], lastContact: updated.lastContact, updatedAt: updated.updatedAt };
        toast("Note added");
      } catch (e) { toast(e.message || "Could not add note", true); }
      state.busy = false; if (alive) render();
    }

    function filtered() {
      const q = state.q.trim().toLowerCase();
      return state.rows.filter((r) => (state.kind === "all" || r.kind === state.kind)
        && (state.stage === "all" || (state.stage === "reached" ? r.stage !== "Not contacted" : r.stage === state.stage))
        && (!q || [r.name, r.region, r.code, r.editionId, ...(r.contacts || []).map((c) => c.name + " " + c.email + " " + c.org)].join(" ").toLowerCase().includes(q)))
        .sort((a, b) => (RANK[a.stage] ?? 9) - (RANK[b.stage] ?? 9) || a.name.localeCompare(b.name));
    }

    function metrics() {
      const rows = state.rows.filter((r) => state.kind === "all" || r.kind === state.kind);
      const n = (f) => rows.filter(f).length;
      const tile = (label, value, stage) => h("button", {
        type: "button", class: "acct-metric" + (state.stage === stage ? " selected" : ""),
        onclick: () => { state.stage = state.stage === stage ? "all" : stage; render(); },
      }, h("strong", { text: String(value) }), h("span", { text: label }));
      return h("div", { class: "acct-metrics" },
        tile("In the app", rows.length, "all"),
        tile("Reached out", n((r) => r.stage !== "Not contacted"), "reached"),
        tile("Not contacted", n((r) => r.stage === "Not contacted"), "Not contacted"),
        tile("Emailed", n((r) => r.stage === "Emailed"), "Emailed"),
        tile("Replied", n((r) => r.stage === "Replied"), "Replied"),
        tile("Meetings", n((r) => r.stage === "Meeting booked"), "Meeting booked"),
        tile("Pilots", n((r) => r.stage === "Pilot"), "Pilot"),
        tile("Customers", n((r) => r.stage === "Customer"), "Customer"));
    }

    function table() {
      const rows = filtered();
      const body = rows.map((r) => {
        const uses = r.codeUses ? `${r.codeUses.used}/${r.codeUses.limit ?? "∞"} used` : "";
        return h("tr", { class: r.id === state.sel ? "selected" : "", onclick: () => open(r.id) },
          h("td", {}, h("div", { class: "acct-name", text: r.name }), h("div", { class: "cell-sub", text: r.kind === "campus" ? "Campus Edition" : "City Edition" })),
          h("td", {}, h("select", {
            class: "acct-stage-select " + (STAGE_CLASS[r.stage] || ""), "aria-label": "Stage for " + r.name,
            onclick: (e) => e.stopPropagation(),
            onchange: (e) => save(r.id, { stage: e.target.value }, "Stage updated"),
          }, STAGES.map((s) => { const o = h("option", { value: s, text: s }); if (s === r.stage) o.selected = true; return o; }))),
          h("td", {}, r.code ? h("div", { class: "acct-code" },
            h("button", { type: "button", class: "acct-chip", title: "Copy code", onclick: (e) => { e.stopPropagation(); copy(r.code, "Code"); }, text: r.code }),
            h("span", { class: "cell-sub", text: uses })) : h("span", { class: "muted", text: "No code yet" })),
          h("td", {}, r.url ? h("div", { class: "acct-links" },
            h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer", onclick: (e) => e.stopPropagation(), text: "Open page ↗" }),
            h("button", { type: "button", class: "text-button", onclick: (e) => { e.stopPropagation(); copy(r.url, "Link"); }, text: "Copy link" })) : h("span", { class: "muted", text: "—" })),
          h("td", { text: fmtDate(r.lastContact) }),
          h("td", { class: "acct-next", text: r.nextStep || "" }),
          h("td", { class: "acct-num", text: String((r.contacts || []).length || "") }));
      });
      return h("div", { class: "surface table-scroll acct-table-wrap" },
        h("table", { class: "acct-table" },
          h("thead", {}, h("tr", {}, ["Name", "Stage", "Code", "Landing page", "Last contact", "Next step", "Contacts"].map((t) => h("th", { text: t })))),
          h("tbody", {}, body.length ? body : h("tr", {}, h("td", { colspan: "7", class: "muted acct-empty", text: "Nothing matches." })))));
    }

    function drawer() {
      const d = state.detail;
      if (!state.sel) return null;
      const close = () => { state.sel = null; state.detail = null; render(); };
      if (!d) return h("aside", { class: "acct-drawer surface" }, h("p", { class: "muted", text: "Loading…" }));
      const stageSel = h("select", { class: "acct-input" }, STAGES.map((s) => { const o = h("option", { value: s, text: s }); if (s === d.stage) o.selected = true; return o; }));
      const next = h("input", { class: "acct-input", value: d.nextStep || "", maxlength: "500", placeholder: "What happens next?" });
      const due = h("input", { class: "acct-input", type: "date", value: d.nextStepDue || "" });
      const last = h("input", { class: "acct-input", type: "date", value: d.lastContact || "" });
      const notes = h("textarea", { class: "acct-input acct-notes", rows: "5", maxlength: "20000", placeholder: "Notes" });
      notes.value = d.notes || "";
      const contacts = (d.contacts || []).map((c) => ({ ...c }));
      const contactList = h("div", { class: "acct-contacts" });
      const drawContacts = () => contactList.replaceChildren(...(contacts.length ? contacts.map((c, i) => h("div", { class: "acct-contact" },
        h("div", {}, h("strong", { text: c.name || c.title || c.email || "Contact" }),
          h("div", { class: "cell-sub", text: [c.name && c.title, c.org].filter(Boolean).join(" · ") }),
          h("div", { class: "cell-sub" }, c.email ? h("a", { href: "mailto:" + c.email, text: c.email }) : "", c.phone ? "  " + c.phone : ""),
          c.source ? h("div", { class: "cell-sub acct-source", text: c.source }) : ""),
        h("button", { type: "button", class: "text-button danger", "aria-label": "Remove contact", onclick: () => { contacts.splice(i, 1); drawContacts(); }, text: "Remove" })))
        : [h("p", { class: "muted", text: "No contacts yet." })]));
      drawContacts();
      const cName = h("input", { class: "acct-input", placeholder: "Name" });
      const cTitle = h("input", { class: "acct-input", placeholder: "Title" });
      const cEmail = h("input", { class: "acct-input", placeholder: "Email", type: "email" });
      const addContact = () => {
        if (!cName.value.trim() && !cEmail.value.trim()) return;
        contacts.push({ name: cName.value.trim(), title: cTitle.value.trim(), email: cEmail.value.trim(), org: d.name, phone: "", source: "Added in CRM" });
        cName.value = cTitle.value = cEmail.value = ""; drawContacts();
      };
      const logText = h("textarea", { class: "acct-input", rows: "2", maxlength: "2000", placeholder: "Log a call, email or reply" });
      const logContact = h("input", { type: "checkbox", id: "acct-log-contact", checked: true });
      return h("aside", { class: "acct-drawer surface", "aria-label": d.name },
        h("div", { class: "acct-drawer-head" },
          h("div", {}, h("h2", { text: d.name }), h("div", { class: "cell-sub", text: (d.kind === "campus" ? "Campus Edition" : "City Edition") + (d.region ? " · " + d.region : "") })),
          h("button", { type: "button", class: "text-button", onclick: close, text: "Close" })),
        d.code || d.url ? h("div", { class: "acct-access" },
          d.code ? h("div", {}, h("span", { class: "cell-sub", text: "Code (also unlocks the edition in the app)" }),
            h("div", { class: "acct-code" }, h("button", { type: "button", class: "acct-chip large", onclick: () => copy(d.code, "Code"), text: d.code }),
              d.codeUses ? h("span", { class: "cell-sub", text: `${d.codeUses.used} of ${d.codeUses.limit ?? "unlimited"} uses${d.codeUses.enabled ? "" : " · disabled"}` }) : "")) : "",
          d.url ? h("div", {}, h("span", { class: "cell-sub", text: "Private landing page" }),
            h("div", { class: "acct-links" }, h("a", { href: d.url, target: "_blank", rel: "noopener noreferrer", text: d.url }),
              h("button", { type: "button", class: "text-button", onclick: () => copy(d.url, "Link"), text: "Copy" }))) : "") : "",
        h("div", { class: "acct-grid" },
          h("label", { class: "field" }, h("span", { text: "Stage" }), stageSel),
          h("label", { class: "field" }, h("span", { text: "Last contact" }), last),
          h("label", { class: "field acct-wide" }, h("span", { text: "Next step" }), next),
          h("label", { class: "field" }, h("span", { text: "Due" }), due)),
        h("label", { class: "field" }, h("span", { text: "Notes" }), notes),
        h("h3", { text: "Contacts" }), contactList,
        h("div", { class: "acct-add" }, cName, cTitle, cEmail, h("button", { type: "button", class: "button secondary", onclick: addContact, text: "Add contact" })),
        h("div", { class: "actions acct-save" }, h("button", {
          type: "button", class: "button", disabled: state.busy,
          onclick: () => save(d.id, { stage: stageSel.value, nextStep: next.value, nextStepDue: due.value, lastContact: last.value, notes: notes.value, contacts }),
          text: state.busy ? "Saving…" : "Save changes",
        })),
        h("h3", { text: "Activity" }),
        h("div", { class: "acct-log" }, logText,
          h("label", { class: "acct-check", for: "acct-log-contact" }, logContact, "Counts as a contact today"),
          h("button", { type: "button", class: "button secondary", disabled: state.busy, onclick: () => { const t = logText.value.trim(); if (t) log(d.id, t, logContact.checked); }, text: "Add to activity" })),
        h("ul", { class: "acct-activity" }, (d.activity || []).map((a) => h("li", {}, h("span", { class: "cell-sub", text: fmtDate(a.at) }), h("span", { text: a.text })))));
    }

    function render() {
      if (!alive) return;
      const focusId = document.activeElement && document.activeElement.id;
      const tabs = h("div", { class: "acct-tabs", role: "tablist" }, [["campus", "Campuses"], ["city", "Cities"], ["all", "All"]].map(([k, label]) =>
        h("button", { type: "button", role: "tab", "aria-selected": String(state.kind === k), class: state.kind === k ? "active" : "",
          onclick: () => { state.kind = k; try { localStorage.setItem("sq-accounts-view", JSON.stringify({ kind: k })); } catch {} render(); },
          text: `${label} (${state.rows.filter((r) => k === "all" || r.kind === k).length})` })));
      const search = h("input", { id: "acct-search", class: "acct-input acct-search", type: "search", placeholder: "Search name, code or contact", value: state.q,
        oninput: (e) => { state.q = e.target.value; render(); } });
      const stageFilter = h("select", { class: "acct-input acct-filter", "aria-label": "Filter by stage", onchange: (e) => { state.stage = e.target.value; render(); } },
        [["all", "All stages"], ["reached", "Reached out (any stage)"], ...STAGES.map((s) => [s, s])].map(([v, t]) => { const o = h("option", { value: v, text: t }); if (v === state.stage) o.selected = true; return o; }));
      root.replaceChildren(h("div", { class: "acct-root" + (state.sel ? " with-drawer" : "") },
        h("div", { class: "page-heading" }, h("div", {}, h("h1", { text: "Campuses & cities" }),
          h("p", { class: "muted", text: "Every edition in the app, where outreach stands, its code and its private page." }))),
        tabs, metrics(),
        h("div", { class: "acct-toolbar" }, search, stageFilter),
        h("div", { class: "acct-body" }, table(), drawer())));
      if (focusId === "acct-search") { const s = root.querySelector("#acct-search"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    }

    root.replaceChildren(h("p", { class: "muted", text: "Loading campuses and cities…" }));
    load();
    mounts.set(root, () => { alive = false; });
  }

  function unmount(root) { const stop = mounts.get(root); if (stop) stop(); mounts.delete(root); root.replaceChildren(); }

  if (!document.querySelector("link[data-sq-accounts]")) {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/CRM/accounts/embed.css?v=1"; l.dataset.sqAccounts = "1"; document.head.append(l);
  }
  window.SQAccounts = { mount, unmount };
})();

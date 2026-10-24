// 0.19.17 look tour: a QA screenshot run for the real app. Inert unless the app was started with
// BLAZE_LOOK_TOUR=<folder> (looktour_app.go). Then, for each theme and window size, it opens every
// main view and every glass panel over a conversation full of text, measures what is on screen
// (panel fill opacity, the contrast of every line of text in a panel, overlaps and clipping in the
// top bar) and hands the measurements to Go, which waits until the screenshot of that state is taken.
(() => {
  // The same list as look.css "glass-panels" (ci/glass.test.js checks they match).
  const PANELS = [".pop", ".menu", "#menu", ".vcard", ".topicpop", ".wmenu", ".wcard", ".cwpop", ".toast.error", ".htoast", ".ltoast", ".ntoast",
    "#screenind:not(.docked)", ".mzsheet", ".mzmini", ".privdlg .card", ".csvk", ".obpanel", ".mtools", ".mtime", ".selbar", ".dirnow",
    ".design.studio .dbar.ft-tl", ".ft-tr .btn:not(.accent)", ".ft-bl .btn", ".dzoom", ".design.studio .dstage > .viewing",
    ".md .deck .dnav", ".acard .amore", ".topicchip", "#topMorePop"];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const A = () => window.go && window.go.main && window.go.main.App;
  const R = () => window.runtime;

  const TEXT = "Here is the plan for the launch week, written out in full so it fills the screen behind every panel. ";
  const CONV = { id: "main", title: "Chat", messages: [
    { role: "user", content: "Read sales-q3.csv and tell me which store grew fastest, then draft the note to the team." },
    { role: "assistant", content: "**Lusaka Central grew fastest**: revenue went from K 182,400 in July to K 241,900 in September (+32.6 %).\n\n" +
      "| Store | July | August | September | Growth |\n| --- | --- | --- | --- | --- |\n| Lusaka Central | 182,400 | 205,100 | 241,900 | +32.6 % |\n| Kitwe Mall | 150,200 | 158,000 | 171,300 | +14.0 % |\n| Ndola Road | 98,700 | 97,900 | 104,200 | +5.6 % |\n\n" +
      TEXT.repeat(4) + "\n\n```python\nimport pandas as pd\ndf = pd.read_csv('sales-q3.csv')\nprint(df.groupby('store')['revenue'].sum().sort_values())\n```\n\nWant me to send the note now or keep it as a draft?" },
    { role: "user", content: "Keep it as a draft. Also remind me on Monday at 9 to review the stock levels with Mwila." },
    { role: "assistant", content: "Done. The draft is saved as `notes/q3-team-note.md`, and I set a reminder for **Monday 9:00** to review the stock levels with Mwila.\n\n" + TEXT.repeat(6) },
    { role: "user", content: "What is still open from last week?" },
    { role: "assistant", content: "Three things are still open:\n\n1. The supplier contract for Kitwe Mall is waiting on your signature.\n2. The September payroll export has not been sent to the accountant.\n3. The new price list still shows the old delivery fee.\n\n" + TEXT.repeat(5) },
  ] };

  const reset = () => {
    try { closePop(); } catch (e) {}
    try { closeMenu(); } catch (e) {}
    document.querySelectorAll("#toasts .toast, .privdlg, .htoast, .ltoast, .ntoast").forEach(t => t.remove());
  };
  async function chat() {
    if (window.Shell) await Shell.go("chat");
    await wait(250);
    if (typeof loadConv === "function") loadConv(CONV);
    const log = document.querySelector("#log"); if (log) log.scrollTop = Math.max(0, log.scrollHeight * 0.25);
    await wait(250);
  }
  const STATES = [
    ["home", async () => { show("home"); }],
    ["chat", chat],
    ["projects", async () => { Shell.go("projects"); }],
    ["settings", async () => { show("settings", "appearance"); }],
    ["about", async () => { show("settings", "about"); }],
    ["p-avatar", async () => { await chat(); document.querySelector("#avatar").click(); }],
    ["p-palette", async () => { await chat(); await Shell.search(); }],
    ["p-model", async () => { await chat(); await modelPopover(document.querySelector("#avatar")); }],
    ["p-plus", async () => { await chat(); document.querySelector("#plus").click(); }],
    ["p-slash", async () => { await chat(); const i = document.querySelector("#input"); i.value = "/"; await onType(); }],
    ["p-views", async () => { await chat(); BlazeViews.picker(); }],
    ["p-toast", async () => { await chat(); toast("Saved your summary to notes/q3-team-note.md", "ok"); toast("Couldn't reach the model. Trying again in 5 seconds.", "error"); }],
    ["p-dialog", async () => { await chat(); document.body.append(h("div", "privdlg", `<div class="card" role="dialog" aria-modal="true"><div class="tt">Leave private chat?</div><p>This chat isn't saved. It will be gone for good.</p><div class="acts"><button class="btn line sm st">Stay</button><button class="btn accent sm lv">Leave</button></div></div>`)); }],
    ["p-more", async () => { await chat(); const m = document.querySelector("#topMore"); if (m && m.offsetParent) m.click(); }],
  ];

  // ---- measurements ----
  const rgba = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (t, u) => [0, 1, 2].map(i => t[i] * t[3] + u[i] * (1 - t[3])).concat(1);
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const shown = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0.05; };
  // The fill a text element sits on inside a panel: its own and its parents' backgrounds up to the panel.
  function fillUnder(el, panel, base) {
    const chain = []; for (let e = el; e && e !== panel.parentElement; e = e.parentElement) chain.push(e);
    let c = base; for (const e of chain.reverse()) { const b = rgba(getComputedStyle(e).backgroundColor); if (b && b[3] > 0) c = over(b, c); }
    return c;
  }
  function auditPanels() {
    const out = [];
    document.querySelectorAll(PANELS.join(",")).forEach(p => {
      if (!shown(p)) return;
      const bg = rgba(getComputedStyle(p).backgroundColor) || [0, 0, 0, 0];
      let min = 99, worst = "", n = 0;
      // Worst case behind the panel: white or black, whichever is further from its fill.
      const behind = lum(bg) > 0.4 ? [0, 0, 0, 1] : [255, 255, 255, 1];
      p.querySelectorAll("*").forEach(e => {
        if (!shown(e)) return;
        const own = [...e.childNodes].some(t => t.nodeType === 3 && t.textContent.trim());
        if (!own) return;
        const ground = fillUnder(e, p, over(bg, behind));
        const fg = rgba(getComputedStyle(e).color); if (!fg) return;
        const op = [...function* () { for (let x = e; x && x !== p.parentElement; x = x.parentElement) yield +getComputedStyle(x).opacity; }()].reduce((a, b) => a * b, 1);
        const r = ratio(over([fg[0], fg[1], fg[2], fg[3] * op], ground), ground);
        n++; if (r < min) { min = r; worst = e.textContent.trim().slice(0, 40); }
      });
      out.push({ panel: (p.id ? "#" + p.id : "") + "." + [...p.classList].join("."), alpha: +bg[3].toFixed(3), texts: n, min: +min.toFixed(2), worst });
    });
    return out;
  }
  function auditTop() {
    const top = document.querySelector("#top"); if (!top || !shown(top)) return { ok: true };
    const tr = top.getBoundingClientRect(), bad = [];
    const kids = [...top.children].filter(e => shown(e) && !e.classList.contains("grow"));
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push("overlap " + (kids[i].id || kids[i].className) + " / " + (kids[j].id || kids[j].className));
    }
    kids.forEach(k => { const r = k.getBoundingClientRect(); const slack = k.classList.contains("winctl") ? 16 : 1; if (r.left < tr.left - 1 || r.right > tr.right + slack) bad.push("outside " + (k.id || k.className)); });
    top.querySelectorAll("button, .chip, .label").forEach(b => {
      if (!shown(b) || b.id === "folder" || b.closest("#folder")) return; // the folder path ellipsizes on purpose
      if (b.scrollWidth > b.clientWidth + 1 && getComputedStyle(b).overflow !== "visible") bad.push("clipped " + (b.id || b.textContent.trim().slice(0, 20)));
      if (b.scrollWidth > b.clientWidth + 1 && b.closest("#pill")) bad.push("clipped tab " + b.textContent.trim());
    });
    return { ok: !bad.length, bad, fit: top.dataset.fit || "", more: !!(document.querySelector("#topMore") || {}).offsetParent };
  }

  async function size(sz) {
    const rt = R(); if (!rt) return;
    try { rt.WindowUnmaximise(); } catch (e) {}
    await wait(400);
    if (sz === "max") { rt.WindowMaximise(); }
    else if (sz === "half") {
      const W = screen.availWidth || 1920, H = screen.availHeight || 1040;
      rt.WindowSetSize(Math.round(W / 2), H); rt.WindowSetPosition(0, 0);
    } else { const [w, hh] = sz.split("x").map(Number); rt.WindowSetSize(w, hh); rt.WindowSetPosition(0, 0); }
    await wait(1200);
  }
  async function info(name) {
    const rt = R(); let pos = {}, sz = {};
    try { pos = await rt.WindowGetPosition(); sz = await rt.WindowGetSize(); } catch (e) {}
    return { name, inner: [innerWidth, innerHeight], dpr: devicePixelRatio, screen: [screen.width, screen.height, screen.availWidth, screen.availHeight], pos, size: sz, panels: auditPanels(), top: auditTop(), theme: document.documentElement.dataset.theme, version: (S && S.version) || "" };
  }

  async function run(cfg) {
    await wait(1500);
    if (window.Onboard) try { Onboard.close(); } catch (e) {}
    for (const theme of cfg.themes) {
      if (S && S.prefs) S.prefs.theme = theme; applyTheme();
      for (const sz of cfg.sizes) {
        await size(sz);
        for (const [st, fn] of STATES) {
          if (cfg.states.length && !cfg.states.includes(st)) continue;
          reset(); if (window.Onboard) try { Onboard.close(); } catch (e) {}
          try { await fn(); } catch (e) { console.log("tour", st, e); }
          await wait(900);
          const name = `${theme}-${sz}-${st}`;
          await A().LookTourStep(name, JSON.stringify(await info(name)));
        }
      }
    }
    reset();
    await A().LookTourStep("finished", "{}");
    if (cfg.quit) try { R().Quit(); } catch (e) {}
  }

  async function start() {
    const api = A(); if (!api || !api.LookTour) return;
    const cfg = await api.LookTour(); if (!cfg || !cfg.dir) return;
    for (let i = 0; i < 120 && !(typeof S !== "undefined" && S && window.Shell && document.querySelector("#avatar")); i++) await wait(250);
    run({ themes: cfg.themes && cfg.themes.length ? cfg.themes : ["light", "dark"], sizes: cfg.sizes && cfg.sizes.length ? cfg.sizes : ["800x600", "1024x768", "1366x768", "1920x1080", "max", "half"], states: cfg.states || [], quit: !!cfg.quit });
  }
  window.BlazeLookTour = { PANELS, auditPanels, auditTop, CONV };
  start();
})();

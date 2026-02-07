// oscillaLive.js — ES Module Live Coding Inspector
// -------------------------------------------------

let inspectorEnabled = false;
let inspectorLabels = [];

let startRotate, startObj2Path, startScale; // injected

export function enableLiveInspector(deps = {}) {
  console.log("%c[Inspector] 🔁 enableLiveInspector() called", "color:#9cf");

  startRotate = deps.startRotate;
  startObj2Path = deps.startObj2Path;
  startScale = deps.startScale;

  window.addEventListener("keydown", inspectorToggleListener);
  console.log("%c[Inspector] ⌨️ Keybinding active → Shift+I to toggle", "color:#9cf");
}


// --- Toggle ----------------------------------------------------

function inspectorToggleListener(e) {
  if (e.shiftKey && e.key.toLowerCase() === "i") {
    inspectorEnabled = !inspectorEnabled;
    console.log(
      `%c[Inspector] ${inspectorEnabled ? "🟢 ENABLED" : "🔵 DISABLED"} via Shift+I`,
      "color:#9cf"
    );

    if (inspectorEnabled) enableInspectorUI();
    else disableInspectorUI();
  }
}


// --- Detect animatable objects --------------------------------

function getAnimatableObjects() {
  return Array.from(document.querySelectorAll(`
    [id*="obj_rotate"],
    [id*="obj2path"],
    [id^="s_"],
    [id^="sXY_"],
    [id^="r_"],
    [id*="deg["]
  `));
}


// --- UI Create / Destroy --------------------------------------

function enableInspectorUI() {
  console.log("%c[Inspector] 🟢 Building Inspector UI...", "color:#0f0");

  const container = document.body;
  inspectorLabels = [];

  getAnimatableObjects().forEach(obj => {
    const label = document.createElement("div");
    label.className = "oscilla-inspector-label";
    label.textContent = obj.id;
    label.onclick = () => insertUidIntoConsole(obj);
    container.appendChild(label);

    inspectorLabels.push({ obj, label });
    positionLabel(obj, label);
  });

  window.addEventListener("scroll", repositionAll);
  buildUidSidebar();
  showSidebar(true);
  showConsole(true);

  console.log(`%c[Inspector] ✅ UI Ready — ${inspectorLabels.length} objects indexed`, "color:#0f0");
}

function disableInspectorUI() {
  console.log("%c[Inspector] 🔵 Removing Inspector UI...", "color:#f88");

  inspectorLabels.forEach(({ label }) => label.remove());
  inspectorLabels = [];

  window.removeEventListener("scroll", repositionAll);
  showSidebar(false);
  showConsole(false);

  console.log("%c[Inspector] ❎ UI Disabled", "color:#f88");
}


// --- Sidebar and Console Visibility ----------------------------

function showSidebar(state) {
  const el = document.getElementById("oscilla-uid-sidebar");
  if (!el) return console.warn("[Inspector] ⚠️ Missing #oscilla-uid-sidebar");
  el.style.display = state ? "block" : "none";
}

function showConsole(state) {
  const el = document.getElementById("oscilla-console");
  if (!el) return console.warn("[Inspector] ⚠️ Missing #oscilla-console");
  el.style.display = state ? "block" : "none";
}


// --- Floating Label Positioning --------------------------------

function positionLabel(obj, label) {
  const r = obj.getBoundingClientRect();
  label.style.left = (r.left + window.scrollX + 5) + "px";
  label.style.top  = (r.top  + window.scrollY - 18) + "px";
}

function repositionAll() {
  inspectorLabels.forEach(({ obj, label }) => positionLabel(obj, label));
}


// --- Sidebar List + Search -------------------------------------

function buildUidSidebar() {
  const list = document.getElementById("oscilla-uid-list");
  const search = document.getElementById("oscilla-uid-search");

  if (!list || !search) {
    console.warn("[Inspector] ⚠️ Sidebar DOM not present – skipping build");
    return;
  }

  list.innerHTML = "";
  const objs = getAnimatableObjects();

  objs.forEach(obj => {
    const item = document.createElement("div");
    item.className = "oscilla-uid-item";
    item.textContent = obj.id;

    item.onclick = () => insertUidIntoConsole(obj);
    item.onmouseenter = () => highlightObject(obj, true);
    item.onmouseleave = () => highlightObject(obj, false);

    list.appendChild(item);
  });

  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    for (const item of list.children) {
      item.style.display = fuzzyMatch(q, item.textContent.toLowerCase()) ? "block" : "none";
    }
  };

  console.log("%c[Inspector] 📋 Sidebar updated", "color:#9cf");
}

function fuzzyMatch(q, s) {
  let qi = 0;
  for (let si = 0; si < s.length && qi < q.length; si++) {
    if (s[si] === q[qi]) qi++;
  }
  return qi === q.length;
}

function highlightObject(obj, state) {
  if (state) {
    obj.dataset._origStroke = obj.style.stroke || "";
    obj.dataset._origStrokeWidth = obj.style.strokeWidth || "";
    obj.style.stroke = "yellow";
    obj.style.strokeWidth = "2px";
  } else {
    obj.style.stroke = obj.dataset._origStroke;
    obj.style.strokeWidth = obj.dataset._origStrokeWidth;
  }
}


// --- Console Editing & Execution -------------------------------

function insertUidIntoConsole(obj) {
  const editor = document.getElementById("oscilla-console-editor");
  if (!editor) return console.warn("[Inspector] ⚠️ Missing #oscilla-console-editor");

  const uid = obj.id;
  const start = editor.selectionStart;
  const text = editor.value;
  const insert = uid + "\n";

  editor.value = text.slice(0, start) + insert + text.slice(start);
  editor.selectionStart = editor.selectionEnd = start + insert.length;
  editor.focus();

  console.log(`%c[Inspector] ➕ Inserted UID: ${uid}`, "color:#9cf");
}

function applyMicrosyntaxLine(line) {
  const cleaned = line.trim();
  if (!cleaned || cleaned.startsWith("#") || cleaned.startsWith("//")) return;

  const id = cleaned;
  const obj = document.getElementById(id.split(/\s+/)[0]);

  if (!obj) {
    console.warn("[Inspector] ⚠️ No object found for:", cleaned);
    return;
  }

  obj.setAttribute("id", id);
  reinitializeAnimation(obj);
  repositionAll();

  console.log(`%c[Inspector] 🎬 Applied: ${id}`, "color:#9cf");
}

function getCurrentLine(editor) {
  const pos = editor.selectionStart;
  const text = editor.value;
  const before = text.lastIndexOf("\n", pos - 1) + 1;
  const after = text.indexOf("\n", pos);
  return text.substring(before, after === -1 ? text.length : after);
}

document.addEventListener("keydown", (e) => {
  const editor = document.getElementById("oscilla-console-editor");
  if (!editor) return;

  if (document.activeElement !== editor) return;

  if (e.ctrlKey && !e.shiftKey && e.key === "Enter") {
    e.preventDefault();
    applyMicrosyntaxLine(getCurrentLine(editor));
  }

  if (e.ctrlKey && e.shiftKey && e.key === "Enter") {
    e.preventDefault();
    editor.value.split("\n").forEach(applyMicrosyntaxLine);
  }
});


// --- Animation Re-init Hook -----------------------------------

function reinitializeAnimation(obj) {
  const id = obj.id;

  console.log(`%c[Inspector] 🔄 Re-initializing: ${id}`, "color:#9cf");

  if (id.includes("obj_rotate") && startRotate) startRotate(obj);
  else if (id.includes("obj2path") && startObj2Path) startObj2Path(obj);
  else if ((id.startsWith("s_") || id.startsWith("sXY_")) && startScale) startScale(obj);
  else console.warn("[Inspector] ⚠️ No re-init match for:", id);
}

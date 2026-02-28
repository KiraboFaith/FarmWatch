const $ = (sel) => document.querySelector(sel);

const state = {
  theme: "dark",
  lastTelemetry: null,
  rows: [],
};

function nowTime() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function setTheme(theme) {
  state.theme = theme;
  document.body.setAttribute("data-theme", theme);
  $("#modeLabel").textContent = theme === "dark" ? "Dark Ops" : "Light Report";
  localStorage.setItem("farmwatch_theme", theme);
}

function toggleTheme() {
  setTheme(state.theme === "dark" ? "light" : "dark");
}

function seedTheme() {
  const saved = localStorage.getItem("farmwatch_theme");
  if (saved === "light" || saved === "dark") setTheme(saved);
}

function badgeFor(module, pct, raw) {
  // Thresholds mirrored from your Arduino raw thresholds (converted to %)
  const rawToPct = (r) => (r * 100) / 1023;

  if (module === "Soil Moisture") {
    // soil uses inverted pct (0 dry, 100 wet) -> low moisture means "warn"
    if (pct < (100 - rawToPct(300))) return { label: "LOW", cls: "warn" };
    return { label: "OK", cls: "ok" };
  }
  if (module === "Temperature") {
    if (raw > 600) return { label: "HIGH", cls: "warn" };
    return { label: "OK", cls: "ok" };
  }
  if (module === "Harvest Readiness") {
    if (raw > 800) return { label: "READY", cls: "ok" };
    return { label: "GROWING", cls: "warn" };
  }
  if (module === "Sorting Quality") {
    if (raw > 700) return { label: "GRADE A", cls: "ok" };
    if (raw < 400) return { label: "GRADE B", cls: "warn" };
    return { label: "MID", cls: "warn" };
  }
  return { label: "OK", cls: "ok" };
}

function setMeter(idFill, pct) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  $(idFill).style.width = `${v}%`;
}

function setTag(idTag, text) {
  $(idTag).textContent = text;
}

function pushRow(row) {
  state.rows.unshift(row);
  state.rows = state.rows.slice(0, 6);
}

function renderTable() {
  const tb = $("#telemetryTbody");
  tb.innerHTML = state.rows
    .map((r) => {
      return `
      <tr>
        <td>${r.module}</td>
        <td>${r.raw}</td>
        <td><strong>${r.pct}%</strong></td>
        <td><span class="badge ${r.badgeCls}">${r.badgeLabel}</span></td>
        <td>${r.time}</td>
      </tr>`;
    })
    .join("");
}

function renderTelemetry(msg) {
  state.lastTelemetry = msg;

  const soilPct = msg.soil.moisturePct;
  const tempPct = msg.temp.levelPct;
  const harvestPct = msg.harvest.readinessPct;
  const sortPct = msg.sorting.qualityPct;

  $("#liveText").textContent = "Serial Live";
  $("#liveDot").classList.add("on");

  $("#soilMoisture").textContent = soilPct.toFixed(1);
  $("#tempPct").textContent = tempPct.toFixed(1);
  $("#harvestPct").textContent = harvestPct.toFixed(1);
  $("#sortPct").textContent = sortPct.toFixed(1);

  setMeter("#soilMeter", soilPct);
  setMeter("#tempMeter", tempPct);
  setMeter("#harvestMeter", harvestPct);
  setMeter("#sortMeter", sortPct);

  const soilB = badgeFor("Soil Moisture", soilPct, msg.soil.raw);
  const tempB = badgeFor("Temperature", tempPct, msg.temp.raw);
  const harvB = badgeFor("Harvest Readiness", harvestPct, msg.harvest.raw);
  const sortB = badgeFor("Sorting Quality", sortPct, msg.sorting.raw);

  setTag("#soilStatus", soilB.label);
  setTag("#tempStatus", tempB.label);
  setTag("#harvestStatus", harvB.label);
  setTag("#sortStatus", sortB.label);

  // Module states
  $("#actPlanting").textContent = msg.act.planting ? "Active" : "Idle";
  $("#actWatering").textContent = msg.act.watering ? "Active" : "Idle";
  $("#actWeeding").textContent = msg.act.weeding ? "Active" : "Idle";
  $("#actPackaging").textContent = msg.act.packaging ? "Active" : "Idle";

  const t = nowTime();

  pushRow({
    module: "Soil Moisture",
    raw: msg.soil.raw,
    pct: soilPct.toFixed(1),
    badgeLabel: soilB.label,
    badgeCls: soilB.cls,
    time: t,
  });

  pushRow({
    module: "Temperature",
    raw: msg.temp.raw,
    pct: tempPct.toFixed(1),
    badgeLabel: tempB.label,
    badgeCls: tempB.cls,
    time: t,
  });

  pushRow({
    module: "Harvest Readiness",
    raw: msg.harvest.raw,
    pct: harvestPct.toFixed(1),
    badgeLabel: harvB.label,
    badgeCls: harvB.cls,
    time: t,
  });

  pushRow({
    module: "Sorting Quality",
    raw: msg.sorting.raw,
    pct: sortPct.toFixed(1),
    badgeLabel: sortB.label,
    badgeCls: sortB.cls,
    time: t,
  });

  renderTable();
}

function addEvent(evt) {
  const ul = $("#alertsList");

  const li = document.createElement("li");
  li.className = "alert";
  li.innerHTML = `
    <div class="a-title">${evt.module.toUpperCase()}</div>
    <div class="a-sub">${evt.message}</div>
  `;
  ul.prepend(li);

  while (ul.children.length > 8) ul.removeChild(ul.lastChild);
}

function supportsWebSerial() {
  return "serial" in navigator;
}

async function connectSerial() {
  if (!supportsWebSerial()) {
    alert("Web Serial not supported. Use Chrome/Edge on desktop.");
    return;
  }

  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 9600 });

  $("#connectLabel").textContent = "Connected";

  const decoder = new TextDecoderStream();
  const readableClosed = port.readable.pipeTo(decoder.writable);
  const reader = decoder.readable.getReader();

  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;

      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);

        if (!line) continue;

        try {
          const msg = JSON.parse(line);

          if (msg.event) {
            addEvent(msg);
            continue;
          }

          if (msg.telemetry) {
            renderTelemetry(msg);
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock();
    await readableClosed.catch(() => {});
    $("#connectLabel").textContent = "Connect";
    $("#liveText").textContent = "Idle";
    $("#liveDot").classList.remove("on");
  }
}

function bindUI() {
  $("#modeBtn").addEventListener("click", toggleTheme);
  $("#connectBtn").addEventListener("click", connectSerial);
}

seedTheme();
bindUI();
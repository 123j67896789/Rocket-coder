const partsCatalog = {
  tank: { type: "tank", name: "Fuel Tank", dryMass: 1.6, fuelMass: 6.5, thrust: 0 },
  engine: { type: "engine", name: "Engine", dryMass: 1.2, fuelMass: 0, thrust: 220 },
  probe: { type: "probe", name: "Probe Core", dryMass: 0.5, fuelMass: 0, thrust: 0 }
};

const planets = {
  Earth: { radius: 6371000, mass: 5.972e24, color: "#4ba3ff", atmosphere: 110000 },
  Moon: { radius: 1737000, mass: 7.342e22, color: "#b9bdc7", atmosphere: 0 },
  Mars: { radius: 3389500, mass: 6.417e23, color: "#ff784f", atmosphere: 80000 }
};

const G = 6.67430e-11;
const rocket = [structuredClone(partsCatalog.probe), structuredClone(partsCatalog.tank), structuredClone(partsCatalog.engine)];

let scriptCommands = [];
let activeTab = "vab";
let flight = null;

const tabButtons = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");
const vabCanvas = document.getElementById("vabCanvas");
const vabCtx = vabCanvas.getContext("2d");
const flightCanvas = document.getElementById("flightCanvas");
const fctx = flightCanvas.getContext("2d");
const rocketStats = document.getElementById("rocketStats");
const flightStats = document.getElementById("flightStats");
const planetSelect = document.getElementById("planetSelect");
const scriptInput = document.getElementById("scriptInput");
const scriptStatus = document.getElementById("scriptStatus");

function massSummary() {
  const dry = rocket.reduce((sum, p) => sum + p.dryMass, 0);
  const fuel = rocket.reduce((sum, p) => sum + p.fuelMass, 0);
  const thrust = rocket.reduce((sum, p) => sum + p.thrust, 0);
  return { dry, fuel, total: dry + fuel, thrust };
}

function renderRocketStats() {
  const m = massSummary();
  const twrEarth = m.thrust / (m.total * 9.81 * 1000);
  rocketStats.innerHTML = `Parts: <b>${rocket.length}</b> | Mass: <b>${m.total.toFixed(2)} t</b> | Fuel: <b>${m.fuel.toFixed(2)} t</b> | Thrust: <b>${m.thrust.toFixed(0)} kN</b> | TWR(Earth): <b>${twrEarth.toFixed(2)}</b>`;
}

function drawVab() {
  vabCtx.clearRect(0, 0, vabCanvas.width, vabCanvas.height);
  vabCtx.fillStyle = "#0a1430";
  vabCtx.fillRect(0, 0, vabCanvas.width, vabCanvas.height);

  const segmentH = 44;
  let y = vabCanvas.height - 30;
  for (let i = rocket.length - 1; i >= 0; i -= 1) {
    const p = rocket[i];
    y -= segmentH;
    vabCtx.fillStyle = p.type === "tank" ? "#6ab8ff" : p.type === "engine" ? "#ff8c59" : "#b4ff9b";
    vabCtx.fillRect(vabCanvas.width / 2 - 34, y, 68, segmentH - 4);
    vabCtx.fillStyle = "#061026";
    vabCtx.font = "12px sans-serif";
    vabCtx.fillText(p.name, vabCanvas.width / 2 - 28, y + 24);
  }
}

function parseScript() {
  const lines = scriptInput.value.split("\n").map((l) => l.trim()).filter(Boolean);
  const cmds = [];
  for (const line of lines) {
    const [op, arg] = line.split(/\s+/);
    if (!["throttle", "wait", "stage", "pitch"].includes(op)) {
      throw new Error(`Unknown command: ${line}`);
    }
    if (op === "stage") {
      cmds.push({ op });
      continue;
    }
    const value = Number(arg);
    if (Number.isNaN(value)) throw new Error(`Bad numeric value in: ${line}`);
    cmds.push({ op, value });
  }
  return cmds;
}

function validateScript() {
  try {
    scriptCommands = parseScript();
    scriptStatus.textContent = `Script valid. ${scriptCommands.length} commands loaded.`;
  } catch (err) {
    scriptStatus.textContent = `Error: ${err.message}`;
  }
}

function currentEngine() {
  for (let i = rocket.length - 1; i >= 0; i -= 1) {
    if (rocket[i].type === "engine") return rocket[i];
  }
  return null;
}

function consumeFuel(amountTons) {
  for (let i = rocket.length - 1; i >= 0; i -= 1) {
    if (rocket[i].type !== "tank") continue;
    const used = Math.min(rocket[i].fuelMass, amountTons);
    rocket[i].fuelMass -= used;
    amountTons -= used;
    if (amountTons <= 0) break;
  }
}

function totalFuel() {
  return rocket.filter((p) => p.type === "tank").reduce((n, p) => n + p.fuelMass, 0);
}

function stage() {
  if (rocket.length > 1) rocket.pop();
}

function startFlight() {
  validateScript();
  const planet = planets[planetSelect.value];
  const m = massSummary();
  flight = {
    planet,
    t: 0,
    x: 0,
    y: planet.radius,
    vx: 0,
    vy: 0,
    throttle: 0,
    pitch: 90,
    cmdIndex: 0,
    cmdTimer: 0,
    running: true,
    trajectory: []
  };
  paused = false;
  camera.x = 0;
  camera.y = planet.radius;
  camera.zoom = 0.00003;

  if (!scriptCommands.length) {
    scriptStatus.textContent = "No valid script. Fix script before launching.";
    flight.running = false;
  }

  renderRocketStats();
}

function runAutopilot(dt) {
  if (!flight || !flight.running) return;
  if (flight.cmdIndex >= scriptCommands.length) return;
  if (flight.cmdTimer > 0) {
    flight.cmdTimer -= dt;
    return;
  }

  const cmd = scriptCommands[flight.cmdIndex];
  flight.cmdIndex += 1;

  if (cmd.op === "throttle") flight.throttle = Math.min(1, Math.max(0, cmd.value));
  if (cmd.op === "pitch") flight.pitch = Math.min(180, Math.max(0, cmd.value));
  if (cmd.op === "wait") flight.cmdTimer = Math.max(0, cmd.value);
  if (cmd.op === "stage") stage();
}

function stepPhysics(dt) {
  if (!flight || !flight.running) return;

  runAutopilot(dt);

  const distance = Math.hypot(flight.x, flight.y);
  const altitude = distance - flight.planet.radius;

  const gravityAcc = (G * flight.planet.mass) / (distance * distance);
  const gx = -gravityAcc * (flight.x / distance);
  const gy = -gravityAcc * (flight.y / distance);

  const engine = currentEngine();
  const fuel = totalFuel();
  const massKg = massSummary().total * 1000;

  let thrustAccX = 0;
  let thrustAccY = 0;
  if (engine && fuel > 0 && flight.throttle > 0) {
    const thrustN = engine.thrust * 1000 * flight.throttle;
    const pitchRad = (flight.pitch * Math.PI) / 180;
    thrustAccX = (Math.cos(pitchRad) * thrustN) / massKg;
    thrustAccY = (Math.sin(pitchRad) * thrustN) / massKg;
    consumeFuel(0.025 * flight.throttle * dt);
  }

  let dragX = 0;
  let dragY = 0;
  if (altitude < flight.planet.atmosphere) {
    const density = 1 - altitude / Math.max(1, flight.planet.atmosphere);
    dragX = -flight.vx * 0.015 * density;
    dragY = -flight.vy * 0.015 * density;
  }

  flight.vx += (gx + thrustAccX + dragX) * dt;
  flight.vy += (gy + thrustAccY + dragY) * dt;
  flight.x += flight.vx * dt;
  flight.y += flight.vy * dt;
  flight.t += dt;
  flight.trajectory.push({ x: flight.x, y: flight.y });
  if (flight.trajectory.length > 700) flight.trajectory.shift();

  if (Math.hypot(flight.x, flight.y) <= flight.planet.radius) {
    flight.running = false;
    flightStats.innerHTML += "<br><b>Impact detected.</b>";
  }
}

function drawFlight() {
  fctx.clearRect(0, 0, flightCanvas.width, flightCanvas.height);
  fctx.fillStyle = "#020713";
  fctx.fillRect(0, 0, flightCanvas.width, flightCanvas.height);

  if (!flight) return;

  const planet = flight.planet;
  if (followRocket) {
    camera.x = flight.x;
    camera.y = flight.y;
  }
  const toScreenX = (worldX) => (flightCanvas.width / 2) + (worldX - camera.x) * camera.zoom;
  const toScreenY = (worldY) => (flightCanvas.height / 2) - (worldY - camera.y) * camera.zoom;

  const pr = planet.radius * camera.zoom;
  fctx.fillStyle = planet.color;
  fctx.beginPath();
  fctx.arc(toScreenX(0), toScreenY(0), pr, 0, Math.PI * 2);
  const scale = 0.00003;
  const centerX = flightCanvas.width * 0.25;
  const centerY = flightCanvas.height * 0.5;

  const pr = planet.radius * scale;
  fctx.fillStyle = planet.color;
  fctx.beginPath();
  fctx.arc(centerX, centerY, pr, 0, Math.PI * 2);
  fctx.fill();

  fctx.strokeStyle = "#88ddff";
  fctx.beginPath();
  flight.trajectory.forEach((p, i) => {
    const px = toScreenX(p.x);
    const py = toScreenY(p.y);
    const px = centerX + p.x * scale;
    const py = centerY - p.y * scale;
    if (i === 0) fctx.moveTo(px, py);
    else fctx.lineTo(px, py);
  });
  fctx.stroke();

  const rx = toScreenX(flight.x);
  const ry = toScreenY(flight.y);
  const rx = centerX + flight.x * scale;
  const ry = centerY - flight.y * scale;
  fctx.fillStyle = "#ffffff";
  fctx.beginPath();
  fctx.arc(rx, ry, 4, 0, Math.PI * 2);
  fctx.fill();

  const altitude = Math.hypot(flight.x, flight.y) - planet.radius;
  const speed = Math.hypot(flight.vx, flight.vy);
  flightStats.innerHTML = `Time: <b>${flight.t.toFixed(1)} s</b> | Altitude: <b>${Math.max(0, altitude).toFixed(0)} m</b> | Speed: <b>${speed.toFixed(1)} m/s</b> | Fuel: <b>${totalFuel().toFixed(2)} t</b> | Throttle: <b>${(flight.throttle * 100).toFixed(0)}%</b> | Pitch: <b>${flight.pitch.toFixed(0)}°</b> | Zoom: <b>${camera.zoom.toExponential(2)}</b> | ${paused ? "<b>Paused</b>" : "<b>Running</b>"}`;
}

function tick() {
  const now = performance.now();
  const realDt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  if (!paused) stepPhysics(realDt * timeScale);
  flightStats.innerHTML = `Time: <b>${flight.t.toFixed(1)} s</b> | Altitude: <b>${Math.max(0, altitude).toFixed(0)} m</b> | Speed: <b>${speed.toFixed(1)} m/s</b> | Fuel: <b>${totalFuel().toFixed(2)} t</b> | Throttle: <b>${(flight.throttle * 100).toFixed(0)}%</b> | Pitch: <b>${flight.pitch.toFixed(0)}°</b>`;
}

function tick() {
  stepPhysics(1 / 60);
  drawFlight();
  drawVab();
  renderRocketStats();
  requestAnimationFrame(tick);
}

function setupTabs() {
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
      panels.forEach((panel) => panel.classList.toggle("active", panel.id === activeTab));
    });
  });
}

function setupControls() {
  document.getElementById("addTank").addEventListener("click", () => rocket.push(structuredClone(partsCatalog.tank)));
  document.getElementById("addEngine").addEventListener("click", () => rocket.push(structuredClone(partsCatalog.engine)));
  document.getElementById("addProbe").addEventListener("click", () => rocket.unshift(structuredClone(partsCatalog.probe)));
  document.getElementById("removePart").addEventListener("click", () => { if (rocket.length > 1) rocket.pop(); });
  document.getElementById("clearRocket").addEventListener("click", () => {
    rocket.splice(0, rocket.length, structuredClone(partsCatalog.probe), structuredClone(partsCatalog.tank), structuredClone(partsCatalog.engine));
  });
  document.getElementById("validateScript").addEventListener("click", validateScript);
  document.getElementById("launchBtn").addEventListener("click", startFlight);
  document.getElementById("resetFlight").addEventListener("click", () => {
    flight = null;
    flightStats.textContent = "Flight reset.";
    paused = false;
  });
  document.getElementById("toggleFollow").addEventListener("click", (e) => {
    followRocket = !followRocket;
    e.target.textContent = `Follow Rocket: ${followRocket ? "On" : "Off"}`;
  });
  document.getElementById("pauseFlight").addEventListener("click", (e) => {
    paused = !paused;
    e.target.textContent = paused ? "Resume" : "Pause";
  });

  Object.keys(planets).forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = `${name} (g0 ${(G * planets[name].mass / (planets[name].radius ** 2)).toFixed(2)} m/s²)`;
    planetSelect.appendChild(option);
  });
  planetSelect.value = "Earth";

  flightCanvas.addEventListener("mousedown", (ev) => {
    camera.dragging = true;
    camera.dragStartX = ev.clientX;
    camera.dragStartY = ev.clientY;
    camera.startCamX = camera.x;
    camera.startCamY = camera.y;
    followRocket = false;
    document.getElementById("toggleFollow").textContent = "Follow Rocket: Off";
  });
  window.addEventListener("mouseup", () => {
    camera.dragging = false;
  });
  window.addEventListener("mousemove", (ev) => {
    if (!camera.dragging) return;
    const dx = ev.clientX - camera.dragStartX;
    const dy = ev.clientY - camera.dragStartY;
    camera.x = camera.startCamX - (dx / camera.zoom);
    camera.y = camera.startCamY + (dy / camera.zoom);
  });
  flightCanvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const multiplier = ev.deltaY > 0 ? 0.9 : 1.1;
    camera.zoom = Math.min(0.0009, Math.max(0.0000012, camera.zoom * multiplier));
  }, { passive: false });
  flightCanvas.addEventListener("dblclick", () => {
    if (!flight) return;
    camera.x = flight.x;
    camera.y = flight.y;
  });
}

setupTabs();
setupControls();
validateScript();
tick();

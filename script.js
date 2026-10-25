/* ============ SkyCast — app.js ============ */
'use strict';

const WMO = {
  0:["Clear sky","☀️","sun"],1:["Mainly clear","🌤️","sun"],2:["Partly cloudy","⛅","cloud"],3:["Overcast","☁️","cloud"],
  45:["Fog","🌫️","fog"],48:["Rime fog","🌫️","fog"],
  51:["Light drizzle","🌦️","rain"],53:["Drizzle","🌦️","rain"],55:["Heavy drizzle","🌧️","rain"],
  61:["Light rain","🌦️","rain"],63:["Rain","🌧️","rain"],65:["Heavy rain","🌧️","rain"],
  66:["Freezing rain","🌧️","rain"],67:["Freezing rain","🌧️","rain"],
  71:["Light snow","🌨️","snow"],73:["Snow","🌨️","snow"],75:["Heavy snow","❄️","snow"],77:["Snow grains","🌨️","snow"],
  80:["Light showers","🌦️","rain"],81:["Showers","🌧️","rain"],82:["Violent showers","⛈️","storm"],
  85:["Snow showers","🌨️","snow"],86:["Snow showers","❄️","snow"],
  95:["Thunderstorm","⛈️","storm"],96:["Thunderstorm + hail","⛈️","storm"],99:["Thunderstorm + hail","⛈️","storm"]
};

let isFahrenheit = false, lastLat = null, lastLon = null, lastName = "";
let fx = null; // particle engine

const $ = id => document.getElementById(id);
const deg = c => isFahrenheit ? c * 9/5 + 32 : c;
const unit = () => isFahrenheit ? "°F" : "°C";

/* ================= GEOCODING & FETCH ================= */
async function searchCity() {
  const q = $("cityInput").value.trim();
  if (!q) return;
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en`);
    const d = await r.json();
    if (!d.results?.length) return showError("City not found.");
    const s = $("suggestions");
    s.innerHTML = d.results.map((c,i)=>`<div onclick="pickCity(${i})">${c.name}${c.country?", "+c.country:""}</div>`).join("");
    s.dataset.results = JSON.stringify(d.results);
    s.style.display = "block";
  } catch { showError("Search failed. Check your connection."); }
}
function pickCity(i){
  const c = JSON.parse($("suggestions").dataset.results)[i];
  $("suggestions").style.display = "none";
  fetchWeather(c.latitude, c.longitude, `${c.name}${c.country?", "+c.country:""}`);
}
$("cityInput").addEventListener("keydown", e => { if (e.key === "Enter") searchCity(); });

function useLocation(){
  if (!navigator.geolocation) return showError("Geolocation not supported.");
  navigator.geolocation.getCurrentPosition(
    p => fetchWeather(p.coords.latitude, p.coords.longitude, "Your Location"),
    () => showError("Location permission denied."));
}

async function fetchWeather(lat, lon, name){
  lastLat = lat; lastLon = lon; lastName = name;
  $("error").style.display = "none";
  $("content").innerHTML = `<div class="loading">Loading weather…</div>`;
  try {
    const params = new URLSearchParams({
      latitude: lat, longitude: lon,
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,pressure_msl",
      hourly: "temperature_2m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone: "auto", forecast_days: 7,
      temperature_unit: isFahrenheit ? "fahrenheit" : "celsius"
    });
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!r.ok) throw new Error();
    render(await r.json(), name);
  } catch { showError("Failed to load weather data."); }
}

$("unitBtn").onclick = () => {
  isFahrenheit = !isFahrenheit;
  if (lastLat !== null) fetchWeather(lastLat, lastLon, lastName);
};

/* ================= RENDER ================= */
function render(d, name){
  const c = d.current;
  const [desc, icon, anim] = WMO[c.weather_code] || ["Unknown","❓","cloud"];
  document.body.className = c.is_day ? "day" : "night";
  spawnBackgroundClouds();
  FXEngine.set(c.weather_code, c.is_day === 1);

  const now = new Date();
  const hourly = d.hourly.time.map((t,i)=>({t:new Date(t), temp:d.hourly.temperature_2m[i]}))
    .filter(h=>h.t>=now).slice(0,24);

  $("content").innerHTML = `
    <div class="card current">
      <div class="city">${name}</div>
      <div class="temp" id="bigTemp">0${unit()}</div>
      <div class="big-icon ${anim}">${icon}</div>
      <div class="desc">${desc}</div>
      <div class="meta">
        <span>🌡️ Feels like ${Math.round(deg(c.apparent_temperature))}${unit()}</span>
        <span>💧 ${c.relative_humidity_2m}%</span>
        <span>💨 ${c.wind_speed_10m} km/h</span>
        <span>📊 ${Math.round(c.pressure_msl)} hPa</span>
      </div>
    </div>
    <div class="card chart-card"><h3>Next 24 hours</h3><canvas id="chart" class="chart"></canvas></div>
    <div class="card forecast"><h3>7-Day Forecast</h3><div class="days">
      ${d.daily.time.map((t,i)=>{
        const [,di] = WMO[d.daily.weather_code[i]] || ["","❓"];
        return `<div class="day-card">
          <div>${new Date(t).toLocaleDateString(undefined,{weekday:'short'})}</div>
          <div class="d-icon">${di}</div>
          <div class="d-temps"><b>${Math.round(deg(d.daily.temperature_2m_max[i]))}°</b> / ${Math.round(deg(d.daily.temperature_2m_min[i]))}°</div>
          <div class="d-temps" style="opacity:.8">💧${d.daily.precipitation_probability_max[i] ?? 0}%</div>
        </div>`;
      }).join("")}
    </div></div>`;

  animateTemp(deg(c.temperature_2m));
  drawChart(hourly);
}

/* Count-up animation for the big temperature */
function animateTemp(target){
  const el = $("bigTemp"), dur = 900, start = performance.now();
  (function step(now){
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased) + unit();
    if (p < 1) requestAnimationFrame(step);
  })(start);
}

/* Line chart for hourly temps */
function drawChart(data){
  const cv = $("chart"), ctx = cv.getContext("2d");
  const W = cv.width = cv.offsetWidth * 2, H = cv.height = 260, pad = 34;
  const temps = data.map(h=>h.temp);
  const min = Math.min(...temps), max = Math.max(...temps), range = (max-min)||1;
  const x = i => pad + i*(W-2*pad)/(data.length-1);
  const y = t => H-pad-((t-min)/range)*(H-2*pad);

  // gradient fill under the line
  const grad = ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0, "rgba(255,159,67,.45)");
  grad.addColorStop(1, "rgba(255,159,67,0)");
  ctx.beginPath();
  data.forEach((h,i)=> i ? ctx.lineTo(x(i),y(h.temp)) : ctx.moveTo(x(i),y(h.temp)));
  ctx.lineTo(x(data.length-1), H-pad); ctx.lineTo(x(0), H-pad); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.lineWidth = 5; ctx.strokeStyle = "#ff9f43"; ctx.lineJoin = "round";
  ctx.beginPath();
  data.forEach((h,i)=> i ? ctx.lineTo(x(i),y(h.temp)) : ctx.moveTo(x(i),y(h.temp)));
  ctx.stroke();

  ctx.fillStyle = document.body.className === "day" ? "#16324a" : "#eaf2ff";
  ctx.font = "22px system-ui"; ctx.textAlign = "center";
  data.forEach((h,i)=>{
    if (i%4===0){
      ctx.fillText(Math.round(deg(h.temp))+"°", x(i), y(h.temp)-16);
      ctx.fillText(h.t.getHours()+":00", x(i), H-10);
    }
  });
}

function showError(msg){
  const e = $("error");
  e.textContent = msg; e.style.display = "block";
  e.style.animation = "none"; void e.offsetWidth; e.style.animation = ""; // retrigger shake
}

/* Decorative CSS clouds drifting across the sky */
function spawnBackgroundClouds(){
  const layer = $("cloudLayer");
  layer.innerHTML = "";
  const n = document.body.className === "day" ? 5 : 3;
  for (let i=0;i<n;i++){
    const cl = document.createElement("div");
    cl.className = "cloud";
    const scale = .6 + Math.random()*.9;
    cl.style.top = (Math.random()*55) + "%";
    cl.style.transform = `scale(${scale})`;
    cl.style.opacity = (.35 + Math.random()*.35).toFixed(2);
    cl.style.animationDuration = (60 + Math.random()*70) + "s";
    cl.style.animationDelay = (-Math.random()*80) + "s";
    layer.appendChild(cl);
  }
}
spawnBackgroundClouds();

/* ================= PARTICLE FX ENGINE (canvas) ================= */
const FXEngine = (() => {
  const cv = $("fx-canvas"), ctx = cv.getContext("2d");
  let mode = "none", isDay = true, particles = [], flashes = 0;

  function resize(){
    cv.width = innerWidth; cv.height = innerHeight;
  }
  addEventListener("resize", resize); resize();

  function set(code, day){
    isDay = day;
    particles = [];
    if ([0,1].includes(code))          mode = day ? "sun" : "stars";
    else if ([2,3].includes(code))     mode = "cloudy";
    else if ([45,48].includes(code))   mode = "fog";
    else if ([71,73,75,77,85,86].includes(code)) mode = "snow";
    else if ([95,96,99].includes(code)) mode = "storm";
    else if ([51,53,55,61,63,65,66,67,80,81,82].includes(code)) mode = "rain";
    else mode = "none";

    const count = {rain:160, snow:140, storm:200, stars:90, cloudy:6, fog:10, sun:1, none:0}[mode];
    for (let i=0;i<count;i++) particles.push(spawn(true));
  }

  function spawn(anywhere){
    const W = cv.width, H = cv.height;
    switch(mode){
      case "rain": case "storm":
        return {x:Math.random()*W, y:anywhere?Math.random()*H:-20,
                len:12+Math.random()*18, spd:9+Math.random()*8};
      case "snow":
        return {x:Math.random()*W, y:anywhere?Math.random()*H:-10,
                r:1.5+Math.random()*3, spd:.6+Math.random()*1.4, ph:Math.random()*6.28};
      case "stars":
        return {x:Math.random()*W, y:Math.random()*H*.7,
                r:.5+Math.random()*1.5, ph:Math.random()*6.28, spd:.5+Math.random()*1.5};
      case "cloudy":
        return {x:Math.random()*W, y:Math.random()*H*.5, w:180+Math.random()*160,
                h:45+Math.random()*30, spd:.15+Math.random()*.3, o:.06+Math.random()*.08};
      case "fog":
        return {x:Math.random()*W, y:Math.random()*H, r:120+Math.random()*160,
                spd:.2+Math.random()*.4, o:.04+Math.random()*.05};
      case "sun":
        return {x:W*.8, y:H*.18, r:70, ph:0};
    }
  }

  function tick(t){
    ctx.clearRect(0,0,cv.width,cv.height);
    const W = cv.width, H = cv.height;

    if (mode === "sun"){
      const s = particles[0]; if (!s) return requestAnimationFrame(tick);
      const pulse = 8*Math.sin(t/700);
      const g = ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,s.r*3+pulse);
      g.addColorStop(0,"rgba(255,220,90,.9)"); g.addColorStop(.3,"rgba(255,190,60,.35)"); g.addColorStop(1,"rgba(255,190,60,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r*3+pulse,0,6.28); ctx.fill();
    }
    if (mode === "stars"){
      for (const p of particles){
        const a = .3 + .7*Math.abs(Math.sin(t/1000*p.spd + p.ph));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.28); ctx.fill();
      }
    }
    if (mode === "cloudy"){
      ctx.fillStyle = isDay ? "rgba(255,255,255,.5)" : "rgba(190,205,240,.15)";
      for (const p of particles){
        p.x += p.spd; if (p.x - p.w > W) p.x = -p.w;
        ctx.globalAlpha = p.o*4;
        ctx.beginPath(); ctx.ellipse(p.x,p.y,p.w,p.h,0,0,6.28); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (mode === "fog"){
      for (const p of particles){
        p.x += p.spd; if (p.x - p.r > W) p.x = -p.r;
        const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
        g.addColorStop(0,`rgba(220,228,240,${p.o})`); g.addColorStop(1,"rgba(220,228,240,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.28); ctx.fill();
      }
    }
    if (mode === "rain" || mode === "storm"){
      ctx.strokeStyle = isDay ? "rgba(120,170,255,.55)" : "rgba(150,190,255,.45)";
      ctx.lineWidth = 2; ctx.beginPath();
      for (const p of particles){
        p.y += p.spd; p.x -= p.spd*.18;
        if (p.y > H){ Object.assign(p, spawn(false)); }
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.len*.18, p.y - p.len);
      }
      ctx.stroke();
      if (mode === "storm"){
        if (Math.random() < .006){
          ctx.fillStyle = `rgba(255,255,255,${.5+Math.random()*.4})`;
          ctx.fillRect(0,0,W,H);
        }
      }
    }
    if (mode === "snow"){
      ctx.fillStyle = "rgba(255,255,255,.85)";
      for (const p of particles){
        p.ph += .02; p.y += p.spd; p.x += Math.sin(p.ph)*.8;
        if (p.y > H){ Object.assign(p, spawn(false)); }
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.28); ctx.fill();
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return { set };
})();

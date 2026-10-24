'use strict';
/* ===== Helpers, storage, preferences ===== */
const $ = s => document.querySelector(s);
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const P = { t: 'c', w: 'kmh', d: 'km', h24: false, theme: 'dark', ...LS.get('atmos-prefs', {}) };
const save = () => LS.set('atmos-prefs', P);

/* ===== Weather codes (Open-Meteo WMO) ===== */
const W = {};
[[[0], 'Clear sky', '☀️', 'clear'], [[1], 'Mostly clear', '🌤️', 'clear'], [[2], 'Partly cloudy', '⛅', 'cloud'],
 [[3], 'Overcast', '☁️', 'cloud'], [[45, 48], 'Fog', '🌫️', 'fog'], [[51, 53, 55], 'Drizzle', '🌦️', 'rain'],
 [[56, 57], 'Freezing drizzle', '🌧️', 'rain'], [[61, 63], 'Rain', '🌧️', 'rain'], [[65], 'Heavy rain', '🌧️', 'rain'],
 [[66, 67], 'Freezing rain', '🌧️', 'rain'], [[71, 73, 77], 'Snow', '🌨️', 'snow'], [[75], 'Heavy snow', '❄️', 'snow'],
 [[80, 81], 'Rain showers', '🌦️', 'rain'], [[82], 'Violent showers', '⛈️', 'rain'], [[85, 86], 'Snow showers', '🌨️', 'snow'],
 [[95], 'Thunderstorm', '⛈️', 'storm'], [[96, 99], 'Thunderstorm with hail', '⛈️', 'storm']]
  .forEach(([codes, label, icon, fx]) => codes.forEach(c => W[c] = [label, icon, fx]));
const wx = (code, night) => {
  const w = W[code] || ['Unknown', '🌡️', 'cloud'];
  return { l: w[0], i: night && w[2] === 'clear' ? '🌙' : w[1], f: w[2] };
};

/* ===== Unit conversion + formatting ===== */
const T = c => c == null ? null : Math.round(P.t === 'f' ? c * 9 / 5 + 32 : c);
const tx = c => c == null ? '—' : T(c) + '°';
const tu = () => '°' + P.t.toUpperCase();
const WS = k => P.w === 'mph' ? [k * 0.621371, 'mph'] : P.w === 'ms' ? [k / 3.6, 'm/s'] : [k, 'km/h'];
const DS = m => P.d === 'mi' ? [m / 1609.34, 'mi'] : [m / 1000, 'km'];
// API times are local wall-clock strings; read them as UTC so no device offset is applied.
const ft = (s, o) => new Intl.DateTimeFormat(undefined, { ...o, timeZone: 'UTC', hourCycle: P.h24 ? 'h23' : 'h12' })
  .format(new Date(s.length > 10 ? s + ':00Z' : s + 'T00:00:00Z'));
const hm = { hour: 'numeric', minute: '2-digit' };
const pct = (v, a, b) => v == null ? null : Math.max(0, Math.min(100, (v - a) / (b - a) * 100));
const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const uvl = u => u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high' : 'Extreme';
const pc = v => v == null ? '—' : v + '%';

/* ===== UI utilities ===== */
let tt;
function toast(m) {
  const t = $('#toast'); t.textContent = m; t.classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 3500);
}
function fx(kind, night) {
  const f = $('#fx'), key = kind + night;
  if (f.dataset.k === key) return;
  f.dataset.k = key; f.innerHTML = '';
  const rm = matchMedia('(prefers-reduced-motion:reduce)').matches, m = innerWidth < 700 ? 0.5 : 1, r = Math.random;
  const add = (c, n, s) => { for (let i = 0; i < n; i++) { const e = document.createElement('i'); e.className = c; e.style.cssText = s(i); f.append(e); } };
  const stars = n => rm || add('star', n * m, () => `left:${r() * 100}%;top:${r() * 70}%;animation-delay:${r() * 4}s`);
  if (kind === 'clear') { if (night) { add('moon', 1, () => ''); stars(50); } else add('sun', 1, () => ''); }
  if (kind !== 'clear' && kind !== 'snow')
    add('cloud', kind === 'cloud' ? 3 : 5, i => `top:${5 + i * 9}%;animation-delay:-${i * 12}s;animation-duration:${60 + i * 15}s;opacity:${kind === 'cloud' ? 0.5 : 0.75}`);
  if (night && kind === 'cloud') stars(20);
  if (rm) return;
  if (kind === 'rain' || kind === 'storm') add('drop', 70 * m, () => `left:${r() * 100}%;animation-delay:-${r()}s;animation-duration:${0.5 + r() * 0.4}s`);
  if (kind === 'snow') add('flake', 45 * m, () => { const s = 3 + r() * 5; return `left:${r() * 100}%;width:${s}px;height:${s}px;animation-delay:-${r() * 10}s;animation-duration:${7 + r() * 7}s`; });
  if (kind === 'storm') add('bolt', 1, () => '');
}

/* ===== State + data loading ===== */
let place, D, ts, stale = false, req = 0, ctl, pend;

function setLoading(on) {
  $('#sk').hidden = !(on && !D);
  $('#dash').style.opacity = on && D ? 0.55 : 1;
  if (on) { $('#empty').hidden = true; $('#err').hidden = true; }
}
function showErr(msg) {
  $('#errmsg').textContent = msg; $('#err').hidden = false; $('#empty').hidden = true;
  if (!D) $('#dash').hidden = true;
}
async function load(pl, force) {
  pend = pl; const id = ++req; ctl?.abort(); ctl = new AbortController();
  setLoading(true);
  const key = pl.lat.toFixed(2) + ',' + pl.lon.toFixed(2), cache = LS.get('atmos-cache', {}), c = cache[key];
  const done = (d, t, st) => { if (id !== req) return; place = pl; D = d; ts = t; stale = st; LS.set('atmos-last', pl); setLoading(false); render(); };
  if (!force && c && Date.now() - c.ts < 6e5) return done(c.d, c.ts, false);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${pl.lat}&longitude=${pl.lon}`
    + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m'
    + '&hourly=temperature_2m,precipitation_probability,weather_code,visibility,uv_index'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max'
    + '&timezone=auto&forecast_days=7';
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    if (id !== req) return;
    cache[key] = { ts: Date.now(), d };
    Object.keys(cache).sort((a, b) => cache[b].ts - cache[a].ts).slice(6).forEach(k => delete cache[k]);
    LS.set('atmos-cache', cache);
    done(d, Date.now(), false);
  } catch (e) {
    if (e.name === 'AbortError' || id !== req) return;
    setLoading(false);
    if (c) { done(c.d, c.ts, true); toast('Couldn’t reach the weather service. Showing saved data.'); }
    else showErr(navigator.onLine ? 'Couldn’t load the forecast. Try again.' : 'You’re offline. Reconnect to load the forecast.');
  }
}

/* ===== Rendering ===== */
function card(n, ic, t, v, s, p, wide) {
  return `<article class="glass card${wide ? ' wide' : ''}" style="--i:${n}"><h3>${ic} ${t}</h3><p class="big">${v}</p><p class="mu">${s}</p>${p == null ? '' : `<div class="pb"><i data-w="${p}"></i></div>`}</article>`;
}
function render() {
  if (!D) return;
  const c = D.current, H = D.hourly, Dl = D.daily;
  const i0 = Math.max(0, H.time.indexOf(c.time.slice(0, 13) + ':00'));
  const night = !c.is_day, w = wx(c.weather_code, night);
  const isN = t => { const k = Dl.time.indexOf(t.slice(0, 10)); return k < 0 || !Dl.sunrise[k] ? false : t < Dl.sunrise[k] || t > Dl.sunset[k]; };
  document.body.dataset.sky = night && (w.f === 'clear' || w.f === 'cloud') ? w.f + '-n' : w.f;
  fx(w.f, night);
  $('#dash').hidden = false; $('#empty').hidden = true; $('#err').hidden = true;

  /* Hero */
  const name = place.name + (place.country ? ', ' + place.country : '');
  document.title = `${tx(c.temperature_2m)} ${name} – Atmos`;
  $('#city').textContent = name;
  $('#when').textContent = `${ft(c.time, { weekday: 'long', month: 'short', day: 'numeric' })} · ${ft(c.time, hm)} local time`;
  $('#temp').innerHTML = `${T(c.temperature_2m) ?? '—'}<sup>${tu()}</sup>`;
  $('#ico').textContent = w.i; $('#cond').textContent = w.l;
  $('#sub').textContent = `Feels like ${tx(c.apparent_temperature)} · High ${tx(Dl.temperature_2m_max[0])} · Low ${tx(Dl.temperature_2m_min[0])}`;
  const next = H.precipitation_probability.slice(i0, i0 + 12).filter(v => v != null), mp = next.length ? Math.max(...next) : null, uv = H.uv_index[i0];
  $('#sum').textContent = [w.l + ' right now.',
    mp == null ? '' : mp >= 60 ? `Rain is likely (${mp}% chance) in the next 12 hours, so take an umbrella.` : mp >= 30 ? `There’s a ${mp}% chance of rain in the next 12 hours.` : 'No significant rain expected in the next 12 hours.',
    uv >= 6 && c.is_day ? 'UV is high. Wear sunscreen.' : ''].filter(Boolean).join(' ');

  /* Detail cards */
  const ws = c.wind_speed_10m == null ? null : WS(c.wind_speed_10m), vm = H.visibility[i0], vs = vm == null ? null : DS(vm);
  const pr = c.pressure_msl, rh = c.relative_humidity_2m, pp = H.precipitation_probability[i0], sr = Dl.sunrise[0], ss = Dl.sunset[0];
  const dayp = sr && ss ? pct(Date.parse(c.time + ':00Z'), Date.parse(sr + ':00Z'), Date.parse(ss + ':00Z')) : null;
  const wd = c.wind_direction_10m;
  $('#det').innerHTML =
    card(0, '💧', 'Humidity', pc(rh), 'Relative humidity', rh)
    + card(1, '🌬️', 'Wind', ws ? `${Math.round(ws[0])} ${ws[1]}` : '—', wd == null ? 'Direction unavailable' : `<span style="display:inline-block;transform:rotate(${wd + 180}deg)">↑</span> from ${dirs[Math.round(wd / 22.5) % 16]}`, ws ? pct(c.wind_speed_10m, 0, 60) : null)
    + card(2, '👁️', 'Visibility', vs ? `${vs[0] >= 10 ? Math.round(vs[0]) : vs[0].toFixed(1)} ${vs[1]}` : '—', vs ? 'Horizontal range' : 'Not available', vs ? pct(vm, 0, 10000) : null)
    + card(3, '🧭', 'Pressure', pr == null ? '—' : Math.round(pr) + ' hPa', 'Sea level', pct(pr, 960, 1060))
    + card(4, '🕶️', 'UV index', uv == null ? '—' : uv.toFixed(1), uv == null ? 'Not available' : uvl(uv), pct(uv, 0, 11))
    + card(5, '☔', 'Rain chance', pc(pp), 'This hour', pp)
    + card(6, '🌅', 'Sun', `${sr ? ft(sr, hm) : '—'} → ${ss ? ft(ss, hm) : '—'}`, 'Sunrise → sunset', dayp, true);

  /* Hourly list + SVG trend chart */
  const idx = []; for (let k = 0; k < 24 && i0 + k < H.time.length; k++) idx.push(i0 + k);
  $('#hrs').innerHTML = idx.map((j, k) => {
    const t = H.time[j], x = wx(H.weather_code[j], isN(t));
    return `<li class="${k ? '' : 'now'}"><span>${k ? ft(t, { hour: 'numeric' }) : 'Now'}</span><em>${x.i}</em><b>${tx(H.temperature_2m[j])}</b><small>💧${pc(H.precipitation_probability[j])}</small></li>`;
  }).join('');
  const vals = idx.map(j => T(H.temperature_2m[j]));
  $('#ch').hidden = vals.includes(null);
  if (!vals.includes(null)) chart(vals, idx.map(j => H.time[j]));

  /* 7-day forecast */
  const lo = Math.min(...Dl.temperature_2m_min), hi = Math.max(...Dl.temperature_2m_max), span = (hi - lo) || 1;
  $('#days').innerHTML = Dl.time.map((d, k) => {
    const x = wx(Dl.weather_code[k]), a = Dl.temperature_2m_min[k], b = Dl.temperature_2m_max[k], p = Dl.precipitation_probability_max[k];
    const wsd = Dl.wind_speed_10m_max[k] == null ? null : WS(Dl.wind_speed_10m_max[k]), u = Dl.uv_index_max[k];
    const tm = s => s ? ft(s, hm) : '—';
    return `<li><button class="row" aria-expanded="false" aria-controls="m${k}"><span class="dn"><b>${k ? ft(d, { weekday: 'short' }) : 'Today'}</b><small>${ft(d, { month: 'short', day: 'numeric' })}</small></span><em>${x.i}</em><span class="dc">${x.l}<small>💧${pc(p)}</small></span><span class="rng"><u>${tx(a)}</u><span class="trk"><i data-l="${(a - lo) / span * 100}" data-w="${Math.max((b - a) / span * 100, 6)}"></i></span><u>${tx(b)}</u></span></button>`
      + `<div class="more" id="m${k}" hidden><span><small>Sunrise</small>${tm(Dl.sunrise[k])}</span><span><small>Sunset</small>${tm(Dl.sunset[k])}</span><span><small>UV max</small>${u == null ? '—' : u.toFixed(1)}</span><span><small>Rain total</small>${Dl.precipitation_sum[k] == null ? '—' : Dl.precipitation_sum[k] + ' mm'}</span><span><small>Max wind</small>${wsd ? Math.round(wsd[0]) + ' ' + wsd[1] : '—'}</span></div></li>`;
  }).join('');

  $('#stat').textContent = (stale ? 'Offline · showing saved data from ' : 'Updated ') + new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hourCycle: P.h24 ? 'h23' : 'h12' }) + ' · Open-Meteo';
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll('[data-w]').forEach(e => {
    e.style.width = e.dataset.w + '%'; if (e.dataset.l) e.style.left = e.dataset.l + '%';
  })));
}
function chart(v, times) {
  const n = v.length, cw = n * 72, h = 110, p = 14, mn = Math.min(...v), mx = Math.max(...v);
  const y = a => p + (1 - (a - mn) / ((mx - mn) || 1)) * (h - 2 * p), x = k => k * 72 + 36;
  let d = `M${x(0)},${y(v[0])}`;
  for (let k = 1; k < n; k++) { const m = (x(k - 1) + x(k)) / 2; d += `C${m},${y(v[k - 1])} ${m},${y(v[k])} ${x(k)},${y(v[k])}`; }
  const s = $('#ch'), tip = $('#tip');
  s.setAttribute('viewBox', `0 0 ${cw} ${h}`); s.setAttribute('width', cw); s.setAttribute('height', h);
  s.innerHTML = `<defs><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--ac)" stop-opacity=".35"/><stop offset="1" stop-color="var(--ac)" stop-opacity="0"/></linearGradient></defs>`
    + `<path d="${d}L${x(n - 1)},${h}L${x(0)},${h}Z" fill="url(#gr)"/><path d="${d}" fill="none" stroke="var(--ac)" stroke-width="3" stroke-linecap="round"/>`
    + `<circle id="dot" cx="${x(0)}" cy="${y(v[0])}" r="6" fill="#fff" stroke="var(--ac)" stroke-width="3"/>`;
  const show = e => {
    const k = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - s.getBoundingClientRect().left) / 72)));
    $('#dot').setAttribute('cx', x(k)); $('#dot').setAttribute('cy', y(v[k]));
    tip.hidden = false; tip.style.left = Math.max(60, Math.min(cw - 60, x(k))) + 'px';
    tip.textContent = `${ft(times[k], hm)} · ${v[k]}${tu()}`;
  };
  s.onpointermove = s.onpointerdown = show; s.onpointerleave = () => tip.hidden = true;
}

/* ===== Search (debounced, stale-safe) ===== */
let sid = 0, sctl, items = [], act = -1, tm;
const q = $('#q'), sug = $('#sug');
function showSug(list, msg) {
  items = list; act = -1;
  sug.innerHTML = (msg ? `<li class="msg">${msg}</li>` : '') + list.map((p, i) =>
    `<li role="option" id="o${i}" data-i="${i}">${esc(p.name)}<small>${esc([p.admin, p.country].filter(Boolean).join(', '))}</small></li>`).join('');
  sug.hidden = !sug.innerHTML; q.setAttribute('aria-expanded', !sug.hidden);
}
const closeSug = () => { sug.hidden = true; q.setAttribute('aria-expanded', 'false'); };
function showRecent() {
  const r = LS.get('atmos-recent', []);
  showSug(r, r.length ? 'Recent searches <button id="clrs" type="button">Clear</button>' : '');
}
async function search(v) {
  const id = ++sid; sctl?.abort(); sctl = new AbortController();
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(v)}&count=6&language=en&format=json`, { signal: sctl.signal });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    if (id !== sid) return;
    showSug((j.results || []).map(p => ({ name: p.name, admin: p.admin1, country: p.country, lat: p.latitude, lon: p.longitude })), j.results ? '' : 'No matching cities');
  } catch (e) { if (e.name !== 'AbortError' && id === sid) showSug([], 'Search failed. Check your connection and try again.'); }
}
function pick(p) {
  if (!p) return;
  closeSug(); q.value = ''; q.blur();
  const r = LS.get('atmos-recent', []).filter(x => x.lat !== p.lat || x.lon !== p.lon);
  LS.set('atmos-recent', [p, ...r].slice(0, 5));
  load({ name: p.name, country: p.country, lat: p.lat, lon: p.lon });
}
q.oninput = () => { clearTimeout(tm); const v = q.value.trim(); if (v.length < 2) { sid++; showRecent(); return; } tm = setTimeout(() => search(v), 300); };
q.onfocus = () => { if (q.value.trim().length < 2) showRecent(); };
q.onkeydown = e => {
  if (e.key === 'Escape') return closeSug();
  if (e.key === 'Enter') { e.preventDefault(); if (items.length) pick(items[act >= 0 ? act : 0]); return; }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' || !items.length) return;
  e.preventDefault(); act = (act + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  sug.querySelectorAll('[role=option]').forEach((li, i) => li.classList.toggle('on', i === act));
  q.setAttribute('aria-activedescendant', 'o' + act);
};
sug.onclick = e => {
  const li = e.target.closest('[data-i]');
  if (li) pick(items[li.dataset.i]);
  if (e.target.id === 'clrs') { LS.set('atmos-recent', []); closeSug(); toast('Recent searches cleared'); }
};
document.addEventListener('click', e => { if (!e.target.closest('.search')) closeSug(); });

/* ===== Controls ===== */
$('#geo').onclick = () => {
  if (!navigator.geolocation) return toast('Location isn’t supported here. Search for a city instead.');
  toast('Finding your location…');
  navigator.geolocation.getCurrentPosition(
    p => load({ name: 'Current location', country: '', lat: p.coords.latitude, lon: p.coords.longitude }),
    e => toast(e.code === 1 ? 'Location access was denied. Search for a city instead.' : 'Couldn’t get your location. Search for a city instead.'),
    { timeout: 10000, maximumAge: 3e5 });
};
function applyPrefs() {
  document.documentElement.dataset.theme = P.theme;
  $('#theme').textContent = P.theme === 'dark' ? '☀️' : '🌙';
  $('#unit').textContent = tu(); $('#sw').value = P.w; $('#sd').value = P.d; $('#sc').value = P.h24 ? '24' : '12';
}
$('#unit').onclick = () => { P.t = P.t === 'c' ? 'f' : 'c'; save(); applyPrefs(); render(); };
$('#theme').onclick = () => { P.theme = P.theme === 'dark' ? 'light' : 'dark'; save(); applyPrefs(); };
$('#cfg').onclick = () => $('#dlg').showModal();
$('#sw').onchange = e => { P.w = e.target.value; save(); render(); };
$('#sd').onchange = e => { P.d = e.target.value; save(); render(); };
$('#sc').onchange = e => { P.h24 = e.target.value === '24'; save(); render(); };
$('#clr').onclick = () => { LS.set('atmos-recent', []); toast('Recent searches cleared'); };
$('#ref').onclick = () => place && load(place, true);
$('#retry').onclick = () => pend && load(pend, true);
$('#days').onclick = e => {
  const b = e.target.closest('.row'); if (!b) return;
  const open = b.getAttribute('aria-expanded') === 'true';
  b.setAttribute('aria-expanded', !open); b.nextElementSibling.hidden = open;
};
addEventListener('online', () => place && load(place, true));
addEventListener('offline', () => toast('You’re offline. Showing the last saved forecast.'));

/* ===== Start ===== */
applyPrefs();
const last = LS.get('atmos-last', null);
if (last) load(last);

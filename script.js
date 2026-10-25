// ----- DOM Elements -----
const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const errorMessage = document.getElementById('errorMessage');
const loading = document.getElementById('loading');
const weatherContent = document.getElementById('weatherContent');

const locationName = document.getElementById('locationName');
const locationDetail = document.getElementById('locationDetail');
const currentIcon = document.getElementById('currentIcon');
const currentTemp = document.getElementById('currentTemp');
const currentDesc = document.getElementById('currentDesc');
const currentMeta = document.getElementById('currentMeta');
const hourlyForecast = document.getElementById('hourlyForecast');
const dailyForecast = document.getElementById('dailyForecast');

// ----- Weather Code Mapping -----
// Based on WMO Weather interpretation codes used by Open-Meteo.
const weatherCodeMap = {
    0: { desc: 'Clear sky', icon: '☀️' },
    1: { desc: 'Mainly clear', icon: '🌤️' },
    2: { desc: 'Partly cloudy', icon: '⛅' },
    3: { desc: 'Overcast', icon: '☁️' },
    45: { desc: 'Fog', icon: '🌫️' },
    48: { desc: 'Depositing rime fog', icon: '🌫️' },
    51: { desc: 'Light drizzle', icon: '🌦️' },
    53: { desc: 'Moderate drizzle', icon: '🌦️' },
    55: { desc: 'Dense drizzle', icon: '🌧️' },
    61: { desc: 'Slight rain', icon: '🌦️' },
    63: { desc: 'Moderate rain', icon: '🌧️' },
    65: { desc: 'Heavy rain', icon: '🌧️' },
    71: { desc: 'Slight snow', icon: '🌨️' },
    73: { desc: 'Moderate snow', icon: '🌨️' },
    75: { desc: 'Heavy snow', icon: '❄️' },
    80: { desc: 'Slight rain showers', icon: '🌦️' },
    81: { desc: 'Moderate rain showers', icon: '🌧️' },
    82: { desc: 'Violent rain showers', icon: '⛈️' },
    95: { desc: 'Thunderstorm', icon: '⛈️' },
    96: { desc: 'Thunderstorm with hail', icon: '⛈️' },
    99: { desc: 'Thunderstorm with heavy hail', icon: '⛈️' },
};

function getWeatherInfo(code) {
    return weatherCodeMap[code] || { desc: 'Unknown', icon: '❓' };
}

// ----- Helper: Show/Hide States -----
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('visible');
    weatherContent.classList.add('hidden');
    loading.classList.remove('visible');
}

function clearError() {
    errorMessage.classList.remove('visible');
}

function showLoading() {
    loading.classList.add('visible');
    weatherContent.classList.add('hidden');
    clearError();
}

function hideLoading() {
    loading.classList.remove('visible');
}

// ----- Format Date/Time -----
function formatHour(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDay(isoString) {
    const date = new Date(isoString + 'T00:00:00'); // avoid timezone shift
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

// ----- Main Fetch Logic -----
async function fetchWeather(city) {
    if (!city.trim()) {
        showError('Please enter a city name.');
        return;
    }

    showLoading();

    try {
        // 1) Geocoding
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
        const geoResponse = await fetch(geoUrl);

        if (!geoResponse.ok) {
            throw new Error('Geocoding service unavailable.');
        }

        const geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
            showError(`No results found for "${city}". Please check the spelling.`);
            return;
        }

        const location = geoData.results[0];
        const { latitude, longitude, name, country, admin1, timezone } = location;

        // 2) Forecast
        const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
        weatherUrl.searchParams.set('latitude', latitude);
        weatherUrl.searchParams.set('longitude', longitude);
        weatherUrl.searchParams.set('timezone', 'auto');
        weatherUrl.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m');
        weatherUrl.searchParams.set('hourly', 'temperature_2m,weather_code');
        weatherUrl.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
        weatherUrl.searchParams.set('forecast_days', '7');

        const weatherResponse = await fetch(weatherUrl);

        if (!weatherResponse.ok) {
            throw new Error('Weather service unavailable.');
        }

        const weatherData = await weatherResponse.json();

        // 3) Render
        renderWeather(weatherData, { name, country, admin1, timezone });
        hideLoading();
        weatherContent.classList.remove('hidden');

    } catch (error) {
        console.error(error);
        showError(error.message || 'Failed to fetch weather data. Please try again.');
    }
}

// ----- Render Functions -----
function renderWeather(data, locationInfo) {
    // ----- Location Header -----
    locationName.textContent = locationInfo.name;
    const detailParts = [locationInfo.admin1, locationInfo.country].filter(Boolean);
    locationDetail.textContent = detailParts.join(', ');

    // ----- Current Weather -----
    const current = data.current;
    const currentCode = current.weather_code;
    const currentInfo = getWeatherInfo(currentCode);

    currentIcon.textContent = currentInfo.icon;
    currentTemp.textContent = `${Math.round(current.temperature_2m)}°C`;
    currentDesc.textContent = currentInfo.desc;
    currentMeta.innerHTML = `
        <span>💧 Humidity: ${current.relative_humidity_2m}%</span>
        <span>🌬️ Wind: ${Math.round(current.wind_speed_10m)} km/h</span>
        <span>🌡️ Feels like: ${Math.round(current.apparent_temperature)}°C</span>
    `;

    // ----- Hourly Forecast (next 24 entries) -----
    hourlyForecast.innerHTML = '';
    const hourly = data.hourly;
    const now = new Date();
    const currentHourISO = now.toISOString().slice(0, 13); // e.g., "2025-03-21T14"

    // Find the index of the current hour (or nearest past hour)
    let startIndex = 0;
    for (let i = 0; i < hourly.time.length; i++) {
        if (hourly.time[i].slice(0, 13) >= currentHourISO) {
            startIndex = i;
            break;
        }
    }

    // Show 24 hours from the start index
    const endIndex = Math.min(startIndex + 24, hourly.time.length);
    for (let i = startIndex; i < endIndex; i++) {
        const time = hourly.time[i];
        const temp = hourly.temperature_2m[i];
        const code = hourly.weather_code[i];
        const info = getWeatherInfo(code);

        const card = document.createElement('div');
        card.className = 'hourly-card';
        card.innerHTML = `
            <div class="hour">${formatHour(time)}</div>
            <div class="icon">${info.icon}</div>
            <div class="temp">${Math.round(temp)}°</div>
        `;
        hourlyForecast.appendChild(card);
    }

    // ----- Daily Forecast -----
    dailyForecast.innerHTML = '';
    const daily = data.daily;
    for (let i = 0; i < daily.time.length; i++) {
        const dateStr = daily.time[i];
        const code = daily.weather_code[i];
        const info = getWeatherInfo(code);
        const maxTemp = Math.round(daily.temperature_2m_max[i]);
        const minTemp = Math.round(daily.temperature_2m_min[i]);

        const row = document.createElement('div');
        row.className = 'daily-row';
        row.innerHTML = `
            <span class="day-name">${formatDay(dateStr)}</span>
            <span class="day-icon">${info.icon}</span>
            <span class="day-desc">${info.desc}</span>
            <span class="day-temps">
                <span class="max">${maxTemp}°</span> / <span class="min">${minTemp}°</span>
            </span>
        `;
        dailyForecast.appendChild(row);
    }
}

// ----- Event Listeners -----
searchBtn.addEventListener('click', () => {
    fetchWeather(cityInput.value);
});

cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        fetchWeather(cityInput.value);
    }
});

// Load a default city on first open (optional)
window.addEventListener('load', () => {
    cityInput.value = 'London';
    fetchWeather('London');
});

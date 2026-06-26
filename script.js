// --- FIREBASE KONFIGURATION ---
const DATA_URL_BASE = "https://stepfree-echo-default-rtdb.europe-west1.firebasedatabase.app/mapdata/markers";
let reportsData = [];
let activeSelectedFilters = [];
let userCoords = null;

// Screenreader direkt ansprechen
function announceToScreenReader(message) {
    const announcer = document.getElementById('sr-announcer');
    if (announcer) {
        announcer.textContent = ""; 
        setTimeout(() => { announcer.textContent = message; }, 50);
    }
}

// Barrierefreie Dialog-Engine (Ersatz für Standard-Alerts)
const CustomUI = {
    async confirm(titel, text, jaText = "Ja", neinText = "Abbrechen") {
        return new Promise((resolve) => {
            const lastActiveElement = document.activeElement;
            const overlay = document.createElement('div');
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'modal-title');
            overlay.setAttribute('aria-describedby', 'modal-desc');
            overlay.className = "modal-overlay";
            
            overlay.innerHTML = `
                <div class="modal-box">
                    <h3 id="modal-title">${titel}</h3>
                    <p id="modal-desc">${text}</p>
                    <div class="modal-buttons">
                        ${neinText ? `<button id="modal-nein">${neinText}</button>` : ''}
                        <button id="modal-ja">${jaText}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.querySelector('#modal-ja').focus();

            const keyHandler = (e) => { if (e.key === "Escape") close(false); };
            document.addEventListener('keydown', keyHandler);

            function close(result) {
                document.removeEventListener('keydown', keyHandler);
                document.body.removeChild(overlay);
                lastActiveElement.focus();
                resolve(result);
            }
            if (neinText) overlay.querySelector('#modal-nein').onclick = () => close(false);
            overlay.querySelector('#modal-ja').onclick = () => close(true);
        });
    }
};

// Haversine-Formel zur Distanzberechnung in Kilometern
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Standortermittlung starten
function setupLocationTracking() {
    if (!navigator.geolocation) {
        announceToScreenReader("Ihr Gerät unterstützt keine Standortermittlung.");
        return;
    }
    navigator.geolocation.watchPosition(
        (pos) => {
            userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            document.getElementById('gps-status').textContent = "GPS aktiv und genau.";
            loadFromCommunity();
            checkProximityAlerts();
        },
        () => { announceToScreenReader("GPS-Fehler. Bitte Standortfreigabe prüfen."); },
        { enableHighAccuracy: true }
    );
}

// Daten aus Firebase laden
async function loadFromCommunity() {
    try {
        const response = await fetch(`${DATA_URL_BASE}.json`);
        if (response.ok) {
            const result = await response.json();
            if (!result) {
                reportsData = [];
                renderObstacleList();
                return;
            }
            const jetzt = Date.now();
            reportsData = Object.entries(result).map(([k, r]) => {
                if (!r) return null;
                r.id = k;
                return r;
            }).filter(r => r !== null && (!r.expiresAt || r.expiresAt > jetzt));

            renderObstacleList();
        }
    } catch (err) { console.error("Fehler beim Laden:", err); }
}

// Filter umschalten
function toggleFilter(kategorie) {
    const idx = activeSelectedFilters.indexOf(kategorie);
    if (idx > -1) {
        activeSelectedFilters.splice(idx, 1);
        announceToScreenReader(`Filter für ${kategorie} entfernt.`);
    } else {
        activeSelectedFilters.push(kategorie);
        announceToScreenReader(`Filter für ${kategorie} aktiviert.`);
    }
    renderObstacleList();
}

// Liste rendern (Optimiert für Screenreader-Fokus)
function renderObstacleList() {
    const list = document.getElementById('obstacle-list');
    if (!list) return;
    list.innerHTML = "";
    list.removeAttribute('aria-busy');

    if (!userCoords) {
        list.innerHTML = `<li>Warte auf GPS-Koordinaten...</li>`;
        return;
    }

    reportsData.forEach(r => { r.currentDistance = getDistance(userCoords.lat, userCoords.lng, r.lat, r.lng) * 1000; });
    let gefilterteDaten = [...reportsData].sort((a, b) => a.currentDistance - b.currentDistance);

    if (activeSelectedFilters.length > 0) {
        gefilterteDaten = gefilterteDaten.filter(r => {
            const types = Array.isArray(r.typ) ? r.typ : [r.typ];
            return activeSelectedFilters.some(f => types.includes(f));
        });
    }

    if (gefilterteDaten.length === 0) {
        list.innerHTML = `<li>Keine akuten Gefahren in Ihrer Nähe gemeldet.</li>`;
        return;
    }

    gefilterteDaten.forEach((r) => {
        const distanzText = Math.round(r.currentDistance);
        const typenKette = Array.isArray(r.typ) ? r.typ.join(", ") : r.typ;
        
        let emoji = "⚠️";
        if (typenKette.includes("Baustelle")) emoji = "🚧";
        else if (typenKette.includes("E-Scooter")) emoji = "🛴";
        else if (typenKette.includes("Mülltonne")) emoji = "🗑️";
        else if (typenKette.includes("Ast")) emoji = "🌳";
        else if (typenKette.includes("Signal")) emoji = "🔊";
        else if (typenKette.includes("Auto")) emoji = "🚗";

        let screenreaderInfo = `Gefahr: ${typenKette}. Entfernung: ${distanzText} Meter. Beschreibung: ${r.kommentar || 'Keine Zusatzinfo'}.`;

        const li = document.createElement('li');
        li.className = "obstacle-card";
        li.innerHTML = `
            <div class="obstacle-info" tabindex="0" aria-label="${screenreaderInfo}">
                <h3>${emoji} ${typenKette}</h3>
                <p class="distance-badge">📍 <strong>${distanzText} Meter entfernt</strong></p>
                <p class="comment-text">"${r.kommentar || 'Keine Zusatzinfos'}"</p>
            </div>
            <div class="obstacle-actions">
                <button onclick="verifyByLocation('${r.id}')">📍 Vor Ort bestätigen</button>
                <button onclick="vote('${r.id}', 1)">👍 Existiert noch</button>
                <button onclick="vote('${r.id}', -1)">👎 Gefahr ist weg</button>
            </div>
        `;
        list.appendChild(li);
    });
}

// Gefahr absenden
function finalizeMultiReport(event) {
    event.preventDefault();
    if (!userCoords) {
        announceToScreenReader("Meldung fehlgeschlagen: Kein GPS-Signal.");
        return;
    }

    const checkboxes = document.querySelectorAll('#multiReportForm input[name="typ"]:checked');
    const gewaehlteTypen = Array.from(checkboxes).map(cb => cb.value);

    if (gewaehlteTypen.length === 0) {
        announceToScreenReader("Bitte wählen Sie mindestens eine Kategorie aus.");
        return;
    }

    const kommentarText = document.getElementById('multiDetails').value;
    const einTag = 24 * 60 * 60 * 1000;
    
    // Flüchtiges (Scooter/Müll/Autos) verfällt nach 24 Stunden, feste Hindernisse nach 7 Tagen
    let ablaufZeit = Date.now() + (7 * einTag); 
    if (gewaehlteTypen.some(t => t.includes("E-Scooter") || t.includes("Mülltonne") || t.includes("Auto"))) {
        ablaufZeit = Date.now() + einTag;
    }

    const neuerPunkt = {
        lat: userCoords.lat,
        lng: userCoords.lng,
        typ: gewaehlteTypen,
        kommentar: kommentarText || "",
        id: "id_" + Date.now(),
        votes: 0,
        status: "new",
        expiresAt: ablaufZeit,
        loeschCheckIns: 0,
        createdAt: Date.now()
    };

    reportsData.push(neuerPunkt);
    saveSingleMarkerToCommunity(neuerPunkt);
    document.getElementById('multiReportForm').reset();
    announceToScreenReader("Erfolgreich gemeldet.");
    loadFromCommunity();
}

async function saveSingleMarkerToCommunity(neuerPunkt) {
    try {
        await fetch(`${DATA_URL_BASE}/${neuerPunkt.id}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(neuerPunkt)
        });
    } catch (e) { console.error(e); }
}

async function updateSingleMarkerInCommunity(punkt) {
    try {
        await fetch(`${DATA_URL_BASE}/${punkt.id}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(punkt)
        });
    } catch (e) { console.error(e); }
}

// Verifikation vor Ort (Löschung bei 3 "Weg"-Meldungen im 50m-Radius)
async function verifyByLocation(id) {
    const report = reportsData.find(r => r.id === id);
    if (!report || !userCoords) return;

    const dist = getDistance(userCoords.lat, userCoords.lng, report.lat, report.lng);
    if (dist <= 0.05) { 
        report.loeschCheckIns = (report.loeschCheckIns || 0) + 1;
        if (report.loeschCheckIns >= 3) {
            report.expiresAt = Date.now() - 1000;
            announceToScreenReader("Das Hindernis wurde als bereinigt markiert und entfernt.");
        } else {
            announceToScreenReader("Standort verifiziert. Vielen Dank.");
        }
        await updateSingleMarkerInCommunity(report);
        loadFromCommunity();
    } else {
        await CustomUI.confirm("📍 Zu weit entfernt", "Ein Check-In ist erst möglich, wenn Sie sich im Umkreis von 50 Metern befinden.", "Verstanden", "");
    }
}

async function vote(id, change) {
    const report = reportsData.find(r => r.id === id);
    if (!report) return;
    let myVotes = JSON.parse(localStorage.getItem('userVotes') || "{}");

    if (myVotes[id]) {
        announceToScreenReader("Sie haben für dieses Hindernis bereits abgestimmt.");
        return;
    }

    report.votes += change;
    myVotes[id] = true;
    localStorage.setItem('userVotes', JSON.stringify(myVotes));
    announceToScreenReader("Stimme registriert.");
    
    await updateSingleMarkerInCommunity(report);
    renderObstacleList();
}

// Akustischer & Taktiler Radar-Warner (Reagiert bei Annäherung unter 12 Meter)
let lastBeepTime = 0;
function checkProximityAlerts() {
    if (!userCoords || reportsData.length === 0) return;
    reportsData.forEach(r => {
        const distance = getDistance(userCoords.lat, userCoords.lng, r.lat, r.lng) * 1000;
        if (distance < 12 && Date.now() - lastBeepTime > 4000) {
            triggerAudioWarning();
            lastBeepTime = Date.now();
        }
    });
}

function triggerAudioWarning() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.15);
    if (navigator.vibrate) navigator.vibrate([300]);
}

// Aktivierung triggern, sobald der User die Seite berührt oder lädt
window.onload = () => { 
    setupLocationTracking(); 
    
    // Fallback: Falls der Browser beim Laden blockiert hat, 
    // aktivieren wir es, sobald der User irgendwo hinklickt/tippt
    document.body.addEventListener('click', () => {
        if (!userCoords) {
            console.log("Re-Aktivierung durch Benutzerinteraktion...");
            setupLocationTracking();
        }
    }, { once: true }); // Führt das nur einmal aus
};


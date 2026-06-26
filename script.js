const isAdminPage = window.location.pathname.includes("admin.html");

// --- AKUSTISCHES FEEDBACK ENGINE (Text-to-Speech für Blinde) ---
const AudioEcho = {
    speak(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // Laufende Ansagen abbrechen
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'de-DE';
            utterance.rate = 1.0;
            window.speechSynthesis.speak(utterance);
        }
        // Fallback für Screenreader über ARIA-Live-Kanal
        const announcer = document.getElementById('screenreader-live-announcer');
        if (announcer) {
            announcer.textContent = text;
        }
    }
};

// --- ZENTRALE MODAL ENGINE (BARRIEREFREI & HIGH-CONTRAST) ---
const CustomUI = {
    async confirm(titel, text, jaText = "Ja", neinText = "Abbrechen") {
        return new Promise((resolve) => {
            AudioEcho.speak(`${titel}. ${text}.`);
            const overlay = document.createElement('div');
            overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;";
            overlay.innerHTML = `
                <div role="dialog" aria-modal="true" aria-labelledby="m-title" aria-describedby="m-desc" style="background:#111; border:4px solid #00FF00; padding:25px; border-radius:12px; max-width:400px; width:100%; box-shadow:0 0 30px rgba(0,255,0,0.3); text-align:center;">
                    <h3 id="m-title" style="margin-top:0; color:#00FF00; font-size:1.5em;">${titel}</h3>
                    <p id="m-desc" style="font-size:1.2em; color:#FFF; margin-bottom:25px; line-height:1.5;">${text}</p>
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <button id="modal-ja" style="min-height:54px; background:#00FF00; color:#000; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:1.2em;">${jaText}</button>
                        ${neinText ? `<button id="modal-nein" style="min-height:54px; background:#222; color:#FFF; border:2px solid #FFF; padding:10px; border-radius:8px; cursor:pointer; font-size:1.1em;">${neinText}</button>` : ''}
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            const primaryBtn = overlay.querySelector('#modal-ja');
            primaryBtn.focus();

            if (neinText) {
                overlay.querySelector('#modal-nein').onclick = () => { document.body.removeChild(overlay); resolve(false); };
            }
            primaryBtn.onclick = () => { document.body.removeChild(overlay); resolve(true); };
        });
    },

    async prompt(titel, text, placeholder = "", inputType = "text") {
        return new Promise((resolve) => {
            AudioEcho.speak(`${titel}. ${text}.`);
            const overlay = document.createElement('div');
            overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;";
            overlay.innerHTML = `
                <div role="dialog" aria-modal="true" aria-labelledby="p-title" aria-describedby="p-desc" style="background:#111; border:4px solid #F1C40F; padding:25px; border-radius:12px; max-width:400px; width:100%; box-shadow:0 0 30px rgba(241,196,15,0.3);">
                    <h3 id="p-title" style="margin-top:0; color:#F1C40F; font-size:1.5em; text-align:center;">${titel}</h3>
                    <p id="p-desc" style="font-size:1.2em; color:#FFF; margin-bottom:15px; text-align:center;">${text}</p>
                    <input id="modal-input" type="${inputType}" placeholder="${placeholder}" aria-label="${text}" style="width:100%; min-height:50px; background:#222; color:#FFF; border:2px solid #FFF; padding:10px; border-radius:8px; margin-bottom:20px; box-sizing:border-box; font-size:1.2em;">
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <button id="modal-submit" style="min-height:54px; background:#F1C40F; color:#000; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:1.2em;">Bestätigen</button>
                        <button id="modal-cancel" style="min-height:54px; background:#222; color:#FFF; border:2px solid #FFF; padding:10px; border-radius:8px; cursor:pointer; font-size:1.1em;">Abbrechen</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            const input = overlay.querySelector('#modal-input');
            input.focus();
            
            overlay.querySelector('#modal-cancel').onclick = () => { document.body.removeChild(overlay); resolve(null); };
            overlay.querySelector('#modal-submit').onclick = () => {
                const val = input.value.trim();
                document.body.removeChild(overlay);
                resolve(val || null);
            };
            input.onkeydown = (e) => {
                if (e.key === "Enter") overlay.querySelector('#modal-submit').click();
            };
        });
    }
};

function showVerificationStatus(erfolgreich, nachricht) {
    AudioEcho.speak(nachricht);
    const overlay = document.createElement('div');
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;";
    
    const farbe = erfolgreich ? "#00FF00" : "#E74C3C";
    const titel = erfolgreich ? "Check-In erfolgreich" : "Check-In fehlgeschlagen";
    
    overlay.innerHTML = `
        <div role="alertdialog" aria-modal="true" style="background:#111; padding:25px; border-radius:12px; border:4px solid ${farbe}; max-width:380px; width:100%; text-align:center;">
            <h3 style="margin-top:0; color:${farbe}; font-size:1.6em;">${titel}</h3>
            <p style="font-size:1.2em; color:#FFF; margin-bottom:20px; line-height:1.5;">${nachricht}</p>
            <button id="status-close" style="width:100%; min-height:54px; background:${farbe}; color:#000; border:none; padding:12px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:1.2em;">Schließen & Weiter</button>
        </div>
    `;
    document.body.appendChild(overlay);
    const closeBtn = overlay.querySelector('#status-close');
    closeBtn.focus();
    closeBtn.onclick = () => { document.body.removeChild(overlay); };
}

// --- ADMIN LOGIN ---
if (isAdminPage) {
    setTimeout(async () => {
        const login = await CustomUI.prompt("🔒 StepFree Echo Admin", "Bitte Mod-Zertifikatspasswort eingeben:", "Passwort...", "password");
        if (!login) { window.location.href = "index.html"; return; }
        const msgBuffer = new TextEncoder().encode(login);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        if (hashHex === "b6e97cdceff5afead6676708d2261e8a915078ff0f2fa77856aae786ad6ac78c") {
            AudioEcho.speak("Admin Modus erfolgreich autorisiert.");
        } else {
            await CustomUI.confirm("🔒 Autorisierungsfehler", "Das Passwort ist fehlerhaft.", "Zurück zur Live-Karte", "");
            window.location.href = "index.html";
        }
    }, 100); 
}

const DATA_URL_BASE = "https://stepfree-echo-default-rtdb.europe-west1.firebasedatabase.app/";
let map, myLocationMarker, reportsData = [], activeMarkers = {};
let activeSelectedFilters = [];

function formatierenDatum(timestamp) {
    if (!timestamp) return "Unbekannt";
    const date = new Date(timestamp);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + 
           " um " + 
           date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + " Uhr";
}

function updateStatus(text, color) {
    const s = document.getElementById('sync-status');
    if (s) {
        s.innerHTML = text;
        s.style.borderColor = color;
        s.style.color = color;
    }
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function initApp() {
    const splash = document.getElementById('splash-screen');
    map = L.map('map', { ariaHidden: true }).setView([48.775, 9.182], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    
    map.on('click', e => openSelectionPopup(e.latlng));
    setupLocationTracking();
    
    L.Control.geocoder({
            position: 'topleft',
            defaultMarkGeocode: false,
            placeholder: "Ort / Leitsystem suchen...",
            errorMessage: "Suche erfolglos."
        })
        .on('markgeocode', function(e) {
            var bbox = e.geocode.bbox;
            var poly = L.polygon([bbox.getSouthEast(), bbox.getNorthEast(), bbox.getNorthWest(), bbox.getSouthWest()]);
            map.fitBounds(poly.getBounds());
        })
        .addTo(map);
    
    map.on('moveend', loadFromCommunity);
    map.on('zoomend', loadFromCommunity);
    
    await loadFromCommunity();
    
    if (splash) {
        setTimeout(() => {
            splash.style.opacity = '0';
            setTimeout(() => {
                splash.style.display = 'none';
                map.invalidateSize();
                buildAccessibleList();
                AudioEcho.speak("StepFree Echo geladen. Akustisches Blinden-Leitsystem ist aktiv.");
            }, 500);
        }, 800);
    }
}

function setupLocationTracking() {
    map.locate({watch: true, enableHighAccuracy: true});
    map.on('locationfound', e => {
        if (!myLocationMarker) {
            map.setView(e.latlng, 16);
            myLocationMarker = true; 
        }
    });
}

async function loadFromCommunity() {
    if (!map) return;
    updateStatus("Synchronisiere Barrieredaten...", "#F1C40F");
    try {
        const bounds = map.getBounds();
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();
        const url = `${DATA_URL_BASE}.json?orderBy="lat"&startAt=${southWest.lat}&endAt=${northEast.lat}`;

        const response = await fetch(url);
        if (response.ok) {
            const result = await response.json();
            let geladeneMarker = [];
            
            if (result) {
                geladeneMarker = Object.entries(result).map(([k, r]) => {
                    if (!r) return null;
                    r.id = k; 
                    r.sonderVoting = r.sonderVoting || { ja: 0, nein: 0 };
                    r.loeschCheckIns = r.loeschCheckIns || 0;
                    return r;
                }).filter(r => r !== null && r.lng >= southWest.lng && r.lng <= northEast.lng);
            }
            
            const jetzt = Date.now();
            reportsData = geladeneMarker.filter(r => !r.expiresAt || r.expiresAt > jetzt);
            drawMarkersOnMap();
            buildAccessibleList();
            updateStatus("Live-Netzwerk aktiv", "#00FF00");
        }
    } catch (err) { 
        updateStatus("Offline-Modus", "#E67E22");
    }
}

// --- GENERIERUNG DER ACCESSIBLE TACTILE LISTE FÜR SCREENREADER & LOW-VISION ---
function buildAccessibleList() {
    const listSection = document.getElementById('blind-navigation-section');
    if (!listSection) return;

    // Behalte die Überschrift und die Audio-Steuerelemente bei
    listSection.innerHTML = `
        <h2 id="list-heading" tabindex="0">🔊 Akustische Umgebungs-Echozentrale</h2>
        <div class="audio-controls">
            <button onclick="readEnvironmentSummary()" aria-label="Umgebung akustisch zusammenfassen">🗣️ Umgebungs-Check scannen</button>
        </div>
        <div id="accessible-items-container" role="region" aria-live="polite" aria-labelledby="list-heading"></div>
    `;

    const container = document.getElementById('accessible-items-container');
    if (reportsData.length === 0) {
        container.innerHTML = `<p style="font-size:1.2rem; color:#AAA; font-style:italic;">Keine gemeldeten Infrastrukturen oder Hindernisse in diesem Radius.</p>`;
        return;
    }

    reportsData.forEach(r => {
        let typliste = Array.isArray(r.typ) ? r.typ : [r.typ];
        
        // Prüfen, ob Filter aktiv sind
        if (activeSelectedFilters.length > 0) {
            const passtZuFiltern = activeSelectedFilters.some(f => typliste.some(t => t.includes(f) || f.includes(t)));
            if (!passtZuFiltern) return;
        }

        const card = document.createElement('div');
        card.className = "accessible-card";
        card.tabIndex = 0;
        
        const verifiziertText = r.status === "confirmed" ? " [Offiziell Bestätigt]" : "";
        const details = r.kommentar ? `Zusatzinfo: ${r.kommentar}` : "Keine Zusatzinfos.";

        card.setAttribute('aria-label', `Eintrag: ${typliste.join(', ')}.${verifiziertText}. ${details}`);

        // Google Maps Struktur repariert
        const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}&travelmode=walking`;

        card.innerHTML = `
            <h4>${typliste.join(' & ')} ${r.status === 'confirmed' ? '🌟' : ''}</h4>
            <p>${details}</p>
            <div style="font-size:1rem; color:#00FF00; margin-bottom:12px;">Vertrauens-Level: ${r.votes || 0}</div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button onclick="vote('${r.id}', 1)" aria-label="Bestätigen, dass diese Meldung stimmt">👍 Stimmt</button>
                <button onclick="vote('${r.id}', -1)" aria-label="Melden, dass diese Meldung falsch ist">👎 Falsch</button>
                <a href="${googleUrl}" target="_blank" role="button" style="display:inline-flex; align-items:center; background:#00FF00; color:#000; padding:10px 14px; border-radius:8px; text-decoration:none; font-weight:bold; min-height:44px;">🧭 Zielführung starten</a>
                <button onclick="verifyByLocation('${r.id}')" style="background:#F1C40F; color:#000;">📍 Vor Ort Einchecken</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function readEnvironmentSummary() {
    if (reportsData.length === 0) {
        AudioEcho.speak("Der Weg vor dir ist frei. Keine akustischen oder taktilen Meldungen im aktuellen Kartenausschnitt.");
        return;
    }
    const anzahl = reportsData.length;
    AudioEcho.speak(`Scan abgeschlossen. Ich habe ${anzahl} Einträge in deiner Umgebung lokalisiert. Nutze die Wischgesten oder Tabulator, um die Details anzuhören.`);
}

async function saveSingleMarkerToCommunity(neuerPunkt) {
    try {
        await fetch(`${DATA_URL_BASE}/${neuerPunkt.id}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(neuerPunkt)
        });
    } catch (err) {}
}

async function updateSingleMarkerInCommunity(punkt) {
    try {
        await fetch(`${DATA_URL_BASE}/${punkt.id}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(punkt)
        });
    } catch (err) {}
}

function toggleFilterBadge(button) {
    const value = button.getAttribute('data-value');
    if (activeSelectedFilters.includes(value)) {
        activeSelectedFilters = activeSelectedFilters.filter(f => f !== value);
        button.classList.remove('active');
    } else {
        activeSelectedFilters.push(value);
        button.classList.add('active');
    }
    loadFromCommunity();
}

function resetAllFilters() {
    activeSelectedFilters = [];
    document.querySelectorAll('.filter-badge').forEach(b => b.classList.remove('active'));
    loadFromCommunity();
}

function drawMarkersOnMap() {
    if (!map) return;
    Object.values(activeMarkers).forEach(m => map.removeLayer(m));
    activeMarkers = {};
    
    reportsData.forEach((r) => {
        let markerTypes = Array.isArray(r.typ) ? r.typ : [r.typ];
        let emoji = "🦮";
        let markerFarbe = "#2c3e50";

        if (markerTypes.includes("Baustelle ohne Bodenführung")) { emoji = "🚧"; markerFarbe = "#E74C3C"; }
        else if (markerTypes.includes("Hindernis auf Kopfhöhe")) { emoji = "📐"; markerFarbe = "#E67E22"; }
        else if (markerTypes.includes("Querparker / Blockade")) { emoji = "🛴"; markerFarbe = "#D35400"; }
        else if (markerTypes.includes("Fehlendes Leitsystem")) { emoji = "🦮"; markerFarbe = "#7F8C8D"; }
        else if (markerTypes.includes("Akustik-Ampel defekt")) { emoji = "🔊"; markerFarbe = "#C0392B"; }
        else if (markerTypes.includes("Taktiler Umsteigepunkt")) { emoji = "🚉"; markerFarbe = "#27AE60"; }
        else if (markerTypes.includes("Sprechender Fahrplan")) { emoji = "🗣️"; markerFarbe = "#2980B9"; }

        const icon = L.divIcon({
            html: `<div style="background:${markerFarbe}; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:50%; border:2px solid #FFF; color:white; font-size:16px;">${emoji}</div>`,
            className: '',
            iconSize: [32, 32]
        });
        
        const m = L.marker([r.lat, r.lng], { icon }).addTo(map);
        activeMarkers[r.id] = m;
    });
}

// --- VERIFIZIERUNG & MODERATION ---
function verifyByLocation(id) {
    const report = reportsData.find(r => r.id === id);
    if (!report) return;

    updateStatus("GPS-Abgleich läuft...", "#F1C40F");
    navigator.geolocation.getCurrentPosition((pos) => {
        const dist = getDistance(pos.coords.latitude, pos.coords.longitude, report.lat, report.lng);

        if (dist <= 0.05) { 
            finalizeVerificationProcess(report, "Standort verifiziert! Du bist direkt vor Ort eingeecheckt.");
        } else {
            showVerificationStatus(false, "Check-In verweigert. Du bist laut GPS-Koordinaten weiter als 50 Meter von diesem Infrastruktur-Punkt entfernt.");
        }
    }, () => {
        showVerificationStatus(false, "Ortung fehlgeschlagen. Bitte erlaube StepFree Echo den Zugriff auf deinen präzisen GPS-Standort.");
    });
}

async function finalizeVerificationProcess(report, benutzerNachricht = null) {
    report.verifiedAt = new Date().toLocaleString('de-DE'); 
    await updateSingleMarkerInCommunity(report);
    await loadFromCommunity(); 
    showVerificationStatus(true, benutzerNachricht || "Vielen Dank. Dein Vor-Ort-Sicherheitscheck wurde in das Netzwerk eingespeist.");
}

function openSelectionPopup(latlng) {
    AudioEcho.speak("Eintrags-Menü geöffnet.");
    const content = `
    <div style="width: 290px; background:#111; color:#FFF; font-family:sans-serif; padding:10px; max-height:400px; overflow-y:auto;">
      <b style="display:block; text-align:center; color:#00FF00; font-size:1.2em; margin-bottom:12px;">Infrastruktur melden</b>
      <form id="multiReportForm" onsubmit="finalizeMultiReport(event, ${latlng.lat}, ${latlng.lng})">
        <div style="display:flex; flex-direction:column; gap:10px; font-size:1.1em;">
          <label><input type="checkbox" name="typ" value="Baustelle ohne Bodenführung"> 🚧 Gefahren-Baustelle</label>
          <label><input type="checkbox" name="typ" value="Hindernis auf Kopfhöhe"> 📐 Schild/Ast auf Kopfhöhe</label>
          <label><input type="checkbox" name="typ" value="Querparker / Blockade"> 🛴 Leitlinie blockiert</label>
          <label><input type="checkbox" name="typ" value="Fehlendes Leitsystem"> 🦮 Fehlende Noppen/Rillen</label>
          <label><input type="checkbox" name="typ" value="Akustik-Ampel defekt"> 🔊 Akustik-Ampel defekt</label>
          <label><input type="checkbox" name="typ" value="Taktiler Umsteigepunkt"> 🚉 Taktiler Umsteigepunkt</label>
          <label><input type="checkbox" name="typ" value="Sprechender Fahrplan"> 🗣️ Sprechender Fahrplan</label>
          <input type="text" id="multiDetails" placeholder="Spezifische Ortsbeschreibung..." style="background:#222; color:#FFF; border:2px solid #FFF; padding:10px; border-radius:6px; width:90%; font-size:1em; margin-top:10px;">
          <button type="submit" style="background:#00FF00; color:#000; border:none; padding:12px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:1.1em; width:100%; margin-top:10px;">💾 Eintrag speichern</button>
        </div>
      </form>
    </div>`;
    L.popup().setLatLng(latlng).setContent(content).openOn(map);
}

function finalizeMultiReport(event, lat, lng) {
    event.preventDefault();
    const checkboxes = document.querySelectorAll('#multiReportForm input[name="typ"]:checked');
    const gewaehlteTypen = Array.from(checkboxes).map(cb => cb.value);
    if (gewaehlteTypen.length === 0) return;
    
    const kommentarText = document.getElementById('multiDetails').value;
    const neuerPunkt = {
        lat: lat, lng: lng, typ: gewaehlteTypen, 
        kommentar: kommentarText || "", id: "id_" + Date.now(), 
        votes: 0, status: "new", createdAt: Date.now() 
    };

    reportsData.push(neuerPunkt);
    saveSingleMarkerToCommunity(neuerPunkt);
    loadFromCommunity();
    map.closePopup();
    AudioEcho.speak("Meldung erfolgreich aufgezeichnet und an das Kontrollnetzwerk übertragen.");
}

async function vote(id, change) {
    const report = reportsData.find(r => r.id === id);
    if (!report) return;
    
    let myVotes = JSON.parse(localStorage.getItem('userVotes') || "{}");
    if (myVotes[id]) {
        await CustomUI.confirm("Aktion blockiert", "Deine Stimme wurde für diesen Datensatz bereits registriert.", "Verstanden", "");
        return;
    }
    
    report.votes += change;
    myVotes[id] = true;
    localStorage.setItem('userVotes', JSON.stringify(myVotes));
    
    await updateSingleMarkerInCommunity(report);
    loadFromCommunity();
    AudioEcho.speak("Deine Bewertung wurde gezählt.");
}

function downloadBackup() {
    try {
        const dataStr = JSON.stringify(reportsData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
        const dataUri = URL.createObjectURL(blob);
        const linkElement = document.createElement('a');
        linkElement.href = dataUri;
        linkElement.download = 'stepfree_echo_backup_' + new Date().toISOString().split('T')[0] + '.json';
        document.body.appendChild(linkElement);
        linkElement.click();
        document.body.removeChild(linkElement);
    } catch (f) {}
}
window.downloadBackup = downloadBackup;

function toggleMenu() {
    const menu = document.getElementById('side-menu');
    const overlay = document.getElementById('menu-overlay');
    menu.classList.toggle('open');
    overlay.classList.toggle('show');
}

function toggleLegend() {
    const legend = document.getElementById('map-legend');
    if (legend) legend.classList.toggle('collapsed');
}

window.onload = initApp;

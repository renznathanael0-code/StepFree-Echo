const DB_URL = "https://stepfree-echo-default-rtdb.europe-west1.firebasedatabase.app/obstacles.json";
const BASE_URL = "https://stepfree-echo-default-rtdb.europe-west1.firebasedatabase.app/obstacles/";

if (!localStorage.getItem('user_voice_id')) {
    localStorage.setItem('user_voice_id', 'user_' + Math.random().toString(36).substring(2, 11));
}
const userId = localStorage.getItem('user_voice_id');

let userLatitude = 51.1657; 
let userLongitude = 10.4515;
let isAppAwake = false;
let awakeTimeout = null;
let recognition = null;
let shouldListen = true;
let isVoiceSystemDisabled = false; // Schalter, um das System komplett abzuschalten
let currentNearbyObstacles = [];   // Speicher für das "Umgebung"-Sprachkommando

// ==========================================
// 1. KARTEN-INITIALISIERUNG & STANDORT
// ==========================================
const map = L.map('map').setView([userLatitude, userLongitude], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

let markerGroup = L.layerGroup().addTo(map);
let userMarker = null;
let temporaryClickMarker = null; // Temporärer Marker für den Kartenklick

// GPS Standortermittlung
if (navigator.geolocation) {
    navigator.geolocation.watchPosition((position) => {
        // Nur updaten, wenn der Nutzer NICHT gerade manuell auf die Karte geklickt hat
        if (!temporaryClickMarker) {
            userLatitude = position.coords.latitude;
            userLongitude = position.coords.longitude;
        }
        if (!userMarker) {
            map.setView([userLatitude, userLongitude], 16);
            userMarker = L.circle([userLatitude, userLongitude], { color: '#00f2fe', fillColor: '#00f2fe', fillOpacity: 0.4, radius: 15 }).addTo(map);
        } else {
            userMarker.setLatLng([position.coords.latitude, position.coords.longitude]);
        }
    }, (err) => console.log("GPS verzögert..."), { enableHighAccuracy: true });
}

// Klick-Funktion auf der Karte für Angehörige / Sehende
map.on('click', function(e) {
    userLatitude = e.latlng.lat;
    userLongitude = e.latlng.lng;

    if (temporaryClickMarker) {
        map.removeLayer(temporaryClickMarker);
    }

    // Setze einen verschiebbaren Marker an die geklickte Stelle
    temporaryClickMarker = L.marker([userLatitude, userLongitude], {
        draggable: true
    }).addTo(map).bindPopup("<b>Gewählter Ort für neues Hindernis</b>").openPopup();

    temporaryClickMarker.on('dragend', function(event) {
        const marker = event.target;
        const position = marker.getLatLng();
        userLatitude = position.lat;
        userLongitude = position.lng;
    });

    document.getElementById('obstacle-type').focus();
    speak("Ort auf der Karte markiert. Bitte wähle die Art des Hindernisses.");
});

// Hilfsfunktion: Distanzberechnung
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ==========================================
// 2. RADIKALE SPRACHAUSGABE
// ==========================================
function speak(text, callback) {
    const announcer = document.getElementById('screenreader-announcer');
    if (announcer) announcer.textContent = text;

    // Schlaf-Countdown stoppen, damit er nicht dazwischenredet
    clearTimeout(awakeTimeout);

    shouldListen = false;
    if (recognition) { try { recognition.stop(); } catch(e) {} }

    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    
    utterance.onend = () => {
        shouldListen = true;
        
        if (recognition && !isVoiceSystemDisabled) { 
            try { recognition.start(); } catch(e) {} 
        }

        // Timer erst nach Beenden der Sprachausgabe neu starten
        if (isAppAwake && !isVoiceSystemDisabled) {
            clearTimeout(awakeTimeout);
            awakeTimeout = setTimeout(putToSleep, 15000);
        }

        if (callback) callback();
    };
    window.speechSynthesis.speak(utterance);
}

// ==========================================
// 3. STARTPROZESS
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        speak("Willkommen bei Step Free Echo. Tippe doppelt auf den Bildschirm, um die App zu starten.");
    }, 1000);
});

const splash = document.getElementById('splash-screen');
const appContent = document.getElementById('app-content');

splash.addEventListener('click', startApp);

function startApp() {
    if (splash.classList.contains('hidden')) return;
    splash.classList.add('hidden');
    appContent.classList.remove('hidden');
    
    setTimeout(() => { map.invalidateSize(); }, 200);

    speak("App gestartet. Ich höre ab jetzt im Hintergrund zu. Rufe mich mit dem Namen Echo.", () => {
        initSpeechRecognition();
    });
}

// ==========================================
// 4. SPRACHSTEUERUNG (INKL. UMGEBUNG-BEFEHL)
// ==========================================
function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.continuous = false; 
    recognition.interimResults = false;

    recognition.onend = () => {
        if (shouldListen && !isVoiceSystemDisabled) { 
            try { recognition.start(); } catch(e) {} 
        }
    };

    recognition.onresult = (event) => {
        if (isVoiceSystemDisabled) return;

        const command = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        console.log("Gehört:", command);
        const statusBadge = document.querySelector('.status-dot');
        const statusText = document.getElementById('speech-status');

        // Sprachsteuerung permanent ausschalten
        if (command.includes('ausschalten') || command.includes('deaktivieren')) {
            isVoiceSystemDisabled = true;
            isAppAwake = false;
            clearTimeout(awakeTimeout);
            if(statusBadge) statusBadge.style.backgroundColor = "#ef4444"; 
            if(statusText) statusText.textContent = "Sprachsteuerung permanent offline.";
            speak("Sprachsteuerung wurde vollständig deaktiviert.");
            return;
        }

        // Aufwecken mit "Echo"
        if (command.includes('echo')) {
            isAppAwake = true;
            if(statusBadge) statusBadge.style.backgroundColor = "#00f2fe";
            if(statusText) statusText.textContent = "Zuhören aktiv...";
            speak("Ja? Ich höre.");
            return;
        }

        if (isAppAwake) {
            // NEUER BEFEHL: UMGEBUNG ABFRAGEN
            if (command.includes('umgebung') || command.includes('hindernisse')) {
                if (currentNearbyObstacles.length > 0) {
                    let text = `Es gibt ${currentNearbyObstacles.length} Hindernisse in deiner Nähe. `;
                    text += currentNearbyObstacles.join(". ");
                    speak(text);
                } else {
                    speak("Es befinden sich keine Hindernisse im Umkreis von 50 Metern.");
                }
                return;
            }

            // KATEGORIEN WÄHLEN
            if (command.includes('baustelle')) {
                document.getElementById('obstacle-type').value = 'baustelle';
                speak("Kategorie Baustelle eingestellt.");
            } else if (command.includes('bordstein') || command.includes('kante')) {
                document.getElementById('obstacle-type').value = 'hohe-kante';
                speak("Kategorie Hohe Bordsteinkante eingestellt.");
            } else if (command.includes('leitsystem')) {
                document.getElementById('obstacle-type').value = 'kein-leitsystem';
                speak("Kategorie Fehlendes Blindenleitsystem eingestellt.");
            } 
            
            // BESCHREIBUNG HINZUFÜGEN
            else if (command.includes('beschreibung')) {
                const textAfterCommand = command.split('beschreibung')[1].trim();
                if (textAfterCommand) {
                    document.getElementById('obstacle-desc').value = textAfterCommand;
                    speak(`Beschreibung eingetragen: ${textAfterCommand}`);
                }
            } 
            
            // SPEICHERN
            else if (command.includes('speichern') || command.includes('senden')) {
                document.getElementById('obstacle-form').dispatchEvent(new Event('submit'));
                isAppAwake = false;
                clearTimeout(awakeTimeout);
            }
        }
    };

    try { recognition.start(); } catch(e) {}
}

function putToSleep() {
    if (isVoiceSystemDisabled) return;
    isAppAwake = false;
    const statusBadge = document.querySelector('.status-dot');
    const statusText = document.getElementById('speech-status');
    if(statusBadge) statusBadge.style.backgroundColor = "#22c55e";
    if(statusText) statusText.textContent = "Warte auf Aktivierungswort...";
    speak("Ich schlafe wieder.");
}

// ==========================================
// 5. DATEN AN FIREBASE SENDEN
// ==========================================
document.getElementById('obstacle-form').addEventListener('submit', function(e) {
    e.preventDefault();

    const type = document.getElementById('obstacle-type').value;
    const desc = document.getElementById('obstacle-desc').value;

    const newObstacle = {
        type: type,
        description: desc,
        latitude: userLatitude,
        longitude: userLongitude,
        votedUp: {},
        votedDown: {}
    };

    fetch(DB_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newObstacle)
    })
    .then(res => res.json())
    .then(() => {
        speak("Erfolgreich in der Datenbank gespeichert.");
        document.getElementById('obstacle-form').reset();
        
        if (temporaryClickMarker) {
            map.removeLayer(temporaryClickMarker);
            temporaryClickMarker = null;
        }

        loadObstacles(); 
    })
    .catch(err => {
        speak("Fehler beim Speichern.");
        console.error(err);
    });
});

// ==========================================
// 6. DATEN AUS DATENBANK LADEN
// ==========================================
function loadObstacles() {
    fetch(DB_URL)
    .then(res => res.json())
    .then(data => {
        const listContainer = document.getElementById('obstacles-list');
        if (listContainer) listContainer.innerHTML = "";
        markerGroup.clearLayers();
        
        if (!data) {
            currentNearbyObstacles = [];
            return;
        }

        let obstaclesNearby = [];

        Object.keys(data).forEach(id => {
            const item = data[id];
            if (!item || item.latitude === undefined || item.longitude === undefined) return;

            const distance = Math.round(getDistanceInMeters(userLatitude, userLongitude, item.latitude, item.longitude));
            const upVotes = item.votedUp ? Object.keys(item.votedUp).length : 0;
            const downVotes = item.votedDown ? Object.keys(item.votedDown).length : 0;

            const typeNames = {
                'baustelle': 'Baustelle',
                'hohe-kante': 'Hohe Bordsteinkante',
                'kein-leitsystem': 'Fehlendes Blindenleitsystem'
            };
            const NameReingeschrieben = typeNames[item.type] || 'Hindernis';

            if (distance <= 50) {
                obstaclesNearby.push(`${NameReingeschrieben} in ${distance} Metern Entfernung. ${item.description || ''}`);
            }

            const marker = L.marker([item.latitude, item.longitude], { 
                keyboard: true,
                title: `${NameReingeschrieben}. ${distance} Meter entfernt.`
            });
            marker.bindPopup(`<b>${NameReingeschrieben}</b> (${distance}m)<br>${item.description || ''}`);
            markerGroup.addLayer(marker);

            if (listContainer) {
                const li = document.createElement('li');
                li.innerHTML = `
                    <p><strong>${NameReingeschrieben}</strong> (${distance}m entfernt): ${item.description || ''}</p>
                    <div class="vote-buttons">
                        <button class="btn-vote" onclick="castVote('${id}', 'up')" aria-label="Stimmt">Stimmt (${upVotes})</button>
                        <button class="btn-vote" onclick="castVote('${id}', 'down')" aria-label="Stimmt nicht">Stimmt nicht (${downVotes})</button>
                    </div>
                `;
                listContainer.appendChild(li);
            }
        });

        // Die Liste global sichern, damit "Echo, Umgebung!" klappt
        currentNearbyObstacles = obstaclesNearby;

        // Automatischer Radar beim ersten Laden oder Positionswechsel
        if (obstaclesNearby.length > 0 && !isVoiceSystemDisabled) {
            let warningText = `Achtung, es gibt ${obstaclesNearby.length} Hindernisse im Umkreis von 50 Metern. `;
            warningText += obstaclesNearby.join(". ");
            speak(warningText);
        }
    }).catch(e => console.log(e));
}

// ==========================================
// 7. VOTING-SYSTEM
// ==========================================
window.castVote = function(id, type) {
    fetch(`${BASE_URL}${id}.json`)
    .then(res => res.json())
    .then(item => {
        let votedUp = item.votedUp || {};
        let votedDown = item.votedDown || {};

        if (type === 'up') {
            if (votedUp[userId]) { delete votedUp[userId]; speak("Stimme zurückgezogen."); }
            else { votedUp[userId] = true; delete votedDown[userId]; speak("Bestätigt."); }
        } else {
            if (votedDown[userId]) { delete votedDown[userId]; speak("Stimme zurückgezogen."); }
            else { votedDown[userId] = true; delete votedUp[userId]; speak("Abgelehnt."); }
        }

        fetch(`${BASE_URL}${id}/votedUp.json`, { method: 'PUT', body: JSON.stringify(votedUp) });
        fetch(`${BASE_URL}${id}/votedDown.json`, { method: 'PUT', body: JSON.stringify(votedDown) })
        .then(() => loadObstacles());
    });
};

loadObstacles();

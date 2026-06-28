const DB_URL = "https://stepfree-echo-default-rtdb.europe-west1.firebasedatabase.app/obstacles.json";
const BASE_URL = "https://stepfree-echo-default-rtdb.europe-west1.firebasedatabase.app/obstacles/";

if (!localStorage.getItem('user_voice_id')) {
    localStorage.setItem('user_voice_id', 'user_' + Math.random().toString(36).substring(2, 11));
}
const userId = localStorage.getItem('user_voice_id');

let userLatitude = null;
let userLongitude = null;

// --- LEAFLET KARTEN-INITIALISIERUNG ---
// Wir starten mit einer Standard-Ansicht (Deutschland)
const map = L.map('map').setView([51.1657, 10.4515], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap-Mitwirkende'
}).addTo(map);

let userMarker = null;
let markerGroup = L.layerGroup().addTo(map); // Gruppe für alle Hindernis-Marker

// 1. GPS Standortermittlung & Zentrierung
if (navigator.geolocation) {
    navigator.geolocation.watchPosition((position) => {
        userLatitude = position.coords.latitude;
        userLongitude = position.coords.longitude;

        // Karte auf den Nutzer zentrieren beim ersten Finden
        if (userMarker === null) {
            map.setView([userLatitude, userLongitude], 16);
            userMarker = L.circle([userLatitude, userLongitude], {
                color: 'blue',
                fillColor: '#30f',
                fillOpacity: 0.5,
                radius: 10
            }).addTo(map).bindPopup("Ihr aktueller Standort");
        } else {
            userMarker.setLatLng([userLatitude, userLongitude]);
        }
    }, (err) => console.log("Warte auf GPS..."), { enableHighAccuracy: true });
}

// 2. Sprachausgabe
function speak(text) {
    const announcer = document.getElementById('screenreader-announcer');
    if (announcer) announcer.textContent = text;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    window.speechSynthesis.speak(utterance);
}

// [HINWEIS: Sprachsteuerung (Abschnitt 3) und Formular-Senden (Abschnitt 4) bleiben exakt gleich!]
const startBtn = document.getElementById('start-speech');
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.continuous = true;

    startBtn.addEventListener('click', () => {
        recognition.start();
        document.getElementById('speech-status').textContent = "Sprachsteuerung aktiv.";
        speak("Sprachsteuerung aktiviert. Du kannst jetzt sprechen.");
    });

    recognition.onresult = (event) => {
        const command = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        if (command.includes('baustelle')) {
            document.getElementById('obstacle-type').value = 'baustelle';
            speak("Baustelle ausgewählt.");
        } else if (command.includes('bordstein') || command.includes('kante')) {
            document.getElementById('obstacle-type').value = 'hohe-kante';
            speak("Hohe Bordsteinkante ausgewählt.");
        } else if (command.includes('speichern') || command.includes('senden')) {
            document.getElementById('submit-btn').click();
        }
    };
}

document.getElementById('obstacle-form').addEventListener('submit', function(e) {
    e.preventDefault();
    if (!userLatitude) { speak("Warte auf GPS Signal."); return; }

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
        body: JSON.stringify(newObstacle)
    })
    .then(() => {
        speak("Erfolgreich gespeichert.");
        this.reset();
        loadObstacles();
    });
});

// 5. Daten aus Firebase laden & Marker auf Karte zeichnen (ABGESICHERT)
function loadObstacles() {
    fetch(DB_URL)
    .then(res => res.json())
    .then(data => {
        const listContainer = document.getElementById('obstacles-list');
        if (listContainer) listContainer.innerHTML = "";
        
        markerGroup.clearLayers(); // Alte Marker von der Karte entfernen
        
        if (!data) return;

        Object.keys(data).forEach(id => {
            const item = data[id];

            // SICHERHEITS-CHECK: Hat dieser Eintrag gültige Koordinaten?
            if (!item || item.latitude === undefined || item.longitude === undefined || isNaN(item.latitude) || isNaN(item.longitude)) {
                console.warn(`Eintrag ${id} wurde übersprungen, da GPS-Daten fehlen oder ungültig sind.`);
                return; // Überspringt diesen fehlerhaften Eintrag und macht mit dem nächsten weiter
            }

            const upVotes = item.votedUp ? Object.keys(item.votedUp).length : 0;
            const downVotes = item.votedDown ? Object.keys(item.votedDown).length : 0;

            const typeNames = {
                'baustelle': 'Baustelle',
                'hohe-kante': 'Hohe Bordsteinkante',
                'kein-leitsystem': 'Fehlendes Blindenleitsystem'
            };
            const NameReingeschrieben = typeNames[item.type] || item.type || 'Unbekanntes Hindernis';

            // --- BARRIEREFREIER LEAFLET MARKER ---
            const marker = L.marker([item.latitude, item.longitude], {
                keyboard: true,
                title: `${NameReingeschrieben}: ${item.description || ''}. Stimmen dafür: ${upVotes}`,
                alt: `${NameReingeschrieben}: ${item.description || ''}`
            });

            const popupText = `
                <b>${NameReingeschrieben}</b><br>${item.description || 'Keine Beschreibung'}<br>
                Empfohlen: ${upVotes} | Nicht da: ${downVotes}
            `;
            marker.bindPopup(popupText);
            markerGroup.addLayer(marker);

            // Eintrag für die Textliste unter der Karte
            if (listContainer) {
                const li = document.createElement('li');
                li.innerHTML = `
                    <p><strong>${NameReingeschrieben}</strong>: ${item.description || 'Keine Beschreibung'}</p>
                    <button onclick="castVote('${id}', 'up')" aria-label="${NameReingeschrieben} bestätigen. Aktuell ${upVotes}">Stimmt (${upVotes})</button>
                    <button onclick="castVote('${id}', 'down')" aria-label="${NameReingeschrieben} ablehnen. Aktuell ${downVotes}">Stimmt nicht (${downVotes})</button>
                `;
                listContainer.appendChild(li);
            }
        });
    })
    .catch(err => console.error("Fehler beim Laden der Daten:", err));
}

// 6. Abstimmen
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

// Beim Start laden
loadObstacles();

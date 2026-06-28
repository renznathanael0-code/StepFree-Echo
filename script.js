const DB_URL = "https://stepfree-echo-default-rtdb.europe-west1.firebasedatabase.app/obstacles.json";
const BASE_URL = "https://stepfree-echo-default-rtdb.europe-west1.firebasedatabase.app/obstacles/";

if (!localStorage.getItem('user_voice_id')) {
    localStorage.setItem('user_voice_id', 'user_' + Math.random().toString(36).substring(2, 11));
}
const userId = localStorage.getItem('user_voice_id');

// Standardkoordinaten (Mitte von Deutschland) als Fallback fürs Testen ohne GPS
let userLatitude = 51.1657;
let userLongitude = 10.4515;
let hasRealGPS = false;

// Karte initialisieren
const map = L.map('map').setView([userLatitude, userLongitude], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

let userMarker = null;
let markerGroup = L.layerGroup().addTo(map);

// GPS Standortermittlung
if (navigator.geolocation) {
    navigator.geolocation.watchPosition((position) => {
        userLatitude = position.coords.latitude;
        userLongitude = position.coords.longitude;
        hasRealGPS = true;

        if (userMarker === null) {
            map.setView([userLatitude, userLongitude], 16);
            userMarker = L.circle([userLatitude, userLongitude], { color: 'blue', radius: 10 }).addTo(map);
        } else {
            userMarker.setLatLng([userLatitude, userLongitude]);
        }
    }, (err) => console.log("GPS wird gesucht oder verweigert. Nutze Kartenmitte."), { enableHighAccuracy: true });
}

// Sprachausgabe (Vorlesen)
function speak(text) {
    const announcer = document.getElementById('screenreader-announcer');
    if (announcer) announcer.textContent = text;
    window.speechSynthesis.cancel(); // Stoppt aktuelles Vorlesen, um sofort das Neue zu sagen
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    window.speechSynthesis.speak(utterance);
}

// --- VERBESSERTE SPRACHSTEUERUNG (AUTO-START & ENDLOS-MODUS) ---
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.continuous = true; // Höre fortlaufend zu
    recognition.interimResults = false;

    // AUTOMATISCHER START BEIM LADEN DER SEITE
    window.addEventListener('DOMContentLoaded', () => {
        recognition.start();
        document.getElementById('speech-status').textContent = "Sprachsteuerung aktiv (Dauerhören).";
        speak("Willkommen beim Hindernis-Melder. Die Sprachsteuerung ist aktiv. Sage zum Beispiel Baustelle, Beschreibung Loch im Boden, oder Speichern.");
    });

    // WICHTIG: Wenn der Browser das Zeitfenster schließt, startet sich die App sofort selbst neu!
    recognition.onend = () => {
        console.log("Erkennung beendet – starte automatisch neu...");
        recognition.start();
    };

    recognition.onresult = (event) => {
        const command = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        console.log("Erkannt:", command);

        // 1. Typ-Auswahl
        if (command.includes('baustelle')) {
            document.getElementById('obstacle-type').value = 'baustelle';
            speak("Kategorie Baustelle ausgewählt.");
        } else if (command.includes('bordstein') || command.includes('kante')) {
            document.getElementById('obstacle-type').value = 'hohe-kante';
            speak("Kategorie Hohe Bordsteinkante ausgewählt.");
        } else if (command.includes('leitsystem')) {
            document.getElementById('obstacle-type').value = 'kein-leitsystem';
            speak("Kategorie Fehlendes Blindenleitsystem ausgewählt.");
        } 
        
        // NEW: 2. KOMETAR / BESCHREIBUNG PER SPRACHE
        else if (command.includes('beschreibung')) {
            // Schneidet das Wort "beschreibung" ab und nimmt den Rest als Text
            const textAfterCommand = command.split('beschreibung')[1].trim();
            if (textAfterCommand) {
                document.getElementById('obstacle-desc').value = textAfterCommand;
                speak(`Beschreibung festgelegt auf: ${textAfterCommand}`);
            } else {
                speak("Bitte nenne eine Beschreibung nach dem Wort Beschreibung.");
            }
        } 
        
        // 3. Speichern
        else if (command.includes('speichern') || command.includes('senden')) {
            document.getElementById('submit-btn').click();
        }
    };
}

// 4. Daten an Firebase senden (POST)
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

    if (!hasRealGPS) {
        console.log("Speichere mit Test-Koordinaten, da kein GPS vorhanden.");
    }

    fetch(DB_URL, {
        method: 'POST',
        body: JSON.stringify(newObstacle)
    })
    .then(() => {
        speak("Erfolgreich in der Datenbank gespeichert.");
        document.getElementById('obstacle-form').reset();
        loadObstacles(); 
    })
    .catch(err => {
        speak("Fehler beim Speichern.");
        console.error(err);
    });
});

// 5. Daten laden & absichern against Crash
function loadObstacles() {
    fetch(DB_URL)
    .then(res => res.json())
    .then(data => {
        const listContainer = document.getElementById('obstacles-list');
        if (listContainer) listContainer.innerHTML = "";
        markerGroup.clearLayers();
        
        if (!data) return;

        Object.keys(data).forEach(id => {
            const item = data[id];
            if (!item || item.latitude === undefined || item.longitude === undefined) return;

            const upVotes = item.votedUp ? Object.keys(item.votedUp).length : 0;
            const downVotes = item.votedDown ? Object.keys(item.votedDown).length : 0;

            const typeNames = {
                'baustelle': 'Baustelle',
                'hohe-kante': 'Hohe Bordsteinkante',
                'kein-leitsystem': 'Fehlendes Blindenleitsystem'
            };
            const NameReingeschrieben = typeNames[item.type] || 'Hindernis';

            const marker = L.marker([item.latitude, item.longitude], {
                keyboard: true,
                title: `${NameReingeschrieben}. ${item.description || ''}. Stimmen dafür: ${upVotes}`
            });
            marker.bindPopup(`<b>${NameReingeschrieben}</b><br>${item.description || ''}`);
            markerGroup.addLayer(marker);

            if (listContainer) {
                const li = document.createElement('li');
                li.innerHTML = `
                    <p><strong>${NameReingeschrieben}</strong>: ${item.description || ''}</p>
                    <button onclick="castVote('${id}', 'up')" aria-label="Stimmt (${upVotes})">Stimmt (${upVotes})</button>
                    <button onclick="castVote('${id}', 'down')" aria-label="Stimmt nicht (${downVotes})">Stimmt nicht (${downVotes})</button>
                `;
                listContainer.appendChild(li);
            }
        });
    });
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

loadObstacles();

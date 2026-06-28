const DB_URL = "https://stepfree-echo-default-rtdb.europe-west1.firebasedatabase.app/obstacles.json";
const BASE_URL = "https://stepfree-echo-default-rtdb.europe-west1.firebasedatabase.app/obstacles/";

if (!localStorage.getItem('user_voice_id')) {
    localStorage.setItem('user_voice_id', 'user_' + Math.random().toString(36).substring(2, 11));
}
const userId = localStorage.getItem('user_voice_id');

let userLatitude = 51.1657;
let userLongitude = 10.4515;
let hasRealGPS = false;
let isAppAwake = false;
let awakeTimeout = null;

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
    }, (err) => console.log("GPS sucht..."), { enableHighAccuracy: true });
}

// 1. Die speak-Funktion leicht erweitern, damit sie uns bescheid gibt, wenn sie fertig ist
function speak(text, callback) {
    const announcer = document.getElementById('screenreader-announcer');
    if (announcer) announcer.textContent = text;
    
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    
    // Wenn ein Callback (eine Folge-Aktion) mitgegeben wurde, führe es am Ende aus
    if (callback) {
        utterance.onend = () => {
            callback();
        };
    }
    
    window.speechSynthesis.speak(utterance);
}

// 2. Die startApp-Funktion steuert das jetzt perfekt
function startApp() {
    if (splash.classList.contains('hidden')) return;

    splash.classList.add('hidden');
    appContent.classList.remove('hidden');

    setTimeout(() => { map.invalidateSize(); }, 200);

    // Wir übergeben initSpeechRecognition als "Befehl für danach"
    speak(
        "Willkommen bei Step Free Echo. Die App ist bereit. Rufe mich jederzeit mit dem Namen Echo.", 
        () => {
            // Dieser Block wird ERST ausgeführt, wenn der Punkt hinter "Echo" gesprochen wurde!
            initSpeechRecognition();
            console.log("Stimme fertig. Mikrofon ist jetzt absolut sicher aktiv.");
        }
    );
}
// SPRACHSTEUERUNG (ECHO AKTIVIERUNGSWORT)
function initSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'de-DE';
        recognition.continuous = true;
        recognition.interimResults = false;

        recognition.start();

        recognition.onend = () => {
            recognition.start(); // Endlos-Modus
        };

        recognition.onresult = (event) => {
            const command = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
            console.log("Gehört:", command);
            const statusText = document.getElementById('speech-status');

            // 1. Aufwecken mit "Echo"
            if (command.includes('echo')) {
                isAppAwake = true;
                statusText.textContent = "Zuhören aktiv...";
                speak("Ja? Ich höre.");
                
                clearTimeout(awakeTimeout);
                awakeTimeout = setTimeout(putToSleep, 12000); // 12 Sekunden Zeitfenster
                return;
            }

            // 2. Befehle verarbeiten (Nur wenn wach)
            if (isAppAwake) {
                // Timer bei jedem gesprochenen Wort erneuern
                clearTimeout(awakeTimeout);
                awakeTimeout = setTimeout(putToSleep, 12000);

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
                
                // Beschreibung via Sprache ("Beschreibung [Dein Text]")
                else if (command.includes('beschreibung')) {
                    const textAfterCommand = command.split('beschreibung')[1].trim();
                    if (textAfterCommand) {
                        document.getElementById('obstacle-desc').value = textAfterCommand;
                        speak(`Beschreibung festgelegt auf: ${textAfterCommand}`);
                    } else {
                        speak("Bitte nenne eine Beschreibung.");
                    }
                } 
                
                // Speichern
                else if (command.includes('speichern') || command.includes('senden')) {
                    document.getElementById('submit-btn').click();
                    putToSleep();
                }
            }
        };
    }
}

function putToSleep() {
    isAppAwake = false;
    document.getElementById('speech-status').textContent = "Warte auf Aktivierungswort...";
    speak("Ich schlafe wieder.");
    clearTimeout(awakeTimeout);
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

    fetch(DB_URL, { method: 'POST', body: JSON.stringify(newObstacle) })
    .then(() => {
        speak("Erfolgreich in StepFree Echo gespeichert.");
        document.getElementById('obstacle-form').reset();
        loadObstacles(); 
    });
});

// 5. Daten laden & absichern
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

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
let isVoiceSystemDisabled = false; 
let currentNearbyObstacles = [];   
let lastFetchedData = null; 

// Variablen für das geführte Sprach-Formular
let formStep = 0; // 0=Bereit, 1=Kategorie, 2=Beschreibung, 3=Speichern-Bestätigung, 4=Admin-Prüfung vor Ort
let tempType = "";
let tempDesc = "";
let activeCheckObstacleId = null; // ID des Hindernisses, das gerade vor Ort geprüft wird

// ==========================================
// 1. KARTEN-INITIALISIERUNG & STANDORT
// ==========================================
const map = L.map('map').setView([userLatitude, userLongitude], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

let markerGroup = L.layerGroup().addTo(map);
let userMarker = null;
let temporaryClickMarker = null; 

if (navigator.geolocation) {
    navigator.geolocation.watchPosition((position) => {
        userLatitude = position.coords.latitude;
        userLongitude = position.coords.longitude;

        if (!userMarker) {
            map.setView([userLatitude, userLongitude], 16);
            userMarker = L.circle([userLatitude, userLongitude], { color: '#00f2fe', fillColor: '#00f2fe', fillOpacity: 0.4, radius: 15 }).addTo(map);
        } else {
            userMarker.setLatLng([userLatitude, userLongitude]);
        }

        // Bei jeder Standortänderung Daten neu bewerten (wichtig für den automatischen 20m Admin-Check)
        if (lastFetchedData) {
            renderObstacles(lastFetchedData, false); 
        } else {
            loadObstacles(false);
        }
    }, (err) => console.log("GPS verzögert..."), { enableHighAccuracy: true });
}

map.on('click', function(e) {
    userLatitude = e.latlng.lat;
    userLongitude = e.latlng.lng;

    if (temporaryClickMarker) {
        map.removeLayer(temporaryClickMarker);
    }

    temporaryClickMarker = L.marker([userLatitude, userLongitude], { draggable: true }).addTo(map);

    isAppAwake = true;
    startGuidedForm();
});

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const point1 = L.latLng(lat1, lon1);
    const point2 = L.latLng(lat2, lon2);
    return point1.distanceTo(point2);
}

// ==========================================
// 2. RADIKALE SPRACHAUSGABE
// ==========================================
function speak(text, callback) {
    const announcer = document.getElementById('screenreader-announcer');
    if (announcer) announcer.textContent = text;

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
        if (isAppAwake && !isVoiceSystemDisabled && formStep === 0) {
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

    speak("App gestartet. Rufe mich mit dem Namen Echo.", () => {
        initSpeechRecognition();
    });
}

function startGuidedForm() {
    formStep = 1;
    tempType = "";
    tempDesc = "";
    speak("Geführtes Formular gestartet. Schritt 1: Bitte nenne die Kategorie. Baustelle, Bordstein oder Leitsystem?");
}

function resetGuidedForm() {
    formStep = 0;
    tempType = "";
    tempDesc = "";
    activeCheckObstacleId = null;
    if (temporaryClickMarker) {
        map.removeLayer(temporaryClickMarker);
        temporaryClickMarker = null;
    }
    document.getElementById('obstacle-form').reset();
}

// ==========================================
// 4. SPRACHSTEUERUNG (ZUSTANDSMASCHINE)
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

        // Globaler Abbruch-Befehl
        if (command.includes('abbrechen') || command.includes('stop')) {
            resetGuidedForm();
            speak("Eingabe abgebrochen.");
            putToSleep();
            return;
        }

        // Manueller Schlaf-Befehl
        if (command.includes('geh schlafen') || command === 'schlafen' || command.includes('gute nacht')) {
            resetGuidedForm();
            speak("Alles klar, ich lege mich schlafen.");
            putToSleep();
            return;
        }

        // Sprachsteuerung permanent ausschalten
        if (command.includes('ausschalten') || command.includes('deaktivieren')) {
            isVoiceSystemDisabled = true;
            isAppAwake = false;
            clearTimeout(awakeTimeout);
            if(statusBadge) statusBadge.style.backgroundColor = "#ef4444"; 
            if(statusText) statusText.textContent = "Sprachsteuerung offline.";
            speak("Sprachsteuerung wurde vollständig deaktiviert.");
            return;
        }

        // NEU: SPRACH-WEITERLEITUNG ZUR ANLEITUNG (help.html)
        if ((command.includes('hilfe') || command.includes('anleitung') || command.includes('handbuch')) && formStep === 0) {
            isAppAwake = true;
            speak("Öffne das akustische Handbuch.", () => {
                window.location.href = "help.html";
            });
            return;
        }

        // Aufwecken mit "Echo" (Nur wenn kein erzwungener Schritt aktiv ist)
        if (command.includes('echo') && formStep === 0) {
            isAppAwake = true;
            if(statusBadge) statusBadge.style.backgroundColor = "#00f2fe";
            if(statusText) statusText.textContent = "Zuhören aktiv...";
            
            if (command.includes('neu') || command.includes('eintragen') || command.includes('hindernis')) {
                startGuidedForm();
            } else {
                speak("Ja? Ich höre.");
            }
            return;
        }

        if (isAppAwake) {
            // SCHRITT 1: KATEGORIE ERFASSEN
            if (formStep === 1) {
                if (command.includes('baustelle')) {
                    tempType = 'baustelle';
                    document.getElementById('obstacle-type').value = 'baustelle';
                    formStep = 2;
                    speak("Kategorie Baustelle erfasst. Schritt 2: Bitte spreche die Beschreibung oder sage Überspringen.");
                } else if (command.includes('bordstein') || command.includes('kante')) {
                    tempType = 'hohe-kante';
                    document.getElementById('obstacle-type').value = 'hohe-kante';
                    formStep = 2;
                    speak("Kategorie Hohe Kante erfasst. Schritt 2: Bitte spreche die Beschreibung oder sage Überspringen.");
                } else if (command.includes('leitsystem')) {
                    tempType = 'kein-leitsystem';
                    document.getElementById('obstacle-type').value = 'kein-leitsystem';
                    formStep = 2;
                    speak("Kategorie Fehlendes Leitsystem erfasst. Schritt 2: Bitte spreche die Beschreibung oder sage Überspringen.");
                } else {
                    speak("Ich habe die Kategorie nicht verstanden. Bitte wähle: Baustelle, Bordstein oder Leitsystem.");
                }
                return;
            }

            // SCHRITT 2: BESCHREIBUNG ERFASSEN
            if (formStep === 2) {
                if (command === 'überspringen' || command === 'weiter' || command === 'keine' || command === 'nein' || command.includes('überspringen')) {
                    tempDesc = ""; 
                    document.getElementById('obstacle-desc').value = "";
                } else {
                    tempDesc = event.results[event.results.length - 1][0].transcript;
                    document.getElementById('obstacle-desc').value = tempDesc;
                }
                
                formStep = 3;
                const typeNames = { 'baustelle': 'Baustelle', 'hohe-kante': 'Hohe Bordsteinkante', 'kein-leitsystem': 'Fehlendes Blindenleitsystem' };
                
                if (tempDesc) {
                    speak(`Beschreibung erfasst: ${tempDesc}. Schritt 3: Möchtest du das Hindernis ${typeNames[tempType]} jetzt speichern? Antworte mit Ja oder Nein.`);
                } else {
                    speak(`Keine Beschreibung hinzugefügt. Schritt 3: Möchtest du das Hindernis ${typeNames[tempType]} jetzt speichern? Antworte mit Ja oder Nein.`);
                }
                return;
            }

            // SCHRITT 3: BESTÄTIGUNG UND SPEICHERN
            if (formStep === 3) {
                if (command.includes('ja') || command.includes('speichern') || command.includes('senden')) {
                    document.getElementById('obstacle-form').dispatchEvent(new Event('submit'));
                } else if (command.includes('nein') || command.includes('falsch')) {
                    resetGuidedForm();
                    speak("Eintrag gelöscht. Wir starten von vorn. Schritt 1: Bitte nenne die Kategorie.");
                    formStep = 1;
                } else {
                    speak("Bitte antworte mit Ja zum Speichern oder Nein zum Korrigieren.");
                }
                return;
            }

            // NEU: SCHRITT 4 — AUTOMATISCHE ABFRAGE VOR ORT (20m Radius vom Admin initiiert)
            if (formStep === 4 && activeCheckObstacleId) {
                if (command.includes('ja') || command.includes('stimmt') || command.includes('bestätigen') || command === 'existiert') {
                    window.castVote(activeCheckObstacleId, 'up');
                    resetGuidedForm();
                    speak("Vielen Dank für deine Hilfe. Ich habe eingecheckt und den Punkt für das System bestätigt.");
                    putToSleep();
                } else if (command.includes('nein') || command.includes('falsch') || command.includes('nicht') || command === 'frei') {
                    window.castVote(activeCheckObstacleId, 'down');
                    resetGuidedForm();
                    speak("Alles klar, danke. Ich habe registriert, dass der Weg hier frei ist.");
                    putToSleep();
                } else {
                    speak("Ich brauche deine Bestätigung vor Ort. Antworte bitte einfach mit Ja oder Nein.");
                }
                return;
            }

            // NORMALE BEFEHLE
            if (formStep === 0) {
                if (command.includes('umgebung') || command.includes('hindernisse')) {
                    if (currentNearbyObstacles.length > 0) {
                        let text = `Es gibt ${currentNearbyObstacles.length} Hindernisse in deiner Nähe. `;
                        currentNearbyObstacles.forEach((obs, index) => { text += `Nummer ${index + 1}: ${obs.text}. `; });
                        speak(text);
                    } else {
                        speak("Es befinden sich keine Hindernisse im Umkreis von 50 Metern.");
                    }
                    return;
                }

                if (command.includes('nummer') || command.includes('hindernis nummer')) {
                    const numberMap = { 'eins': 1, '1': 1, 'zwei': 2, '2': 2, 'drei': 3, '3': 3, 'vier': 4, '4': 4, 'fünf': 5, '5': 5 };
                    let targetIndex = null;
                    Object.keys(numberMap).forEach(key => { if (command.includes(key)) targetIndex = numberMap[key] - 1; });

                    if (targetIndex !== null && currentNearbyObstacles[targetIndex]) {
                        const obstacleId = currentNearbyObstacles[targetIndex].id;
                        if (command.includes('stimmt') || command.includes('bestätigen') || command.includes('ja')) {
                            window.castVote(obstacleId, 'up');
                        } else if (command.includes('nicht') || command.includes('ablehnen') || command.includes('falsch')) {
                            window.castVote(obstacleId, 'down');
                        }
                        isAppAwake = false;
                        return;
                    }
                }
            }
        }
    };

    try { recognition.start(); } catch(e) {}
}

function putToSleep() {
    if (isVoiceSystemDisabled || formStep > 0) return; 
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
        status: "pending", 
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
        resetGuidedForm();
        loadObstacles(false); 
    })
    .catch(err => {
        speak("Fehler beim Speichern.");
        console.error(err);
    });
});

// ==========================================
// 6. DATEN AUS DATENBANK LADEN & DARSTELLEN
// ==========================================
function loadObstacles(triggerVoiceWarning = true) {
    fetch(DB_URL)
    .then(res => res.json())
    .then(data => {
        lastFetchedData = data; 
        renderObstacles(data, triggerVoiceWarning); 
    }).catch(e => console.log(e));
}

function renderObstacles(data, triggerVoiceWarning) {
    const listContainer = document.getElementById('obstacles-list');
    if (listContainer) listContainer.innerHTML = "";
    markerGroup.clearLayers();
    
    if (!data) {
        currentNearbyObstacles = [];
        return;
    }

    let obstaclesNearby = [];
    let activeUrgentCheck = null;

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

        if (item.status === "user_check_requested" && distance <= 20 && formStep === 0) {
            activeUrgentCheck = {
                id: id,
                text: `${NameReingeschrieben}. ${item.description || ''}`
            };
        }

        if (distance <= 50) {
            obstaclesNearby.push({
                id: id,
                text: `${NameReingeschrieben} in ${distance} Metern Entfernung. ${item.description || ''}`
            });
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

    currentNearbyObstacles = obstaclesNearby;

    if (activeUrgentCheck && !isVoiceSystemDisabled) {
        formStep = 4;
        isAppAwake = true;
        activeCheckObstacleId = activeUrgentCheck.id;
        
        const statusBadge = document.querySelector('.status-dot');
        if(statusBadge) statusBadge.style.backgroundColor = "#ef4444"; 

        speak(`Wichtige Überprüfung vor Ort. Du befindest dich direkt an einem gemeldeten Hindernis: ${activeUrgentCheck.text}. Bitte hilf mit und checke ein. Existiert dieses Hindernis aktuell? Antworte mit Ja oder Nein.`);
        return; 
    }

    if (triggerVoiceWarning && obstaclesNearby.length > 0 && !isVoiceSystemDisabled && formStep === 0) {
        let warningText = `Achtung, es gibt ${obstaclesNearby.length} Hindernisse im Umkreis von 50 Metern. `;
        obstaclesNearby.forEach((obs, index) => {
            warningText += `Nummer ${index + 1}: ${obs.text}. `;
        });
        speak(warningText);
    }
}

// ==========================================
// 7. VOTING-SYSTEM & AUTOMATISCHE LOGIKEN
// ==========================================
window.castVote = function(id, type) {
    fetch(`${BASE_URL}${id}.json`)
    .then(res => res.json())
    .then(item => {
        if (!item) return;
        let votedUp = item.votedUp || {};
        let votedDown = item.votedDown || {};

        if (type === 'up') {
            if (votedUp[userId]) { delete votedUp[userId]; speak("Stimme zurückgezogen."); }
            else { votedUp[userId] = true; delete votedDown[userId]; speak("Als existent bestätigt."); }
        } else {
            if (votedDown[userId]) { delete votedDown[userId]; speak("Stimme zurückgezogen."); }
            else { votedDown[userId] = true; delete votedUp[userId]; speak("Als nicht existent markiert."); }
        }

        const finalUp = Object.keys(votedUp).length;
        const finalDown = Object.keys(votedDown).length;
        let finalStatus = item.status || "pending";

        if (finalUp >= 3) {
            finalStatus = "verified";
        }
        if ((finalUp - finalDown) <= -3) {
            finalStatus = "flagged_for_review";
        }

        fetch(`${BASE_URL}${id}.json`, {
            method: 'PATCH',
            body: JSON.stringify({
                votedUp: votedUp,
                votedDown: votedDown,
                status: finalStatus
            })
        }).then(() => loadObstacles(false));
    });
};

loadObstacles(true);

// 1. FIREBASE CONFIGURATION mit deiner Realtime Database URL
const firebaseConfig = {
    apiKey: "DEIN_API_KEY", // Musst du noch aus der Konsole holen
    authDomain: "stepfree-echo.firebaseapp.com",
    databaseURL: "https://stepfree-echo-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "stepfree-echo",
    storageBucket: "stepfree-echo.appspot.com",
    messagingSenderId: "DEINE_SENDER_ID", // Aus der Konsole holen
    appId: "DEINE_APP_ID" // Aus der Konsole holen
};

// Firebase initialisieren
firebase.initializeApp(firebaseConfig);
const db = firebase.database(); // Jetzt als Realtime Database
const auth = firebase.auth();

let currentUserUid = null;
let userLatitude = null;
let userLongitude = null;

// Anonyme Anmeldung
auth.signInAnonymously()
    .then((userCredential) => {
        currentUserUid = userCredential.user.uid;
        console.log("Anonym eingeloggt mit ID:", currentUserUid);
        loadObstacles();
    })
    .catch((error) => { console.error("Login Fehler:", error); });

// [HINWEIS: Abschnitte 2, 3 und 4 (GPS und Sprache) bleiben genau wie vorher!]

// 5. HINDERNIS IN REALTIME DATABASE SPEICHERN
document.getElementById('obstacle-form').addEventListener('submit', function(e) {
    e.preventDefault();

    if (!userLatitude || !userLongitude) {
        speak("Fehler: Es gibt noch kein GPS-Signal. Bitte warten Sie kurz.");
        return;
    }

    const type = document.getElementById('obstacle-type').value;
    const desc = document.getElementById('obstacle-desc').value;

    // Neuen Eintrag in "obstacles" erstellen
    const newObstacleRef = db.ref("obstacles").push();
    
    newObstacleRef.set({
        type: type,
        description: desc,
        latitude: userLatitude,
        longitude: userLongitude,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        createdBy: currentUserUid,
        votedUp: {},   // In RTDB nutzen wir Objekte statt Arrays für UIDs
        votedDown: {}
    })
    .then(() => {
        speak("Erfolgreich gespeichert. Das Hindernis wurde auf der Karte eingetragen.");
        document.getElementById('obstacle-form').reset();
    })
    .catch((error) => {
        console.error("Datenbankfehler:", error);
        speak("Fehler beim Speichern in der Datenbank.");
    });
});

// 6. HINDERNISSE AUSLESEN UND LISTE AKTUALISIEREN
function loadObstacles() {
    db.ref("obstacles").orderByChild("timestamp").on("value", (snapshot) => {
        const listContainer = document.getElementById('obstacles-list');
        listContainer.innerHTML = ""; 

        if (!snapshot.exists()) {
            listContainer.innerHTML = "<li>Keine Hindernisse in der Nähe gemeldet.</li>";
            return;
        }

        // Einträge sammeln, um sie umzudrehen (neueste oben)
        const items = [];

        snapshot.forEach((childSnapshot) => {
            const id = childSnapshot.key;
            const data = childSnapshot.val();
            
            // Stimmen zählen (Anzahl der Keys im Objekt)
            const upVotes = data.votedUp ? Object.keys(data.votedUp).length : 0;
            const downVotes = data.votedDown ? Object.keys(data.votedDown).length : 0;

            const typeNames = {
                'baustelle': 'Baustelle',
                'kein-leitsystem': 'Fehlendes Blindenleitsystem',
                'hohe-kante': 'Hohe Bordsteinkante',
                'sonstiges': 'Sonstiges Hindernis'
            };

            const li = document.createElement('li');
            li.className = "obstacle-item";
            li.innerHTML = `
                <p><strong>${typeNames[data.type] || 'Unbekannt'}</strong>: ${data.description || 'Keine Beschreibung'}</p>
                <div class="voting-buttons">
                    <button onclick="castVote('${id}', 'up')" aria-label="Bestätigen: Dieses Hindernis existiert. Aktuelle Stimmen: ${upVotes}">
                        Stimmt (${upVotes})
                    </button>
                    <button onclick="castVote('${id}', 'down')" aria-label="Ablehnen: Existiert nicht mehr. Aktuelle Stimmen: ${downVotes}">
                        Stimmt nicht (${downVotes})
                    </button>
                </div>
            `;
            items.push(li);
        });

        // Neueste Meldungen oben anzeigen
        items.reverse().forEach(li => listContainer.appendChild(li));
    });
}

// 7. DAS VOTING-SYSTEM (Echtzeit & Sicher)
window.castVote = function(id, voteType) {
    if (!currentUserUid) return;

    const obstacleRef = db.ref("obstacles/" + id);

    obstacleRef.once("value").then((snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.val();

        let votedUp = data.votedUp || {};
        let votedDown = data.votedDown || {};

        const hasVotedUp = votedUp[currentUserUid] === true;
        const hasVotedDown = votedDown[currentUserUid] === true;

        if (voteType === 'up') {
            if (hasVotedUp) {
                delete votedUp[currentUserUid];
                speak("Ihre Bestätigung wurde zurückgezogen.");
            } else {
                votedUp[currentUserUid] = true;
                delete votedDown[currentUserUid]; // Gegenstimme entfernen
                speak("Sie haben das Hindernis bestätigt.");
            }
        } else if (voteType === 'down') {
            if (hasVotedDown) {
                delete votedDown[currentUserUid];
                speak("Ihre Ablehnung wurde zurückgezogen.");
            } else {
                votedDown[currentUserUid] = true;
                delete votedUp[currentUserUid]; // Befürwortung entfernen
                speak("Sie haben angegeben, dass das Hindernis nicht mehr existiert.");
            }
        }

        // In Firebase überschreiben
        return obstacleRef.update({
            votedUp: votedUp,
            votedDown: votedDown
        });
    });
};
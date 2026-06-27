// Screenreader-Sprachausgabe (Text-to-Speech)
function speak(text) {
    const announcer = document.getElementById('screenreader-announcer');
    announcer.textContent = text; // Für Screenreader via aria-live

    // Native Sprachausgabe des Browsers aktivieren
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    window.speechSynthesis.speak(utterance);
}

// Sprachsteuerung (Speech-to-Text) einrichten
const startBtn = document.getElementById('start-speech');
const statusText = document.getElementById('speech-status');

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = false;

    startBtn.addEventListener('click', () => {
        recognition.start();
        statusText.textContent = "Sprachsteuerung aktiv. Sprechen Sie jetzt.";
        speak("Sprachsteuerung aktiviert. Sie können jetzt Befehle sprechen.");
    });

    recognition.onresult = function(event) {
        const command = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        console.log("Erkannter Befehl:", command);
        
        handleVoiceCommand(command);
    };

    recognition.onerror = function() {
        statusText.textContent = "Fehler bei der Spracherkennung.";
        speak("Entschuldigung, ich habe dich nicht verstanden.");
    };
} else {
    statusText.textContent = "Sprachsteuerung wird von diesem Browser nicht unterstützt.";
}

// Sprachbefehle verarbeiten
function handleVoiceCommand(command) {
    // Befehl: Hindernis auswählen
    if (command.includes('baustelle')) {
        document.getElementById('obstacle-type').value = 'baustelle';
        speak("Baustelle ausgewählt.");
    } 
    else if (command.includes('bordstein') || command.includes('kante')) {
        document.getElementById('obstacle-type').value = 'hohe-kante';
        speak("Hohe Bordsteinkante ausgewählt.");
    }
    // Befehl: Speichern
    else if (command.includes('speichern') || command.includes('senden')) {
        document.getElementById('submit-btn').click();
    }
    else {
        speak("Befehl " + command + " nicht erkannt. Versuche es mit: Baustelle, Bordsteinkante oder Speichern.");
    }
}

// Formular-Submit abfangen (Hier kommt später Firebase ins Spiel)
document.getElementById('obstacle-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const type = document.getElementById('obstacle-type').value;
    const desc = document.getElementById('obstacle-desc').value;

    // Simulation: Erfolgsmeldung
    speak(`Erfolgreich gespeichert. Hindernis vom Typ ${type} wurde registriert.`);
    
    // Formular zurücksetzen
    this.reset();
});

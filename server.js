require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const nodemailer = require('nodemailer');
const path = require('path');
const { Contact, Analysis, initDatabase } = require('./database');

// Express App initialisieren
const app = express();

// CORS konfigurieren
app.use(cors({
    origin: 'https://clearself.ai',
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Origin'],
}));

// Body Parser Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Debug Middleware
app.use((req, res, next) => {
    if (req.method === 'POST') {
        console.log('Request Headers:', req.headers);
        console.log('Request Body:', req.body);
    }
    next();
});

// OpenAI Setup
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Email Transporter Setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

// Datenbank beim Start initialisieren
initDatabase();

// Test E-Mail-Konfiguration
transporter.verify(function (error, success) {
    if (error) {
        console.log('E-Mail-Konfigurationsfehler:', error);
    } else {
        console.log('Server ist bereit, E-Mails zu versenden');
    }
});

// Hauptendpunkt für die Analyse
app.post('/api/analyze', async (req, res) => {
    console.log('\n==== NEUE ANALYSE ANFRAGE ====');
    console.log('Eingegangene Daten:', req.body);
    
    try {
        const { email, situation } = req.body;
        
        console.log('1. Prüfe Eingaben...');
        if (!email || !situation) {
            console.log('Fehler: Fehlende Eingaben');
            return res.status(400).json({ 
                error: 'E-Mail und Situation sind erforderlich',
                received: { email: !!email, situation: !!situation }
            });
        }

        console.log('2. Starte OpenAI Analyse...');
        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [{
                    role: "system",
                    content: `Der Output ist schon deutlich besser als die erste Version, aber hat immer noch Optimierungspotential. Lass uns analysieren:

Positiv:
1. Die Glaubenssätze sind jetzt tiefer und existenzieller
2. Der erste Glaubenssatz verbindet Leistung mit Selbstwert
3. Die Struktur nach Gray ist erkennbar:
   - Konkrete Erfahrungen werden genannt
   - Annahmen werden erläutert
   - Der Weg zum Glaubenssatz wird nachvollziehbar

Verbesserungswürdig:
1. Der Text bricht wieder ab vor der entscheidenden neuen Perspektive
2. Die Gegenbeispiele sind zu abstrakt ("Menschen, die dich schätzen")
3. Die Transformation bleibt unvollständig

Lass uns den Prompt ein letztes Mal optimieren:

```markdown
Du bist ein Experte für transformative Glaubenssatzarbeit nach Grays Methode. Deine besondere Stärke liegt darin, die exakte kognitive Struktur aufzudecken, die zur Bildung limitierender Glaubenssätze führt.

Analysiere das Problem und identifiziere die 3 tiefsten Kernglaubenssätze. Fokussiere auf:
- Die Verbindung zwischen Leistung und Existenzwert
- Grundängste um Sicherheit und Überleben
- Das fundamentale Selbstbild

Liste sie so:
1. [Tiefster Kernglaubenssatz in Ich-Form]
2. [Zweittiefster Kernglaubenssatz in Ich-Form]
3. [Dritttiefster Kernglaubenssatz in Ich-Form]
(Weitere Kernmuster identifiziert)

Wähle den Glaubenssatz mit dem größten Transformationspotential. 

WICHTIG: Halte den folgenden Auflösungsprozess SEHR KURZ, damit er vollständig im Token-Limit bleibt. Schreibe einen fließenden Text OHNE Überschriften:

1. Nenne ZWEI konkrete, spezifische Erfahrungen/Beobachtungen (max. 2-3 Sätze)

2. Beschreibe die ZWEI wichtigsten Annahmen, die daraus gezogen wurden (max. 2 Sätze)

3. Zeige in EINEM Satz, wie diese Annahmen zum Glaubenssatz führten

4. Biete ZWEI konkrete, spezifische Gegenbeispiele (max. 2 Sätze)

5. Präsentiere die neue Perspektive in max. 3 Sätzen
- Eine neue Interpretation der ursprünglichen Erfahrungen
- Eine ermächtigende Schlussfolgerung
- Eine befreiende neue Wahrheit

Ende mit: "Wie fühlt sich diese neue Erkenntnis für dich an?"

Der Text muss wie eine fließende Mini-Geschichte wirken, die genau der natürlichen Entstehung und Auflösung von Glaubenssätzen folgt.'
`
                }, {
                    role: "user",
                    content: situation
                }],
                temperature: 0.7,
                max_tokens: 500
            });

            const analysis = completion.choices[0].message.content;
            console.log('3. Analyse erstellt');

            // In Datenbank speichern
            console.log('4. Speichere in Datenbank...');
            try {
                let [contact] = await Contact.findOrCreate({
                    where: { email },
                    defaults: { status: 'active' }
                });

                await Analysis.create({
                    situation,
                    analysis,
                    ContactId: contact.id
                });
                console.log('Datenbankspeiicherung erfolgreich');
            } catch (dbError) {
                console.error('Datenbankfehler:', dbError);
                return res.status(500).json({ 
                    error: 'Datenbankfehler',
                    details: dbError.message
                });
            }

            console.log('5. Sende E-Mail...');
            try {
                await transporter.sendMail({
                    from: process.env.GMAIL_USER,
                    to: email,
                    subject: "Ihre ClearSelf Scanner Analyse",
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #0f766e;">Ihre persönliche ClearSelf Analyse</h2>
                            <p>Vielen Dank für Ihr Vertrauen in den ClearSelf Scanner. Hier ist Ihre individuelle Analyse:</p>
                            <div style="background: #f5f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                ${analysis.replace(/\n/g, '<br>')}
                            </div>
                            <p style="color: #666;">
                                <small>
                                    Diese Analyse wurde mit Hilfe von KI erstellt und ersetzt keine professionelle therapeutische Beratung.
                                    Bei ernsthaften Anliegen wenden Sie sich bitte an entsprechende Fachkräfte.
                                </small>
                            </p>
                        </div>
                    `
                });
                console.log('E-Mail erfolgreich gesendet');
            } catch (emailError) {
                console.error('E-Mail-Fehler:', emailError);
                return res.status(500).json({ 
                    error: 'E-Mail konnte nicht gesendet werden',
                    details: emailError.message
                });
            }

            console.log('6. Anfrage erfolgreich abgeschlossen');
            return res.json({ 
                success: true, 
                message: 'Analyse wurde erfolgreich durchgeführt und per E-Mail versandt'
            });

        } catch (openaiError) {
            console.error('OpenAI Fehler:', openaiError);
            return res.status(500).json({ 
                error: 'Fehler bei der KI-Analyse',
                details: openaiError.message
            });
        }

    } catch (error) {
        console.error('\nHAUPTFEHLER:', error);
        return res.status(500).json({ 
            error: 'Ein unerwarteter Fehler ist aufgetreten',
            details: error.message
        });
    }
});

// Endpunkt zum Abrufen der Kontakte
app.get('/api/contacts', async (req, res) => {
    try {
        const contacts = await Contact.findAll({
            include: [{
                model: Analysis,
                attributes: ['createdAt']
            }],
            order: [['createdAt', 'DESC']]
        });

        const formattedContacts = contacts.map(contact => ({
            id: contact.id,
            email: contact.email,
            status: contact.status,
            created_at: contact.createdAt,
            analysis_count: contact.Analyses.length,
            last_analysis: contact.Analyses.length > 0 ? 
                contact.Analyses[contact.Analyses.length - 1].createdAt : null
        }));

        res.json(formattedContacts);
    } catch (error) {
        console.error('Fehler beim Abrufen der Kontakte:', error);
        res.status(500).json({ error: 'Fehler beim Abrufen der Kontakte' });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.clear();
    console.log('\n=== SERVER ERFOLGREICH GESTARTET ===');
    console.log(`Zeit: ${new Date().toISOString()}`);
    console.log(`Server läuft auf: http://localhost:${PORT}`);
    console.log('\nEnvironment Check:');
    console.log('- OpenAI Key:', !!process.env.OPENAI_API_KEY);
    console.log('- Gmail Setup:', !!process.env.GMAIL_USER && !!process.env.GMAIL_APP_PASSWORD);
    console.log('- Database URL:', !!process.env.DATABASE_URL);
    console.log('\nWarte auf Anfragen...');
});
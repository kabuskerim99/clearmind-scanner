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
                    content: `Du bist ein außergewöhnlich einfühlsamer Experte für transformative Glaubenssatzarbeit, spezialisiert darauf, die tiefsten emotionalen Kernmuster zu erkennen und Menschen zu echten Durchbrüchen zu verhelfen.

Analysiere das folgende Problem und identifiziere die 3 limitierenden Kernglaubenssätze, die das größte Potenzial für emotionale Erleichterung und persönliche Transformation bergen. Konzentriere dich dabei auf:

- Glaubenssätze, die starke emotionale Reaktionen auslösen
- Muster, die sich durch verschiedene Lebensbereiche ziehen
- Überzeugungen, die fundamentale Existenzängste berühren

Liste die Glaubenssätze so:
1. [Erster Glaubenssatz in Ich-Form]
2. [Zweiter Glaubenssatz in Ich-Form]
3. [Dritter Glaubenssatz in Ich-Form]
(Weitere transformative Glaubensmuster identifiziert)

Wähle dann den Glaubenssatz aus, der das größte Potenzial für unmittelbare emotionale Erleichterung bietet. Führe einen sanften, aber transformativen Dialog:

Beginne mit tiefem Verständnis für den emotionalen Schmerz hinter dem Glaubenssatz. Zeige dann behutsam auf, wie frühe Erfahrungen zu dieser schützenden aber einschränkenden Überzeugung führten. Öffne sanft den Blick für eine neue, befreiende Perspektive, die sofort emotional spürbar ist. Nutze dabei bildhafte Sprache und berührende Metaphern. 

Der Text soll fließend sein, ohne Struktur oder Überschriften, wie ein heilsames Gespräch. Schließe mit: "Wie fühlt sich diese neue Perspektive in deinem Herzen an?"

Wichtig: Fokussiere auf unmittelbare emotionale Erleichterung und echte Aha-Momente statt auf intellektuelles Verstehen. Beispiel auflösung: ir konzentrieren uns jetzt auf den Glaubenssatz "Wenn ich ein Athlet bin, werde ich arrogant und besessen."

Erfahrungen und Beobachtungen:

Vielleicht hast du in der Vergangenheit Menschen erlebt, die sich durch ihren sportlichen Erfolg verändert haben. Vielleicht hast du Freunde gesehen, die, nachdem sie intensiv Sport getrieben haben, arrogant wurden oder sich nur noch auf ihren Sport konzentriert haben. Diese Veränderungen könnten dich enttäuscht oder verletzt haben.

Annahmen:

Aus diesen Erfahrungen hast du möglicherweise die Annahme getroffen, dass Sport Menschen zwangsläufig negativ verändert. Du könntest glauben, dass intensives Training und sportlicher Erfolg automatisch zu Arroganz und Besessenheit führen.

Schlussfolgerungen:

Diese Annahmen könnten zu dem Glaubenssatz geführt haben: "Wenn ich ein Athlet bin, werde ich arrogant und besessen." Du befürchtest, deine eigenen Werte zu verlieren und dich in eine Person zu verwandeln, die du nicht sein möchtest.

Hinterfragen der Überzeugung:

Aber was wäre, wenn sportliche Betätigung nicht zwangsläufig zu Arroganz führt? Könnte es sein, dass es Menschen gibt, die trotz ihres sportlichen Engagements bescheiden und ausgeglichen bleiben? Vielleicht liegt es nicht am Sport selbst, sondern daran, wie jeder Einzelne damit umgeht.

Neue Perspektive (auf Basis von Grays Prozess):

Vielleicht könntest du dir vorstellen, dass Sport eine Gelegenheit bietet, dich selbst auf vielfältige Weise zu entfalten. Angenommen, du hättest erlebt, dass Menschen den Sport in ihr Leben integrieren, ohne dabei andere wichtige Aspekte zu vernachlässigen. Was wäre, wenn du erkannt hättest, dass es möglich ist, leidenschaftlich Sport zu treiben und dennoch ein ausgewogenes Leben zu führen?

Mit dieser Unterstützung hättest du vielleicht die Annahme getroffen, dass du den Sport auf deine eigene Weise ausüben kannst, ohne deine Persönlichkeit zu verlieren. Du hättest erkannt, dass du Kontrolle darüber hast, wer du bist und wie du dich entwickelst.

Daraus hättest du schlussfolgern können, dass du dich als Athlet identifizieren kannst, ohne arrogant oder besessen zu werden. Dein neuer Glaubenssatz könnte lauten: "Ich kann ein Athlet sein und dabei meine Authentizität und Bescheidenheit bewahren."

Abschluss und Reflexion:

Wie fühlst du dich jetzt in Bezug auf diesen neuen Blickwinkel? Wichtig: Der gesamte Auflösungsprozess soll als ein zusammenhängender, therapeutischer Dialog erscheinen, ohne sichtbare Strukturierung oder Überschriften. Der Text soll natürlich fließen und eine vertrauensvolle, heilsame Atmosphäre schaffen.'
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
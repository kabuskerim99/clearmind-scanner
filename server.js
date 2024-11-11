require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const nodemailer = require('nodemailer');
const path = require('path');
const { Contact, Analysis, initDatabase } = require('./database');

// Express App initialisieren
const app = express();

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// CORS konfigurieren
app.use(cors({
    origin: ['https://clearself.ai', 'https://www.clearself.ai'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Origin', 'Authorization'],
    credentials: false,
    maxAge: 86400
}));

// Pre-flight requests
app.options('*', cors());

// Body Parser Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Debug Middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`, req.params);
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

// Helfer-Funktion für Token-Generierung
function generateToken() {
    return require('crypto').randomBytes(32).toString('hex');
}

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

        // Token generieren
        const confirmationToken = generateToken();

        // Kontakt erstellen oder finden
        let [contact] = await Contact.findOrCreate({
            where: { email },
            defaults: { 
                status: 'pending',
                confirmationToken
            }
        });

        // Wenn der Kontakt bereits existiert aber noch nicht bestätigt ist
        if (contact.status === 'pending') {
            contact.confirmationToken = confirmationToken;
            await contact.save();
        }

        // Analyse erstellen
        const analysis = await Analysis.create({
            situation,
            analysis: null,
            ContactId: contact.id,
            status: 'pending'
        });

        // Bestätigungs-E-Mail senden
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: email,
            subject: "Bitte bestätigen Sie Ihre ClearSelf Analyse",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #0f766e;">Bestätigen Sie Ihre E-Mail-Adresse</h2>
                    <p>Vielen Dank für Ihr Interesse an einer ClearSelf Analyse.</p>
                    <p>Um Ihre Analyse zu erhalten, bestätigen Sie bitte Ihre E-Mail-Adresse:</p>
                    <p style="margin: 30px 0;">
                        <a href="https://clear-mind-scanner.onrender.com/api/confirm/${confirmationToken}" 
                           style="background: #0f766e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                            Analyse jetzt anfordern
                        </a>
                    </p>
                    <p style="color: #666; font-size: 0.9em;">
                        Wenn Sie diese Analyse nicht angefordert haben, können Sie diese E-Mail ignorieren.
                    </p>
                </div>
            `
        });

        res.json({ 
            success: true, 
            message: 'Bitte bestätigen Sie Ihre E-Mail-Adresse. Sie erhalten gleich eine E-Mail von uns.'
        });

    } catch (error) {
        console.error('\nHAUPTFEHLER:', error);
        res.status(500).json({ 
            error: 'Ein Fehler ist aufgetreten', 
            details: error.message 
        });
    }
});

// Bestätigungs-Endpunkt
app.get('/api/confirm/:token', async (req, res) => {
    try {
        const { token } = req.params;
        console.log('Bestätigungsversuch für Token:', token);
        
        const contact = await Contact.findOne({
            where: { confirmationToken: token }
        });

        if (!contact) {
            console.log('Token nicht gefunden');
            return res.status(400).send('Ungültiger Bestätigungslink.');
        }

        if (contact.status === 'active') {
            console.log('Kontakt bereits aktiv');
            return res.send(`
                <html>
                    <head>
                        <style>
                            body { font-family: Arial; margin: 40px; text-align: center; }
                            .info { color: #0f766e; }
                        </style>
                    </head>
                    <body>
                        <h1 class="info">Diese E-Mail wurde bereits bestätigt</h1>
                        <p>Ihre Analyse sollte bereits per E-Mail bei Ihnen eingegangen sein.</p>
                        <p>Falls nicht, kontaktieren Sie uns bitte unter: info@clearself.ai</p>
                        <p><a href="https://clearself.ai">Zurück zur Website</a></p>
                    </body>
                </html>
            `);
        }

        // Kontakt aktivieren
        contact.status = 'active';
        contact.confirmedAt = new Date();
        await contact.save();

        // Ausstehende Analyse finden
        let pendingAnalysis = await Analysis.findOne({
            where: { 
                ContactId: contact.id,
                status: 'pending'
            }
        });

        if (!pendingAnalysis) {
            console.log('Keine ausstehende Analyse gefunden');
            return res.status(400).send('Keine ausstehende Analyse gefunden.');
        }

        try {
            // OpenAI Analyse durchführen
            const completion = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [{
                    role: "system",
                    content: `Du bist ein Experte für transformative Glaubenssatzarbeit nach Gray's Modell.

GLAUBENSSATZ-IDENTIFIKATION:
Erkenne die 3 tiefsten existenziellen Glaubenssätze, die folgende Themen berühren:
- Existenzberechtigung/Selbstwert
- Fundamentale Sicherheit/Überleben 
- Macht/Ohnmacht im Leben

AUFLÖSUNGSPROZESS NACH GRAY:
Wähle den Glaubenssatz mit dem größten Transformationspotential.
Folge dann exakt dieser Struktur, wie Glaubenssätze im menschlichen Gehirn entstehen und sich auflösen:

1. ERFAHRUNGEN & BEOBACHTUNGEN:
"Vielleicht erinnerst du dich an [frühe Erfahrung], als du [Gefühl/Situation]. Diese Gefühle tauchten später wieder auf, als [spätere Erfahrung]."

2. ANNAHMEN AUS DIESEN ERFAHRUNGEN:
"Aus diesen Erlebnissen hast du den Schluss gezogen, dass [logische Annahme]. Diese Interpretation erschien damals als einziger Weg, die Situation zu verstehen."

3. WEG ZUM GLAUBENSSATZ:
"Diese Annahmen formten sich zu der tiefen Überzeugung: [Glaubenssatz]."

4. KONKRETE GEGENBEISPIELE:
"Doch erinnere dich an [spezifische Situation], wo du [Gegenbeweis]. Oder an die Zeit, als [weiteres konkretes Beispiel]."

5. NEUE PERSPEKTIVE:
"Was du damals als [alte Deutung] erlebt hast, kannst du heute als [neue Deutung] erkennen. Du bist nicht mehr [alte Identität] - du hast die Fähigkeit entwickelt, [neue Stärke/Möglichkeit]."

BEISPIEL FÜR OPTIMALE UMSETZUNG:
"Aus deiner Situation erkenne ich diese drei fundamentalen Glaubenssätze:

1. 'Um existieren zu dürfen, muss ich mich unterdrücken lassen'
2. 'Ohne einen Job bin ich wertlos und verloren'
3. 'Ich habe keine Kontrolle oder Macht über meine Lebensumstände'

Der erste Glaubenssatz hat das größte Transformationspotential:

Vielleicht erinnerst du dich an frühe Erfahrungen in deiner Kindheit, als du dich vor erwachsenen Autoritäten klein und machtlos gefühlt hast. Diese Gefühle der Ohnmacht haben sich später in deinem Arbeitsleben manifestiert, wo du dich unter dem Druck deines Chefs als Sklave fühlst.

Die Schlussfolgerung, die du aus diesen Erfahrungen gezogen hast, war, dass du dich unterdrücken lassen musst, um anerkannt und akzeptiert zu werden. Dies wurde zu deinem grundlegenden Glaubenssatz.

Aber denk an die Momente, in denen du dich gegen diese Unterdrückung gewehrt hast - wie die Zeiten, in denen du erfolgreich für deine Rechte eingetreten bist. Oder an Situationen, in denen du trotz des Drucks deines Chefs hervorragende Arbeit geleistet hast.

Diese Glaubenssätze sind nicht in Stein gemeißelt. Du bist nicht länger das kleine Kind, das sich vor Autoritäten fürchtet. Du besitzt die innere Stärke, dich für deine Würde und Rechte einzusetzen und auch in schwierigen Zeiten zu überleben und zu wachsen."

WICHTIG:
- Folge EXAKT der Struktur von Gray (Erfahrung → Annahme → Glaubenssatz → Gegenbeispiele → Neue Perspektive)
- Der Text muss natürlich fließen, ohne sichtbare Struktur
- Nutze konkrete, biografische Beispiele
- Verbinde Mitgefühl mit Ermächtigung

Ende mit: "Wie fühlst du dich jetzt in Bezug auf diese neue Sichtweise?"`
                }, {
                    role: "user",
                    content: pendingAnalysis.situation
                }],
                temperature: 0.7,
                max_tokens: 500
            });

            // Analyse aktualisieren
            pendingAnalysis.analysis = completion.choices[0].message.content;
            pendingAnalysis.status = 'completed';
            await pendingAnalysis.save();

            // Analyse-E-Mail senden
            await transporter.sendMail({
                from: process.env.GMAIL_USER,
                to: contact.email,
                subject: "Ihre erste Analyse ist bereit [Wichtige Erkenntnis entdeckt]",
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #334155;">
                        <h2 style="color: #0f766e;">Ihre erste ClearSelf Analyse</h2>
            
                        <p>Hallo ${contact.name || 'dort'},</p>
            
                        <p>unsere KI hat Ihre Situation analysiert und einen ersten bedeutsamen Glaubenssatz identifiziert:</p>
            
                        <div style="background: #f8fafc; padding: 25px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #0f766e;">
                            <h3 style="color: #0f766e; margin-top: 0;">🔍 IHRE ERSTE ERKENNTNIS:</h3>
                            ${pendingAnalysis.analysis.replace(/\n/g, '<br>')}
                        </div>
            
                        <div style="background: #fdf2f8; padding: 20px; border-radius: 8px; margin: 25px 0;">
                            <p style="color: #be185d; font-weight: bold;">⚡️ WICHTIG:</p>
                            <p>Dies ist nur der erste von mehreren Glaubenssätzen, die die KI in Ihrer Beschreibung erkannt hat. Für echte Transformation ist es wichtig, alle Kernmuster zu erkennen und aufzulösen.</p>
                        </div>
            
                        <div style="background: #0f766e; color: white; padding: 25px; border-radius: 8px; margin: 25px 0; text-align: center;">
                            <h3 style="margin-top: 0;">🎯 REVOLUTIONÄRER DURCHBRUCH</h3>
                            <p>Stellen Sie sich vor: Sie könnten ab heute <strong>jedes Problem</strong> in Minuten analysieren und auflösen.</p>
            
                            <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h4 style="margin-top: 0;">Mit dem ClearSelf Scanner:</h4>
                                <ul style="list-style: none; padding: 0; text-align: left;">
                                    <li style="margin: 10px 0;">✓ Sie tippen ein Problem ein</li>
                                    <li style="margin: 10px 0;">✓ Die KI findet alle verborgenen Glaubenssätze</li>
                                    <li style="margin: 10px 0;">✓ Sie lesen die Analyse</li>
                                    <li style="margin: 10px 0;">✓ Die Transformation geschieht beim Lesen</li>
                                </ul>
                            </div>
            
                            <p style="font-size: 18px; margin: 20px 0;">
                                Keine komplizierten Übungen.<br>
                                Keine zeitaufwendigen Techniken.<br>
                                Keine schwierigen Fragen.<br>
                                <strong>Nur lesen und transformieren.</strong>
                            </p>
            
                            <div style="margin: 20px 0;">
                                <p>Exklusives Einführungsangebot:</p>
                                <p style="text-decoration: line-through; margin: 5px;">Regulär: 97€/Monat</p>
                                <p style="font-size: 24px; font-weight: bold; margin: 5px;">Nur 47€/Monat</p>
                                <p style="font-size: 14px; opacity: 0.9;">
                                    • Unbegrenzter 24/7 Zugang<br>
                                    • Beliebig viele Analysen<br>
                                    • Jederzeit kündbar
                                </p>
                            </div>
            
                            <a href="${process.env.SALES_PAGE_URL}" style="display: inline-block; background: white; color: #0f766e; padding: 15px 30px; text-decoration: none; border-radius: 4px; font-weight: bold;">Jetzt unbegrenzten Zugang sichern</a>
                        </div>
            
                        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 25px 0;">
                            <p style="font-style: italic; color: #166534;">"Früher habe ich jahrelang an meinen Problemen gearbeitet. Heute tippe ich sie einfach ein und lese die Analyse. Die Transformation passiert wie von selbst. Es ist unglaublich - aber es funktioniert."</p>
                            <p style="color: #166534; margin: 0;">- Michael R., Unternehmensberater</p>
                        </div>
            
                        <div style="background: #fff7ed; padding: 20px; border-radius: 8px; margin: 25px 0;">
                            <p style="color: #9a3412; margin: 0;">⏰ Einführungsangebot: Der Preis von 47€/Monat gilt nur für die ersten 100 Mitglieder. Sichern Sie sich jetzt Ihren lebenslangen Vorzugspreis.</p>
                        </div>
            
                        <p><strong>P.S.:</strong> Denken Sie daran: Sie haben gerade erst einen Glaubenssatz erkannt. Stellen Sie sich vor, was passiert, wenn Sie ab heute jedes Problem sofort vollständig analysieren und auflösen können - einfach durch Lesen.</p>
            
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${process.env.SALES_PAGE_URL}" style="display: inline-block; background: #0f766e; color: white; padding: 15px 30px; text-decoration: none; border-radius: 4px; font-weight: bold;">Jetzt Zugang freischalten</a>
                        </div>
            
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
            
                        <div style="font-size: 12px; color: #666; text-align: center;">
                            <p>Diese Analyse wurde mit Hilfe von KI erstellt und dient der Selbstreflexion. Sie ersetzt keine professionelle Beratung.</p>
                            <p>
                                <a href="${process.env.DOMAIN}/datenschutz" style="color: #0f766e; text-decoration: none;">Datenschutz</a> | 
                                <a href="${process.env.DOMAIN}/impressum" style="color: #0f766e; text-decoration: none;">Impressum</a> | 
                                <a href="${process.env.DOMAIN}/abmelden" style="color: #0f766e; text-decoration: none;">Abmelden</a>
                            </p>
                        </div>
                    </div>
                `
            });

            // Token erst nach erfolgreicher Analyse entfernen
            contact.confirmationToken = null;
            await contact.save();

            // Erfolgsmeldung anzeigen
            res.send(`
                <html>
                    <head>
                        <style>
                            body { font-family: Arial; margin: 40px; text-align: center; }
                            .success { color: #0f766e; }
                        </style>
                    </head>
                    <body>
                        <h1 class="success">E-Mail-Adresse bestätigt!</h1>
                        <p>Vielen Dank für Ihre Bestätigung. Ihre Analyse wird nun erstellt und in wenigen Minuten per E-Mail zugestellt.</p>
                        <p><a href="https://clearself.ai">Zurück zur Website</a></p>
                    </body>
                </html>
            `);

        } catch (error) {
            console.error('Fehler bei Analyse/E-Mail:', error);
            contact.status = 'pending';
            await contact.save();
            throw error;
        }
    } catch (error) {
        console.error('Bestätigungsfehler:', error);
        res.status(500).send('Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.');
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

// Endpunkt zum Löschen eines Kontakts
app.delete('/api/contacts/:email', cors(), async (req, res) => {
    try {
        const { email } = req.params;
        
        // Validiere E-Mail-Format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                error: 'Ungültiges E-Mail-Format' 
            });
        }
        
        console.log('Löschversuch für:', email);

        const contact = await Contact.findOne({ 
            where: { email }
        });

        if (contact) {
            await Analysis.destroy({ 
                where: { ContactId: contact.id }
            });
            
            await contact.destroy();
            
            console.log(`Kontakt ${email} wurde gelöscht`);
            res.json({ 
                success: true, 
                message: 'Kontakt wurde gelöscht' 
            });
        } else {
            console.log(`Kontakt ${email} nicht gefunden`);
            res.status(404).json({ 
                error: 'Kontakt nicht gefunden' 
            });
        }
    } catch (error) {
        console.error('Fehler beim Löschen:', error);
        res.status(500).json({ 
            error: 'Fehler beim Löschen des Kontakts',
            details: error.message 
        });
    }
});

// Server starten
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n=== SERVER ERFOLGREICH GESTARTET ===');
    console.log(`Server läuft auf Port ${PORT}`);
    console.log('\nEnvironment Check:');
    console.log('- OpenAI Key:', !!process.env.OPENAI_API_KEY);
    console.log('- Gmail Setup:', !!process.env.GMAIL_USER && !!process.env.GMAIL_APP_PASSWORD);
    console.log('- Database URL:', !!process.env.DATABASE_URL);
}).on('listening', () => {
    console.log(`Server is listening on port ${PORT}`);
}).on('error', (err) => {
    console.error('Server error:', err);
});
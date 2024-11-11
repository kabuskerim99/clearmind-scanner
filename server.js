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
    origin: ['https://clearself.ai', 'https://www.clearself.ai'],  // beide Domains erlauben
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Origin', 'Authorization'],
    credentials: false,
    maxAge: 86400 // CORS Pre-flight cache für 24 Stunden
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

// Rest des Codes bleibt gleich...

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
            analysis: null, // Wird erst nach Bestätigung erstellt
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

//// Bestätigungs-Endpunkt
app.get('/api/confirm/:token', async (req, res) => {
    try {
        const { token } = req.params;
        console.log('Bestätigungsversuch für Token:', token);
        
        // Kontakt finden - auch wenn nicht pending
        const contact = await Contact.findOne({
            where: { 
                confirmationToken: token
            }
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

        // Ausstehende Analyse finden oder neue erstellen
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
                    content: `Du bist ein erfahrener Psychologe und Experte für limitierende Glaubenssätze.
                           Analysiere das folgende Problem und identifiziere die 3 wichtigsten limitierenden 
                           Kernglaubenssätze, die dahinter stecken könnten. Formuliere sie in der Ich-Form.`
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
                subject: "Ihre ClearSelf Scanner Analyse",
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #0f766e;">Ihre persönliche ClearSelf Analyse</h2>
                        <p>Vielen Dank für Ihr Vertrauen in den ClearSelf Scanner. Hier ist Ihre individuelle Analyse:</p>
                        <div style="background: #f5f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            ${pendingAnalysis.analysis.replace(/\n/g, '<br>')}
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

            // Jetzt erst den Token entfernen
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
            contact.status = 'pending'; // Status zurücksetzen bei Fehler
            await contact.save();
            throw error;
        }
    } catch (error) {
        console.error('Bestätigungsfehler:', error);
        res.status(500).send('Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.');
    }
});
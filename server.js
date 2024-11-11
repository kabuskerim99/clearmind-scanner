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

// Bestätigungs-Endpunkt
app.get('/api/confirm/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        // Kontakt finden
        const contact = await Contact.findOne({
            where: { 
                confirmationToken: token,
                status: 'pending'
            }
        });

        if (!contact) {
            return res.status(400).send('Ungültiger oder bereits verwendeter Bestätigungslink.');
        }

        // Kontakt aktivieren
        contact.status = 'active';
        contact.confirmedAt = new Date();
        contact.confirmationToken = null;
        await contact.save();

        // Ausstehende Analyse finden
        const pendingAnalysis = await Analysis.findOne({
            where: { 
                ContactId: contact.id,
                status: 'pending'
            }
        });

        if (pendingAnalysis) {
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
        }

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

// Endpunkt zum Löschen eines Kontakts
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
    

        // Finde und lösche den Kontakt
        const contact = await Contact.findOne({ 
            where: { email }
        });

        if (contact) {
            // Lösche zuerst alle zugehörigen Analysen
            await Analysis.destroy({ 
                where: { ContactId: contact.id }
            });
            
            // Dann lösche den Kontakt selbst
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
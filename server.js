require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const nodemailer = require('nodemailer');
const path = require('path');
const { initDatabase, Contact, Analysis } = require('./database');

// Express App initialisieren
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
    console.log('\n==== ANALYSE WIRD GESTARTET ====');
    try {
        const { email, situation } = req.body;
        
        console.log('1. Prüfe Eingaben...');
        if (!email || !situation) {
            return res.status(400).json({ error: 'E-Mail und Situation sind erforderlich' });
        }

        console.log('2. Starte OpenAI Analyse...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{
                role: "system",
                content: `Du bist ein erfahrener Psychologe und Experte für limitierende Glaubenssätze.
                       Analysiere das folgende Problem und identifiziere die 3 wichtigsten limitierenden 
                       Kernglaubenssätze, die dahinter stecken könnten. Formuliere sie in der Ich-Form.`
            }, {
                role: "user",
                content: situation
            }],
            temperature: 0.7,
            max_tokens: 500
        });

        const analysis = completion.choices[0].message.content;
        console.log('3. Analyse erstellt:', analysis);

        // In Datenbank speichern
        console.log('4. Speichere in Datenbank...');
        let [contact] = await Contact.findOrCreate({
            where: { email },
            defaults: { status: 'active' }
        });

        await Analysis.create({
            situation,
            analysis,
            ContactId: contact.id
        });

        console.log('5. Sende E-Mail...');
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: email,
            subject: "Ihre Clear Mind Scanner Analyse",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #0f766e;">Ihre persönliche Clear Mind Analyse</h2>
                    <p>Vielen Dank für Ihr Vertrauen in den Clear Mind Scanner. Hier ist Ihre individuelle Analyse:</p>
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

        console.log('6. E-Mail erfolgreich gesendet');
        res.json({ 
            success: true, 
            message: 'Analyse wurde erfolgreich durchgeführt und per E-Mail versandt'
        });

    } catch (error) {
        console.error('\nHAUPTFEHLER:', error);
        res.status(500).json({ 
            error: 'Ein Fehler ist aufgetreten', 
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

const PORT = process.env.PORT || 5000;
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
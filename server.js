// Helfer-Funktion für Token-Generierung
function generateToken() {
    return require('crypto').randomBytes(32).toString('hex');
}

// Angepasster /api/analyze Endpunkt
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

// Neuer Bestätigungs-Endpunkt
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
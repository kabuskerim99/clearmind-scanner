const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

// Datenbank-Verbindung
async function getDb() {
    return open({
        filename: path.join(__dirname, 'database', 'clearself.db'),
        driver: sqlite3.Database
    });
}

// Datenbank initialisieren
async function initDatabase() {
    const db = await getDb();
    
    // Contacts Tabelle erstellen
    await db.exec(`
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_analysis_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER,
            situation TEXT NOT NULL,
            analysis TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES contacts (id)
        );
    `);

    console.log('Datenbank wurde initialisiert');
    return db;
}

module.exports = {
    getDb,
    initDatabase
};
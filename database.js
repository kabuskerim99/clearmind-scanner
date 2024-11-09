const { Sequelize } = require('sequelize');

// Erstelle Sequelize-Instanz
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    }
});

// Definiere Models
const Contact = sequelize.define('Contact', {
    email: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: false
    },
    status: {
        type: Sequelize.STRING,
        defaultValue: 'active'
    }
});

const Analysis = sequelize.define('Analysis', {
    situation: {
        type: Sequelize.TEXT,
        allowNull: false
    },
    analysis: {
        type: Sequelize.TEXT,
        allowNull: false
    }
});

// Beziehungen
Contact.hasMany(Analysis);
Analysis.belongsTo(Contact);

// Datenbank initialisieren
async function initDatabase() {
    try {
        await sequelize.authenticate();
        await sequelize.sync();
        console.log('Datenbankverbindung hergestellt');
    } catch (error) {
        console.error('Datenbankfehler:', error);
    }
}

module.exports = {
    sequelize,
    Contact,
    Analysis,
    initDatabase
};
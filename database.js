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
        defaultValue: 'pending' // neu: 'pending', 'active', 'inactive'
    },
    confirmationToken: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: true
    },
    confirmedAt: {
        type: Sequelize.DATE,
        allowNull: true
    }
});

const Analysis = sequelize.define('Analysis', {
    situation: {
        type: Sequelize.TEXT,
        allowNull: false
    },
    analysis: {
        type: Sequelize.TEXT,
        allowNull: true
    },
    status: {
        type: Sequelize.STRING,
        defaultValue: 'pending' // neu: 'pending', 'completed'
    }
});

// Beziehungen
Contact.hasMany(Analysis);
Analysis.belongsTo(Contact);

// Datenbank initialisieren
async function initDatabase() {
    try {
        await sequelize.authenticate();
        await sequelize.sync({ alter: true }); // Dies wird die Tabellen aktualisieren
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
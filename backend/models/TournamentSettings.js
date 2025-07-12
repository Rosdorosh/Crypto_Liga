const mongoose = require('mongoose');

const tournamentSettingsSchema = new mongoose.Schema({
    startTime: {
        type: Date,
        required: true
    },
    matchDuration: {
        type: Number,
        default: 300 
    },
    breakDuration: {
        type: Number,
        default: 60 
    },
    status: {
        type: String,
        enum: ['pending', 'running', 'completed'],
        default: 'pending'
    },
    totalReservationIncome: {
        type: Number,
        default: 0
    },
    prizeFund: {
        type: Number,
        default: 0
    },
    autoMode: {
        type: Boolean,
        default: false
    },
    autoInterval: {
        type: Number,
        default: 50 
    },
    nextTournamentTime: {
        type: Date,
        default: null
    }
});

module.exports = mongoose.model('TournamentSettings', tournamentSettingsSchema); 
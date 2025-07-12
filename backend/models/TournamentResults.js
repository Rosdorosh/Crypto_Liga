const mongoose = require('mongoose');

const tournamentResultsSchema = new mongoose.Schema({
    tournamentEndDate: {
        type: Date,
        required: true
    },
    firstPlace: {
        team: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TradingPair',
            required: true
        },
        userIds: [{
            type: String,
            required: true
        }],
        prizePerUser: {
            type: Number,
            required: true
        }
    },
    secondPlace: {
        team: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TradingPair',
            required: true
        },
        userIds: [{
            type: String,
            required: true
        }],
        prizePerUser: {
            type: Number,
            required: true
        }
    },
    totalPrizeFund: {
        type: Number,
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('TournamentResults', tournamentResultsSchema); 
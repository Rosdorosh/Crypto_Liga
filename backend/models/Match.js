const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema({
    start: {
        type: Number,
        required: true
    },
    end: {
        type: Number,
        required: true
    },
    change: {
        type: Number,
        required: true
    }
}, { _id: false });

const matchSchema = new mongoose.Schema({
    pair1: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TradingPair',
        required: true
    },
    pair2: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TradingPair',
        required: true
    },
    round: {
        type: Number,
        required: true,
        enum: [1, 2, 3, 4, 5],
        default: 1
    },
    roundName: {
        type: String,
        enum: ['sixteenth', 'eighth', 'quarter', 'semi', 'final'],
        default: 'sixteenth'
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'completed'],
        default: 'pending'
    },
    winner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TradingPair'
    },
    startTime: Date,
    endTime: Date,
    pair1Price: priceSchema,
    pair2Price: priceSchema
}, {
    timestamps: true
});

module.exports = mongoose.model('Match', matchSchema);

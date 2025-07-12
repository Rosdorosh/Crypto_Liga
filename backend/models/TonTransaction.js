const mongoose = require('mongoose');

const tonTransactionSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    transactionHash: {
        type: String,
        required: true,
        unique: true
    },
    fromAddress: {
        type: String,
        required: true
    },
    toAddress: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    tonAmount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['deposit', 'withdraw', 'payment']
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'confirmed', 'failed'],
        default: 'pending'
    },
    blockNumber: {
        type: Number
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    confirmedAt: {
        type: Date
    },
    payload: {
        type: Object,
        default: {}
    },
    errorMessage: {
        type: String
    }
});

tonTransactionSchema.index({ userId: 1, createdAt: -1 });
tonTransactionSchema.index({ transactionHash: 1 });
tonTransactionSchema.index({ status: 1 });

module.exports = mongoose.model('TonTransaction', tonTransactionSchema); 
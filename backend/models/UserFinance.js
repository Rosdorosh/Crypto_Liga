const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['referral', 'reservation', 'deposit', 'withdrawal', 'initial', 'win', 'commission', 'ton_deposit', 'ton_withdrawal'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    hash: {
        type: String,
        sparse: true
    },
    tonAmount: {
        type: Number,
        sparse: true
    },
    tonAddress: {
        type: String,
        sparse: true
    }
});

const userFinanceSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        default: 0
    },
    knlBalance: {
        type: Number,
        default: 0
    },
    walletAddress: {
        type: String,
        sparse: true
    },
    tonWalletAddress: {
        type: String,
        sparse: true
    },
    refCode: {
        type: String,
        sparse: true,
        unique: true
    },
    refId: {
        type: String,
        default: null
    },
    transactions: [transactionSchema]
}, {
    timestamps: true
});

module.exports = mongoose.model('UserFinance', userFinanceSchema); 
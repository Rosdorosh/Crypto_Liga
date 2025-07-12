const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
    referrerId: {
        type: String,
        required: true,
        unique: true
    },
    refCode: {
        type: String,
        required: true,
        unique: true
    },
    referrals: [{
        userId: {
            type: String,
            required: true
        },
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    totalReferrals: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ReferralInfo', referralSchema); 
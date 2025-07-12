const mongoose = require('mongoose');

const tradingPairSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    unique: true
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  teamCost: {
    type: Number,
    default: 10
  },
  userIds: [{
    type: String
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('TradingPair', tradingPairSchema);

const WebSocket = require('ws');
const Match = require('../models/Match');

class PriceService {
  constructor() {
    this.ws = null;
    this.activeMatches = new Map();
  }

  connect() {
    this.ws = new WebSocket('wss://stream.binance.com:9443/ws');
    
    this.ws.on('message', async (data) => {
      const message = JSON.parse(data);
      await this.updateMatchPrices(message);
    });
  }

  async startTracking(match) {
    const symbols = [match.pair1.symbol, match.pair2.symbol];
    const subscription = {
      method: 'SUBSCRIBE',
      params: symbols.map(symbol => `${symbol.toLowerCase()}@ticker`),
      id: 1
    };
    
    this.ws.send(JSON.stringify(subscription));
    this.activeMatches.set(match._id, match);
  }

  async updateMatchPrices(data) {
    // Update prices every 20 seconds
    // Here will be the logic to update prices in the database
  }
}

module.exports = new PriceService();

const { WebsocketClient } = require('bybit-api'); 

class BybitService {
    constructor() {
        this.prices = {};
        this.startPrices = {};
        this.wsClient = null;
        this.isUpdatingPrices = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.lastPriceUpdate = {};
        this.supportedPairs = [
            'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOTUSDT', 'ADAUSDT', 'TONUSDT',
            'DOGEUSDT', 'ATOMUSDT', 'SHIBUSDT', 'NEARUSDT', 'POLUSDT', 'AVAXUSDT', 'FILUSDT', 'APTUSDT',
            '1INCHUSDT', 'ARBUSDT', 'CAKEUSDT', 'CRVUSDT', 'DAIUSDT', 'ICPUSDT', 'INJUSDT', 'JUPUSDT',
            'KASUSDT', 'KSMUSDT', 'LTCUSDT', 'MNTUSDT', 'OPUSDT', 'STRKUSDT', 'TRXUSDT', 'UNIUSDT'
        ];

        this.initializeWebSocket();
        this.startPriceUpdateChecker();
    }

    resetAllPrices() {
        console.log('Скидання всіх цін...');
        this.prices = {};
        this.startPrices = {};
        this.lastPriceUpdate = {};
        this.isUpdatingPrices = false;
    }

    initializeWebSocket() {
        if (this.wsClient) {
            this.wsClient.close();
        }

        this.wsClient = new WebsocketClient({
            market: 'spot',
            testnet: false,
            wsUrl: 'wss://stream.bybit.com/v5/public/spot'
        });

        this.setupWebSocket();

        setTimeout(() => {
            this.supportedPairs.forEach(symbol => {
                this.subscribeToSymbol(symbol);
            });
        }, 1000);
    }

    setupWebSocket() {
        this.wsClient.on('update', (data) => {
            if (data.topic && data.topic.startsWith('tickers') && data.data) {
                const symbol = data.data.symbol;
                const price = parseFloat(data.data.lastPrice);

                if (!isNaN(price)) {
                    this.prices[symbol] = price;
                    this.lastPriceUpdate[symbol] = Date.now();
                }
            }
        });

        this.wsClient.on('error', (err) => {
            console.error('WebSocket error:', err);
            this.handleReconnect();
        });

        this.wsClient.on('close', () => {
            console.log('WebSocket connection closed');
            this.handleReconnect();
        });
    }

    setStartPriceForSymbol(symbol) {
        const currentPrice = this.getCurrentPrice(symbol);
        if (currentPrice) {
            this.startPrices[symbol] = currentPrice;
            console.log(`Set new start price for ${symbol}: ${currentPrice}`);
            return true;
        }
        return false;
    }

    async handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempt to reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

            setTimeout(async () => {
                this.initializeWebSocket();
                await this.resetAndSetAllStartPrices();
            }, this.reconnectDelay);
        } else {
            console.error('Reached maximum number of reconnect attempts');
        }
    }

    startPriceUpdateChecker() {
        setInterval(async () => {
            const now = Date.now();
            for (const symbol of this.supportedPairs) {
                const lastUpdate = this.lastPriceUpdate[symbol] || 0;
                if (now - lastUpdate > 10000) {
                    console.log(`Price for ${symbol} has not been updated for more than 10 seconds`);
                    await this.fetchInitialPrice(symbol);
                }
            }
        }, 5000);
    }

    subscribeToSymbol(symbol) {
        try {
            const formattedSymbol = symbol.replace('/', '').toUpperCase();
            const topic = `tickers.${formattedSymbol}`;
            
            this.wsClient.unsubscribe([topic]);
            
            setTimeout(() => {
                this.wsClient.subscribe([topic]);
                console.log(`Subscribed to ${formattedSymbol}`);
            }, 1000);
        } catch (error) {
            console.error(`Error subscribing to ${symbol}:`, error);
        }
    }

    async fetchInitialPrice(symbol) {
        try {
            const response = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`);
            const data = await response.json();
            if (data.result && data.result.list && data.result.list[0]) {
                const price = parseFloat(data.result.list[0].lastPrice);
                if (!isNaN(price)) {
                    this.prices[symbol] = price;
                    this.lastPriceUpdate[symbol] = Date.now();
                    console.log(`REST API: Get price for ${symbol}: ${price}`);
                    return price;
                }
            }
        } catch (error) {
            console.error(`Error getting price for ${symbol}:`, error);
        }
        return null;
    }

    async ensureAllPairsHavePrices() {
        console.log('Checking for prices for all pairs...');
        let allPairsHavePrices = true;
        
        for (const symbol of this.supportedPairs) {
            const formattedSymbol = symbol.replace('/', '').toUpperCase();
            let currentPrice = this.getCurrentPrice(formattedSymbol);
            
            if (!currentPrice) {
                console.log(`No price for ${formattedSymbol}, getting through REST API...`);
                currentPrice = await this.fetchInitialPrice(formattedSymbol);
                
                if (!currentPrice) {
                    console.error(`Failed to get price for ${formattedSymbol}`);
                    allPairsHavePrices = false;
                }
            }
        }
        
        if (allPairsHavePrices) {
            console.log('All pairs have prices');
        } else {
            console.log('Some pairs do not have prices');
        }
        
        return allPairsHavePrices;
    }

    async resetAndSetAllStartPrices() {
        console.log('Resetting and setting start prices for all trading pairs...');
        this.isUpdatingPrices = true;

        for (const symbol of this.supportedPairs) {
            const formattedSymbol = symbol.replace('/', '').toUpperCase();
            let currentPrice = this.getCurrentPrice(formattedSymbol);

            if (!currentPrice) {
                currentPrice = await this.fetchInitialPrice(symbol); 
            }

            if (currentPrice) {
                this.startPrices[formattedSymbol] = currentPrice;
                console.log(`Set new start price for ${formattedSymbol}: ${currentPrice}`);
            } else {
                console.error(`Failed to get current price for ${formattedSymbol}`);
            }
        }

        this.isUpdatingPrices = false;
        console.log('Resetting and setting start prices completed');
    }

    getStartPrice(symbol) {
        const formattedSymbol = symbol.replace('/', '').toUpperCase();
        return this.startPrices[formattedSymbol] || null;
    }

    getCurrentPrice(symbol) {
        const formattedSymbol = symbol.replace('/', '').toUpperCase();
        return this.prices[formattedSymbol] || null;
    }

    async getPriceChange(symbol) {
        const currentPrice = this.getCurrentPrice(symbol);
        const startPrice = this.getStartPrice(symbol);

        if (!currentPrice || !startPrice) {
            console.log(`No prices for ${symbol}. Current: ${currentPrice}, Start: ${startPrice}`);
            return null;
        }

        const change = ((currentPrice - startPrice) / startPrice) * 100;
        return {
            start: startPrice,
            end: currentPrice,
            change: parseFloat(change.toFixed(2))
        };
    }

    resetStartPrice(symbol) {
        const formattedSymbol = symbol.replace('/', '').toUpperCase();
        delete this.startPrices[formattedSymbol];
        console.log(`Reset start price for ${formattedSymbol}`);
    }

    setStartPrice(symbol) {
        const formattedSymbol = symbol.replace('/', '').toUpperCase();
        const currentPrice = this.getCurrentPrice(formattedSymbol);
        
        if (currentPrice) {
            this.startPrices[formattedSymbol] = currentPrice;
            console.log(`Set new start price for ${formattedSymbol}: ${currentPrice}`);
            return currentPrice;
        }
        
        console.log(`Failed to set start price for ${formattedSymbol}`);
        return null;
    }

    checkWebSocketConnection() {
        if (!this.wsClient) {
            console.log('WebSocket client not initialized');
            return false;
        }
        
        const now = Date.now();
        let hasRecentUpdates = false;
        
        for (const symbol of this.supportedPairs) {
            const lastUpdate = this.lastPriceUpdate[symbol] || 0;
            if (now - lastUpdate < 10000) {
                hasRecentUpdates = true;
                break;
            }
        }
        
        if (!hasRecentUpdates) {
            console.log('No price updates in the last 10 seconds, restarting WebSocket...');
            this.initializeWebSocket();
            return false;
        }
        
        return true;
    }
}

const bybitService = new BybitService();
module.exports = bybitService;

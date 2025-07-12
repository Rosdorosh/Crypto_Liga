const express = require('express');
const router = express.Router();
const TradingPair = require('../models/TradingPair');
const TournamentSettings = require('../models/TournamentSettings');
const Match = require('../models/Match');
const bybitService = require('../services/bybitService');
const TournamentResults = require('../models/TournamentResults');
const UserFinance = require('../models/UserFinance');
const tonService = require('../services/tonService');
const TonTransaction = require('../models/TonTransaction');

const adminAuth = (req, res, next) => {
    const adminToken = req.headers['admin-token'] || req.query.token;
    
    const validToken = process.env.ADMIN_TOKEN;
    
    if (adminToken === validToken) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized access' });
    }
};

router.get('/prize-fund', async (req, res) => {
    try {
        const settings = await TournamentSettings.findOne();
        res.json({
            prizeFund: settings?.prizeFund || 0,
            status: settings?.status || 'pending'
        });
    } catch (error) {
        console.error('Error getting prize fund:', error);
        res.status(500).json({ error: 'Error getting prize fund' });
    }
});

router.use(adminAuth);

router.get('/pairs', async (req, res) => {
    try {
        const pairs = await TradingPair.find();
        res.json(pairs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/pairs', async (req, res) => {
    try {
        const { symbol } = req.body;
        const pair = new TradingPair({ symbol });
        await pair.save();
        res.json(pair);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/pairs/:id', async (req, res) => {
    try {
        await TradingPair.findByIdAndDelete(req.params.id);
        res.json({ message: 'Pair deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/draw', async (req, res) => {
    try {
        const pairs = await TradingPair.find();
        if (pairs.length < 32) {
            return res.status(400).json({ error: 'Minimum 32 trading pairs required for draw' });
        }

        const shuffledPairs = pairs.sort(() => Math.random() - 0.5);

        const sixteenthMatches = [];
        for (let i = 0; i < 32; i += 2) {
            sixteenthMatches.push({
                pair1: shuffledPairs[i]._id,
                pair2: shuffledPairs[i + 1]._id,
                round: 1,
                roundName: 'sixteenth',
                status: 'pending'
            });
        }

        const createdMatches = await Match.insertMany(sixteenthMatches);

        res.json({
            message: 'Draw completed successfully',
            matches: createdMatches
        });
    } catch (error) {
        console.error('Draw error:', error);
        res.status(500).json({ error: 'Draw error' });
    }
});

router.post('/tournament-settings', async (req, res) => {
    try {
        const { startTime, matchDuration, breakDuration, autoMode, autoInterval } = req.body;

        if (!startTime || !matchDuration || !breakDuration) {
            return res.status(400).json({ error: 'All fields must be filled' });
        }

        const currentSettings = await TournamentSettings.findOne();
        
        const localStartTime = new Date(startTime);
        
        if (currentSettings) {
            currentSettings.startTime = localStartTime;
            currentSettings.matchDuration = matchDuration;
            currentSettings.breakDuration = breakDuration;
            currentSettings.autoMode = autoMode !== undefined ? autoMode : currentSettings.autoMode;
            currentSettings.autoInterval = autoInterval || currentSettings.autoInterval;
            await currentSettings.save();
            res.json({ message: 'Tournament settings saved', settings: currentSettings });
        } else {
            const settings = new TournamentSettings({
                startTime: localStartTime,
                matchDuration,
                breakDuration,
                totalReservationIncome: 0,
                prizeFund: 0,
                autoMode: autoMode || false,
                autoInterval: autoInterval || 50
            });
            await settings.save();
            res.json({ message: 'Tournament settings saved', settings });
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ error: 'Server error saving settings' });
    }
});

router.get('/tournament-settings', async (req, res) => {
    try {
        const settings = await TournamentSettings.findOne();
        res.json(settings || {});
    } catch (error) {
        console.error('Error getting settings:', error);
        res.status(500).json({ error: 'Server error getting settings' });
    }
});

router.get('/matches', async (req, res) => {
    try {
        const matches = await Match.find()
            .populate('pair1')
            .populate('pair2')
            .sort({ round: 1 });
        res.json(matches);
    } catch (error) {
        console.error('Error getting matches:', error);
        res.status(500).json({ error: 'Server error getting matches' });
    }
});

router.post('/matches/:id/start', async (req, res) => {
    try {
        const match = await Match.findById(req.params.id)
            .populate('pair1')
            .populate('pair2');

        if (!match) {
            return res.status(404).json({ error: 'Match not found' });
        }

        if (match.status !== 'pending') {
            return res.json({ message: 'Match already started', match });
        }

        const pair1Symbol = match.pair1.symbol;
        const pair2Symbol = match.pair2.symbol;

        bybitService.resetStartPrice(pair1Symbol);
        bybitService.resetStartPrice(pair2Symbol);

        const pair1StartPrice = bybitService.setStartPrice(pair1Symbol);
        const pair2StartPrice = bybitService.setStartPrice(pair2Symbol);

        if (!pair1StartPrice || !pair2StartPrice) {
            return res.status(400).json({ error: 'Could not get start prices' });
        }

        match.status = 'active';
        match.startTime = new Date();
        await match.save();

        console.log(`Match ${match._id} started with prices:`, {
            pair1: { symbol: pair1Symbol, startPrice: pair1StartPrice },
            pair2: { symbol: pair2Symbol, startPrice: pair2StartPrice }
        });

        res.json({ message: 'Match started', match });
    } catch (error) {
        console.error('Error starting match:', error);
        res.status(500).json({ error: 'Error starting match' });
    }
});

router.post('/matches/:id/complete', async (req, res) => {
    try {
        const match = await Match.findById(req.params.id);

        if (!match) {
            return res.status(404).json({ error: 'Match not found' });
        }

        if (match.status === 'completed') {
            return res.json({ message: 'Match already completed', match });
        }

        if (match.status !== 'active') {
            return res.status(400).json({ error: 'Match not active' });
        }

        await handleMatchCompletion(match._id);
        
        const updatedMatch = await Match.findById(req.params.id);

        res.json({ message: 'Match completed', match: updatedMatch });
    } catch (error) {
        console.error('Error completing match:', error);
        res.status(500).json({ error: 'Error completing match' });
    }
});

router.post('/tournament/start', async (req, res) => {
    try {
        const settings = await TournamentSettings.findOne();
        if (!settings) {
            return res.status(400).json({ error: 'Tournament settings not found' });
        }

        global.tournamentTimers = global.tournamentTimers || {};
        Object.values(global.tournamentTimers).forEach(timer => clearTimeout(timer));

        await Match.deleteMany({});
        console.log('Deleted all matches from previous tournament');

        settings.status = 'running';
        await settings.save();
        console.log('Tournament status changed to "running", team reservation blocked');

        const drawSuccess = await performDraw();
        if (!drawSuccess) {
            return res.status(500).json({ error: 'Draw error' });
        }

        const tournamentStarted = await startTournament();
        if (!tournamentStarted) {
            return res.status(500).json({ error: 'Tournament start error' });
        }

        res.json({ message: 'Tournament started' });
    } catch (error) {
        console.error('Tournament start error:', error);
        res.status(500).json({ error: 'Tournament start error' });
    }
});

router.post('/tournament/stop', async (req, res) => {
    try {
        if (global.tournamentTimers) {
            Object.values(global.tournamentTimers).forEach(timer => clearTimeout(timer));
        }

        await Match.deleteMany({});
        
        await TournamentSettings.updateOne({}, {
            $set: {
                status: 'completed'
            }
        });

        const settings = await TournamentSettings.findOne();
        if (settings && settings.autoMode) {
            const now = new Date();
            const nextTournamentTime = new Date(now.getTime() + settings.autoInterval * 60 * 1000);
            
            await TournamentSettings.updateOne({}, {
                $set: {
                    nextAutoTournamentTime: nextTournamentTime,
                    startTime: nextTournamentTime
                }
            });
            
            console.log(`Scheduled automatic start of next tournament at ${nextTournamentTime.toISOString()} (local time: ${new Date(nextTournamentTime).toLocaleString()})`);
            
            const timeUntilNextTournament = nextTournamentTime.getTime() - now.getTime();
            
            if (global.nextTournamentTimer) {
                clearTimeout(global.nextTournamentTimer);
            }
            
            global.nextTournamentTimer = setTimeout(async () => {
                try {
                    const currentSettings = await TournamentSettings.findOne();
                    if (currentSettings && currentSettings.status === 'completed') {
                        console.log('Automatic tournament start...');
                        
                        try {
                            await bybitService.initializeWebSocket();
                            console.log('WebSocket restarted before automatic tournament start');
                            
                            await new Promise(resolve => setTimeout(resolve, 5000));
                            
                            const allPairsHavePrices = await bybitService.ensureAllPairsHavePrices();
                            if (!allPairsHavePrices) {
                                console.error('Failed to get prices for all pairs. Retrying...');
                                await new Promise(resolve => setTimeout(resolve, 3000));
                            }
                        } catch (wsError) {
                            console.error('WebSocket restart error:', wsError);
                        }
                        
                        if (global.tournamentTimers) {
                            Object.values(global.tournamentTimers).forEach(timer => clearTimeout(timer));
                        }
                        
                        await Match.deleteMany({});
                        console.log('Deleted all matches from previous tournament');
                        
                        await TournamentSettings.updateOne({}, {
                            $set: {
                                status: 'running'
                            }
                        });
                        console.log('Tournament status changed to "running", team reservation blocked');
                        
                        bybitService.resetAllPrices();
                        console.log('Reset all trading pair prices');
                        
                        const drawSuccess = await performDraw();
                        if (!drawSuccess) {
                            console.error('Draw error during automatic tournament start');
                            return;
                        }
                        
                        const tournamentStarted = await startTournament();
                        if (!tournamentStarted) {
                            console.error('Tournament start error in automatic mode');
                        }
                    }
                } catch (error) {
                    console.error('Automatic tournament start error:', error);
                }
            }, timeUntilNextTournament);
        }

        res.json({ message: 'Tournament stopped' });
    } catch (error) {
        res.status(500).json({ error: 'Tournament stop error' });
    }
});

let isCreatingNextRound = false;

async function checkAndCreateNextRound() {
    if (isCreatingNextRound) {
        console.log('Next round creation process already in progress');
        return;
    }

    try {
        isCreatingNextRound = true;
        const settings = await TournamentSettings.findOne();
        if (!settings) return;

        const allMatches = await Match.find().sort({ round: -1 });
        if (allMatches.length === 0) {
            isCreatingNextRound = false;
            return;
        }

        const currentRound = allMatches[0].round;
        const nextRoundExists = allMatches.some(match => match.round > currentRound);
        
        if (nextRoundExists) {
            console.log(`Round ${currentRound + 1} matches already exist`);
            isCreatingNextRound = false;
            return;
        }

        const currentRoundMatches = allMatches.filter(match => match.round === currentRound);
        const completedMatches = currentRoundMatches.filter(match => match.status === 'completed');

        if (completedMatches.length !== currentRoundMatches.length) {
            console.log(`Waiting for all round ${currentRound} matches to complete`);
            isCreatingNextRound = false;
            return;
        }

        if (currentRound === 1 && completedMatches.length === 16) {
            const winners = completedMatches.map(match => match.winner);
            const eighthMatches = [];
            for (let i = 0; i < 16; i += 2) {
                eighthMatches.push({
                    pair1: winners[i],
                    pair2: winners[i + 1],
                    round: 2,
                    roundName: 'eighth',
                    status: 'pending'
                });
            }

            const createdEighthMatches = await Match.insertMany(eighthMatches);
            console.log('Created 1/8 final matches:', createdEighthMatches);

            setTimeout(async () => {
                await startNextRoundMatches(createdEighthMatches, settings);
            }, settings.breakDuration * 1000);

        } else if (currentRound === 2 && completedMatches.length === 8) {
            const winners = completedMatches.map(match => match.winner);
            const quarterMatches = [];
            for (let i = 0; i < 8; i += 2) {
                quarterMatches.push({
                    pair1: winners[i],
                    pair2: winners[i + 1],
                    round: 3,
                    roundName: 'quarter',
                    status: 'pending'
                });
            }

            const createdQuarterMatches = await Match.insertMany(quarterMatches);
            console.log('Created quarter-final matches:', createdQuarterMatches);

            setTimeout(async () => {
                await startNextRoundMatches(createdQuarterMatches, settings);
            }, settings.breakDuration * 1000);

        } else if (currentRound === 3 && completedMatches.length === 4) {
            const winners = completedMatches.map(match => match.winner);
            const semiMatches = [
                {
                    pair1: winners[0],
                    pair2: winners[1],
                    round: 4,
                    roundName: 'semi',
                    status: 'pending'
                },
                {
                    pair1: winners[2],
                    pair2: winners[3],
                    round: 4,
                    roundName: 'semi',
                    status: 'pending'
                }
            ];

            const createdSemiMatches = await Match.insertMany(semiMatches);
            console.log('Created semi-final matches:', createdSemiMatches);

            setTimeout(async () => {
                await startNextRoundMatches(createdSemiMatches, settings);
            }, settings.breakDuration * 1000);

        } else if (currentRound === 4 && completedMatches.length === 2) {
            const winners = completedMatches.map(match => match.winner);
            const finalMatch = new Match({
                pair1: winners[0],
                pair2: winners[1],
                round: 5,
                roundName: 'final',
                status: 'pending'
            });

            const createdFinalMatch = await finalMatch.save();
            console.log('Created final match:', createdFinalMatch);

            setTimeout(async () => {
                await startNextRoundMatches([createdFinalMatch], settings);
            }, settings.breakDuration * 1000);
        }

    } catch (error) {
        console.error('Next round creation error:', error);
    } finally {
        isCreatingNextRound = false;
    }
}

async function startNextRoundMatches(matches, settings) {
    try {
        console.log(`Starting next round matches...`);
        
        const isConnected = await bybitService.checkWebSocketConnection();
        if (!isConnected) {
            console.log('WebSocket not connected before next round, restarting...');
            await bybitService.initializeWebSocket();
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            await bybitService.ensureAllPairsHavePrices();
        }
        
        let currentDelay = settings.breakDuration * 1000;

        for (const match of matches) {
            setTimeout(async () => {
                try {
                    const isConnected = await bybitService.checkWebSocketConnection();
                    if (!isConnected) {
                        console.log(`WebSocket not connected before match ${match._id}, restarting...`);
                        await bybitService.initializeWebSocket();
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                    
                    const currentMatch = await Match.findById(match._id)
                        .populate('pair1')
                        .populate('pair2');

                    if (currentMatch && currentMatch.status === 'pending') {
                        bybitService.resetStartPrice(currentMatch.pair1.symbol);
                        bybitService.resetStartPrice(currentMatch.pair2.symbol);
                        
                        const pair1Price = bybitService.getCurrentPrice(currentMatch.pair1.symbol);
                        const pair2Price = bybitService.getCurrentPrice(currentMatch.pair2.symbol);
                        
                        if (!pair1Price || !pair2Price) {
                            console.log(`Missing prices for pairs ${currentMatch.pair1.symbol} or ${currentMatch.pair2.symbol}, fetching via REST API...`);
                            await bybitService.fetchInitialPrice(currentMatch.pair1.symbol);
                            await bybitService.fetchInitialPrice(currentMatch.pair2.symbol);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                        
                        const pair1StartPrice = bybitService.setStartPrice(currentMatch.pair1.symbol);
                        const pair2StartPrice = bybitService.setStartPrice(currentMatch.pair2.symbol);
                        
                        if (!pair1StartPrice || !pair2StartPrice) {
                            console.error(`Failed to set start prices for match ${match._id}. Retrying...`);
                            await bybitService.fetchInitialPrice(currentMatch.pair1.symbol);
                            await bybitService.fetchInitialPrice(currentMatch.pair2.symbol);
                            bybitService.setStartPrice(currentMatch.pair1.symbol);
                            bybitService.setStartPrice(currentMatch.pair2.symbol);
                        }

                        currentMatch.status = 'active';
                        currentMatch.startTime = new Date();
                        await currentMatch.save();
                        console.log(`Match ${match._id} (Round ${match.round}) started`);
                    }
                } catch (error) {
                    console.error(`Error starting match ${match._id}:`, error);
                }
            }, currentDelay);

            setTimeout(async () => {
                try {
                    const currentMatch = await Match.findById(match._id);
                    if (currentMatch && currentMatch.status === 'active') {
                        await handleMatchCompletion(match._id);
                    }
                } catch (error) {
                    console.error(`Error completing match ${match._id}:`, error);
                }
            }, currentDelay + settings.matchDuration * 1000);

            currentDelay += (settings.matchDuration + settings.breakDuration) * 1000;
        }
    } catch (error) {
        console.error('Next round match start error:', error);
    }
}

async function handleMatchCompletion(matchId) {
    try {
        const match = await Match.findById(matchId)
            .populate('pair1')
            .populate('pair2');
            
        if (!match || match.status === 'completed') {
            console.log(`Match ${matchId} already completed or not found`);
            return;
        }

        const pair1Symbol = match.pair1.symbol;
        const pair2Symbol = match.pair2.symbol;

        console.log(`Completing match ${matchId}:`);
        console.log(`- Pair 1: ${pair1Symbol}`);
        console.log(`- Pair 2: ${pair2Symbol}`);

        let pair1Price, pair2Price;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                const pair1CurrentPrice = bybitService.getCurrentPrice(pair1Symbol);
                const pair2CurrentPrice = bybitService.getCurrentPrice(pair2Symbol);
                const pair1StartPrice = bybitService.getStartPrice(pair1Symbol);
                const pair2StartPrice = bybitService.getStartPrice(pair2Symbol);
                
                if (!pair1CurrentPrice || !pair2CurrentPrice || !pair1StartPrice || !pair2StartPrice) {
                    console.log(`Missing prices for pairs ${pair1Symbol} or ${pair2Symbol}, fetching via REST API...`);
                    await bybitService.fetchInitialPrice(pair1Symbol);
                    await bybitService.fetchInitialPrice(pair2Symbol);
                    
                    if (!pair1StartPrice) {
                        bybitService.setStartPrice(pair1Symbol);
                    }
                    if (!pair2StartPrice) {
                        bybitService.setStartPrice(pair2Symbol);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                pair1Price = await bybitService.getPriceChange(pair1Symbol);
                pair2Price = await bybitService.getPriceChange(pair2Symbol);

                if (pair1Price && pair2Price) {
                    break;
                }
                
                console.log('Received prices:');
                console.log('Pair 1:', pair1Price);
                console.log('Pair 2:', pair2Price);
                
                retryCount++;
                console.log(`Attempt ${retryCount}/${maxRetries} to get prices...`);
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                console.error('Error getting prices:', error);
                retryCount++;
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        if (!pair1Price || !pair2Price) {
            console.error('Failed to get prices after all attempts. Setting default values.');
            
            const pair1CurrentPrice = bybitService.getCurrentPrice(pair1Symbol) || 0;
            const pair2CurrentPrice = bybitService.getCurrentPrice(pair2Symbol) || 0;
            
            pair1Price = {
                start: pair1CurrentPrice,
                end: pair1CurrentPrice,
                change: 0
            };
            
            pair2Price = {
                start: pair2CurrentPrice,
                end: pair2CurrentPrice,
                change: 0
            };
        }

        console.log('Received prices:');
        console.log('Pair 1:', pair1Price);
        console.log('Pair 2:', pair2Price);

        const winner = pair1Price.change > pair2Price.change ? match.pair1._id : match.pair2._id;
        const winnerSymbol = pair1Price.change > pair2Price.change ? pair1Symbol : pair2Symbol;

        const updatedMatch = await Match.findByIdAndUpdate(
            matchId,
            {
                $set: {
                    status: 'completed',
                    endTime: new Date(),
                    winner: winner,
                    pair1Price: {
                        start: pair1Price.start,
                        end: pair1Price.end,
                        change: pair1Price.change
                    },
                    pair2Price: {
                        start: pair2Price.start,
                        end: pair2Price.end,
                        change: pair2Price.change
                    }
                }
            },
            { new: true }
        );

        console.log('Updated match:', updatedMatch);
        console.log(`Match completed. Winner: ${winnerSymbol}`);

        if (match.roundName === 'final') {
            const settings = await TournamentSettings.findOne();
            const totalPrizeFund = Math.floor(settings?.prizeFund || 0);
            
            const winnerTeam = winner === match.pair1._id ? match.pair1 : match.pair2;
            const secondPlaceTeam = winner === match.pair1._id ? match.pair2 : match.pair1;

            const winnerTeamFull = await TradingPair.findById(winnerTeam._id);
            const secondPlaceTeamFull = await TradingPair.findById(secondPlaceTeam._id);

            const firstPlacePrize = Math.floor(totalPrizeFund * 0.7);
            const secondPlacePrize = Math.floor(totalPrizeFund * 0.3);

            const firstPlacePrizePerUser = Math.floor(firstPlacePrize / Math.max(1, winnerTeamFull.userIds.length));
            const secondPlacePrizePerUser = Math.floor(secondPlacePrize / Math.max(1, secondPlaceTeamFull.userIds.length));

            const tournamentResults = new TournamentResults({
                tournamentEndDate: new Date(),
                firstPlace: {
                    team: winnerTeam._id,
                    userIds: winnerTeamFull.userIds,
                    prizePerUser: firstPlacePrizePerUser
                },
                secondPlace: {
                    team: secondPlaceTeam._id,
                    userIds: secondPlaceTeamFull.userIds,
                    prizePerUser: secondPlacePrizePerUser
                },
                totalPrizeFund: Math.floor(totalPrizeFund)
            });

            await tournamentResults.save();

            await distributeRewards(
                winnerTeamFull.userIds, 
                firstPlacePrizePerUser,
                'First place prize'
            );
            await distributeRewards(
                secondPlaceTeamFull.userIds, 
                secondPlacePrizePerUser,
                'Second place prize'
            );

            await TradingPair.updateMany({}, {
                $set: {
                    userIds: [],
                    teamCost: 100
                }
            });

            await TournamentSettings.updateOne({}, {
                $set: {
                    totalReservationIncome: 0,
                    prizeFund: 0,
                    status: 'completed'
                }
            });
            
            if (settings && settings.autoMode) {
                const now = new Date();
                const nextTournamentTime = new Date(now.getTime() + settings.autoInterval * 60 * 1000);
                
                await TournamentSettings.updateOne({}, {
                    $set: {
                        nextAutoTournamentTime: nextTournamentTime,
                        startTime: nextTournamentTime
                    }
                });
                
                console.log(`Scheduled automatic start of next tournament at ${nextTournamentTime.toISOString()} (local time: ${new Date(nextTournamentTime).toLocaleString()})`);
                
                const timeUntilNextTournament = nextTournamentTime.getTime() - now.getTime();
                
                if (global.nextTournamentTimer) {
                    clearTimeout(global.nextTournamentTimer);
                }
                
                global.nextTournamentTimer = setTimeout(async () => {
                    try {
                        const currentSettings = await TournamentSettings.findOne();
                        if (currentSettings && currentSettings.status === 'completed') {
                            console.log('Automatic tournament start...');
                            
                            try {
                                await bybitService.initializeWebSocket();
                                console.log('WebSocket restarted before automatic tournament start');
                                
                                await new Promise(resolve => setTimeout(resolve, 5000));
                                
                                const allPairsHavePrices = await bybitService.ensureAllPairsHavePrices();
                                if (!allPairsHavePrices) {
                                    console.error('Failed to get prices for all pairs. Retrying...');
                                    await new Promise(resolve => setTimeout(resolve, 3000));
                                }
                            } catch (wsError) {
                                console.error('WebSocket restart error:', wsError);
                            }
                            
                            if (global.tournamentTimers) {
                                Object.values(global.tournamentTimers).forEach(timer => clearTimeout(timer));
                            }
                            
                            await Match.deleteMany({});
                            console.log('Deleted all matches from previous tournament');
                            
                            await TournamentSettings.updateOne({}, {
                                $set: {
                                    status: 'running'
                                }
                            });
                            console.log('Tournament status changed to "running", team reservation blocked');
                            
                            bybitService.resetAllPrices();
                            console.log('Reset all trading pair prices');
                            
                            const drawSuccess = await performDraw();
                            if (!drawSuccess) {
                                console.error('Draw error during automatic tournament start');
                                return;
                            }
                            
                            const tournamentStarted = await startTournament();
                            if (!tournamentStarted) {
                                console.error('Tournament start error in automatic mode');
                            }
                        }
                    } catch (error) {
                        console.error('Automatic tournament start error:', error);
                    }
                }, timeUntilNextTournament);
            }
        }

        await bybitService.resetAndSetAllStartPrices();

        await checkAndCreateNextRound();
    } catch (error) {
        console.error('Match completion error:', error);
    }
}

async function distributeRewards(userIds, amount, description) {
    for (const userId of userIds) {
        const userFinance = await UserFinance.findOne({ userId });
        if (userFinance) {
            userFinance.balance += amount;
            userFinance.transactions.push({
                type: 'win',
                amount: amount,
                description: description
            });
            await userFinance.save();
        }
    }
}

router.get('/live-prices', async (req, res) => {
    try {
        const activeMatches = await Match.find({ status: 'active' })
            .populate('pair1')
            .populate('pair2');

        const livePrices = {};

        for (const match of activeMatches) {
            const pair1Symbol = match.pair1.symbol;
            const pair2Symbol = match.pair2.symbol;

            const pair1CurrentPrice = bybitService.getCurrentPrice(pair1Symbol);
            const pair2CurrentPrice = bybitService.getCurrentPrice(pair2Symbol);
            
            const pair1StartPrice = bybitService.getStartPrice(pair1Symbol);
            const pair2StartPrice = bybitService.getStartPrice(pair2Symbol);

            if (pair1CurrentPrice && pair1StartPrice) {
                const pair1Change = ((pair1CurrentPrice - pair1StartPrice) / pair1StartPrice) * 100;
                livePrices[match._id] = {
                    pair1: {
                        currentPrice: pair1CurrentPrice.toFixed(2),
                        change: pair1Change.toFixed(2)
                    }
                };
            }

            if (pair2CurrentPrice && pair2StartPrice) {
                const pair2Change = ((pair2CurrentPrice - pair2StartPrice) / pair2StartPrice) * 100;
                livePrices[match._id] = {
                    ...livePrices[match._id],
                    pair2: {
                        currentPrice: pair2CurrentPrice.toFixed(2),
                        change: pair2Change.toFixed(2)
                    }
                };
            }

            console.log(`Current prices for match ${match._id}:`, livePrices[match._id]);
        }

        res.json(livePrices);
    } catch (error) {
        console.error('Error getting current prices:', error);
        res.status(500).json({ error: 'Error getting current prices' });
    }
});

router.post('/restart-websocket', async (req, res) => {
    try {
        await bybitService.initializeWebSocket();
        res.json({ message: 'WebSocket restarted successfully' });
    } catch (error) {
        console.error('WebSocket restart error:', error);
        res.status(500).json({ error: 'WebSocket restart error' });
    }
});

router.get('/tournament-fund', async (req, res) => {
    try {
        const settings = await TournamentSettings.findOne();
        res.json({
            totalReservationIncome: settings?.totalReservationIncome || 0,
            prizeFund: settings?.prizeFund || 0
        });
    } catch (error) {
        console.error('Error getting tournament fund info:', error);
        res.status(500).json({ error: 'Error getting tournament fund info' });
    }
});

router.post('/matches/:id/set-start-prices', async (req, res) => {
    try {
        const match = await Match.findById(req.params.id)
            .populate('pair1')
            .populate('pair2');

        if (!match) {
            return res.status(404).json({ error: 'Match not found' });
        }

        const pair1Success = bybitService.setStartPriceForSymbol(match.pair1.symbol);
        const pair2Success = bybitService.setStartPriceForSymbol(match.pair2.symbol);

        if (!pair1Success || !pair2Success) {
            return res.status(400).json({ error: 'Failed to set start prices' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error setting start prices:', error);
        res.status(500).json({ error: 'Error setting start prices' });
    }
});

router.post('/reset-prices', async (req, res) => {
    try {
        bybitService.resetAllPrices();
        res.json({ success: true });
    } catch (error) {
        console.error('Error resetting prices:', error);
        res.status(500).json({ error: 'Error resetting prices' });
    }
});

router.post('/tournament/update-status', async (req, res) => {
    try {
        const { status } = req.body;
        const settings = await TournamentSettings.findOne();
        if (!settings) {
            return res.status(400).json({ error: 'Tournament settings not found' });
        }

        settings.status = status;
        await settings.save();

        res.json({ success: true, status });
    } catch (error) {
        console.error('Error updating tournament status:', error);
        res.status(500).json({ error: 'Error updating tournament status' });
    }
});

router.post('/check-websocket', async (req, res) => {
    try {
        const isConnected = bybitService.checkWebSocketConnection();
        
        if (!isConnected) {
            await bybitService.initializeWebSocket();
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        res.json({ success: true, isConnected });
    } catch (error) {
        console.error('WebSocket check error:', error);
        res.status(500).json({ error: 'WebSocket check error' });
    }
});

router.get('/admin-balance', async (req, res) => {
    try {
        const adminFinance = await UserFinance.findOne({ userId: 'admin' });
        
        if (!adminFinance) {
            return res.json({
                balance: 0,
                transactions: []
            });
        }
        
        const roundedBalance = parseFloat(adminFinance.balance.toFixed(1));
        
        const recentTransactions = adminFinance.transactions
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 10);
        
        res.json({
            balance: roundedBalance,
            transactions: recentTransactions
        });
    } catch (error) {
        console.error('Error getting admin balance:', error);
        res.status(500).json({ error: 'Error getting admin balance' });
    }
});

async function performDraw() {
    try {
        const pairs = await TradingPair.find();
        if (pairs.length < 32) {
            console.error('Not enough trading pairs for draw');
            return false;
        }

        const shuffledPairs = pairs.sort(() => Math.random() - 0.5);

        const sixteenthMatches = [];
        for (let i = 0; i < 32; i += 2) {
            sixteenthMatches.push({
                pair1: shuffledPairs[i]._id,
                pair2: shuffledPairs[i + 1]._id,
                round: 1,
                roundName: 'sixteenth',
                status: 'pending'
            });
        }

        await Match.insertMany(sixteenthMatches);
        console.log('Draw completed successfully');
        return true;
    } catch (error) {
        console.error('Draw error:', error);
        return false;
    }
}

async function startTournament() {
    try {
        const settings = await TournamentSettings.findOne();
        if (!settings) {
            console.error('Tournament settings not found');
            return false;
        }

        console.log('Preparing tournament start...');
        
        try {
            await bybitService.initializeWebSocket();
            console.log('WebSocket restarted before tournament start');
            
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const allPairsHavePrices = await bybitService.ensureAllPairsHavePrices();
            if (!allPairsHavePrices) {
                console.error('Failed to get prices for all pairs. Retrying...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        } catch (wsError) {
            console.error('WebSocket restart error:', wsError);
        }
        
        if (global.tournamentTimers) {
            Object.values(global.tournamentTimers).forEach(timer => clearTimeout(timer));
        }

        await Match.deleteMany({});
        console.log('Deleted all matches from previous tournament');
        
        await TournamentSettings.updateOne({}, {
            $set: {
                status: 'running'
            }
        });
        console.log('Tournament status changed to "running", team reservation blocked');

        bybitService.resetAllPrices();
        console.log('Reset all trading pair prices');

        const existingMatches = await Match.find();
        if (existingMatches.length === 0) {
            const drawSuccess = await performDraw();
            if (!drawSuccess) {
                console.error('Draw error during tournament start');
                return false;
            }
        }

        const matches = await Match.find({ round: 1 }).sort({ _id: 1 });
        if (matches.length === 0) {
            console.error('No first round matches found');
            return false;
        }

        global.tournamentTimers = global.tournamentTimers || {};
        Object.values(global.tournamentTimers).forEach(timer => clearTimeout(timer));

        let currentDelay = Math.max(0, new Date(settings.startTime) - new Date());

        matches.forEach((match, index) => {
            global.tournamentTimers[`start_${match._id}`] = setTimeout(async () => {
                try {
                    const isConnected = await bybitService.checkWebSocketConnection();
                    if (!isConnected) {
                        console.log('WebSocket not connected before match, restarting...');
                        await bybitService.initializeWebSocket();
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                    
                    const currentMatch = await Match.findById(match._id)
                        .populate('pair1')
                        .populate('pair2');
                    
                    if (currentMatch && currentMatch.status === 'pending') {
                        bybitService.resetStartPrice(currentMatch.pair1.symbol);
                        bybitService.resetStartPrice(currentMatch.pair2.symbol);
                        
                        const pair1Price = bybitService.getCurrentPrice(currentMatch.pair1.symbol);
                        const pair2Price = bybitService.getCurrentPrice(currentMatch.pair2.symbol);
                        
                        if (!pair1Price || !pair2Price) {
                            console.log(`Missing prices for pairs ${currentMatch.pair1.symbol} or ${currentMatch.pair2.symbol}, fetching via REST API...`);
                            await bybitService.fetchInitialPrice(currentMatch.pair1.symbol);
                            await bybitService.fetchInitialPrice(currentMatch.pair2.symbol);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                        
                        const pair1StartPrice = bybitService.setStartPrice(currentMatch.pair1.symbol);
                        const pair2StartPrice = bybitService.setStartPrice(currentMatch.pair2.symbol);
                        
                        if (!pair1StartPrice || !pair2StartPrice) {
                            console.error(`Failed to set start prices for match ${match._id}. Retrying...`);
                            await bybitService.fetchInitialPrice(currentMatch.pair1.symbol);
                            await bybitService.fetchInitialPrice(currentMatch.pair2.symbol);
                            bybitService.setStartPrice(currentMatch.pair1.symbol);
                            bybitService.setStartPrice(currentMatch.pair2.symbol);
                        }

                        currentMatch.status = 'active';
                        currentMatch.startTime = new Date();
                        await currentMatch.save();
                        console.log(`Match ${match._id} (Round ${match.round}) started`);
                    }
                } catch (error) {
                    console.error(`Error starting match ${match._id}:`, error);
                }
            }, currentDelay);

            global.tournamentTimers[`end_${match._id}`] = setTimeout(async () => {
                try {
                    const currentMatch = await Match.findById(match._id);
                    if (currentMatch && currentMatch.status === 'active') {
                        await handleMatchCompletion(match._id);
                    }
                } catch (error) {
                    console.error(`Error completing match ${match._id}:`, error);
                }
            }, currentDelay + settings.matchDuration * 1000);

            currentDelay += (settings.matchDuration + settings.breakDuration) * 1000;
        });

        console.log('Tournament started');
        return true;
    } catch (error) {
        console.error('Tournament start error:', error);
        return false;
    }
}

// TON ADMIN ROUTES

router.get('/ton-transactions', async (req, res) => {
    try {
        const { page = 1, limit = 50, status, type } = req.query;
        
        const filter = {};
        if (status) filter.status = status;
        if (type) filter.type = type;
        
        const transactions = await TonTransaction.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .populate('userId', 'userId balance');
        
        const total = await TonTransaction.countDocuments(filter);
        
        res.json({
            transactions,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        console.error('Error getting TON transactions:', error);
        res.status(500).json({ error: 'Error getting transactions' });
    }
});

router.get('/ton-stats', async (req, res) => {
    try {
        const stats = await tonService.getTonTransactionStats();
        
        const totalTransactions = await TonTransaction.countDocuments();
        const todayTransactions = await TonTransaction.countDocuments({
            createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        });
        
        const userStats = await TonTransaction.aggregate([
            {
                $group: {
                    _id: '$userId',
                    totalTransactions: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    totalTonAmount: { $sum: '$tonAmount' }
                }
            },
            { $sort: { totalAmount: -1 } },
            { $limit: 10 }
        ]);
        
        res.json({
            statusStats: stats,
            totalTransactions,
            todayTransactions,
            topUsers: userStats
        });
    } catch (error) {
        console.error('Error getting TON stats:', error);
        res.status(500).json({ error: 'Error getting stats' });
    }
});

router.post('/ton-transactions/:id/confirm', async (req, res) => {
    try {
        const { id } = req.params;
        const transaction = await TonTransaction.findById(id);
        
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        if (transaction.status !== 'pending') {
            return res.status(400).json({ error: 'Transaction already processed' });
        }
        
        transaction.status = 'confirmed';
        transaction.confirmedAt = new Date();
        await transaction.save();
        
        if (transaction.type === 'deposit') {
            const userFinance = await UserFinance.findOne({ userId: transaction.userId });
            if (userFinance) {
                userFinance.balance = parseFloat((userFinance.balance + transaction.amount).toFixed(1));
                userFinance.transactions.push({
                    type: 'ton_deposit',
                    amount: transaction.amount,
                    description: `TON deposit (confirmed by admin)`,
                    timestamp: new Date(),
                    hash: transaction.transactionHash,
                    tonAmount: transaction.tonAmount
                });
                await userFinance.save();
            }
        }
        
        res.json({ 
            message: 'Transaction confirmed',
            transaction 
        });
    } catch (error) {
        console.error('Error confirming transaction:', error);
        res.status(500).json({ error: 'Error confirming transaction' });
    }
});

router.post('/ton-transactions/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        const transaction = await TonTransaction.findById(id);
        
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        if (transaction.status !== 'pending') {
            return res.status(400).json({ error: 'Transaction already processed' });
        }
        
        transaction.status = 'failed';
        transaction.errorMessage = reason || 'Rejected by admin';
        await transaction.save();
        
        if (transaction.type === 'withdraw') {
            const userFinance = await UserFinance.findOne({ userId: transaction.userId });
            if (userFinance) {
                userFinance.balance = parseFloat((userFinance.balance + transaction.amount).toFixed(1));
                userFinance.transactions.push({
                    type: 'withdrawal',
                    amount: transaction.amount,
                    description: `Fund return (withdrawal rejected)`,
                    timestamp: new Date()
                });
                await userFinance.save();
            }
        }
        
        res.json({ 
            message: 'Transaction rejected',
            transaction 
        });
    } catch (error) {
        console.error('Error rejecting transaction:', error);
        res.status(500).json({ error: 'Error rejecting transaction' });
    }
});

router.post('/ton-transactions/:id/process-withdrawal', async (req, res) => {
    try {
        const { id } = req.params;
        const { realTransactionHash } = req.body;
        
        const transaction = await TonTransaction.findById(id);
        
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        if (transaction.type !== 'withdraw') {
            return res.status(400).json({ error: 'This is not a withdrawal transaction' });
        }
        
        if (transaction.status !== 'pending') {
            return res.status(400).json({ error: 'Transaction already processed' });
        }
        
        transaction.transactionHash = realTransactionHash;
        transaction.status = 'confirmed';
        transaction.confirmedAt = new Date();
        await transaction.save();
        
        res.json({ 
            message: 'Withdrawal processed',
            transaction 
        });
    } catch (error) {
        console.error('Error processing withdrawal:', error);
        res.status(500).json({ error: 'Error processing withdrawal' });
    }
});

router.post('/ton-transactions/bulk-update', async (req, res) => {
    try {
        const { transactionIds, action, reason } = req.body;
        
        if (!transactionIds || !Array.isArray(transactionIds) || !action) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }
        
        const results = [];
        
        for (const id of transactionIds) {
            try {
                const transaction = await TonTransaction.findById(id);
                
                if (!transaction || transaction.status !== 'pending') {
                    continue;
                }
                
                if (action === 'confirm') {
                    transaction.status = 'confirmed';
                    transaction.confirmedAt = new Date();
                    
                    if (transaction.type === 'deposit') {
                        const userFinance = await UserFinance.findOne({ userId: transaction.userId });
                        if (userFinance) {
                            userFinance.balance = parseFloat((userFinance.balance + transaction.amount).toFixed(1));
                            userFinance.transactions.push({
                                type: 'ton_deposit',
                                amount: transaction.amount,
                                description: `TON deposit (bulk confirmation)`,
                                timestamp: new Date(),
                                hash: transaction.transactionHash,
                                tonAmount: transaction.tonAmount
                            });
                            await userFinance.save();
                        }
                    }
                } else if (action === 'reject') {
                    transaction.status = 'failed';
                    transaction.errorMessage = reason || 'Bulk rejection';
                    
                    if (transaction.type === 'withdraw') {
                        const userFinance = await UserFinance.findOne({ userId: transaction.userId });
                        if (userFinance) {
                            userFinance.balance = parseFloat((userFinance.balance + transaction.amount).toFixed(1));
                            userFinance.transactions.push({
                                type: 'withdrawal',
                                amount: transaction.amount,
                                description: `Fund return (bulk rejection)`,
                                timestamp: new Date()
                            });
                            await userFinance.save();
                        }
                    }
                }
                
                await transaction.save();
                results.push({ id, status: 'success' });
            } catch (error) {
                console.error(`Error processing transaction ${id}:`, error);
                results.push({ id, status: 'error', error: error.message });
            }
        }
        
        res.json({ 
            message: 'Bulk update completed',
            results 
        });
    } catch (error) {
        console.error('Bulk update error:', error);
        res.status(500).json({ error: 'Bulk update error' });
    }
});

router.get('/ton-transactions/export', async (req, res) => {
    try {
        const { format = 'json', startDate, endDate } = req.query;
        
        const filter = {};
        if (startDate && endDate) {
            filter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }
        
        const transactions = await TonTransaction.find(filter)
            .sort({ createdAt: -1 })
            .populate('userId', 'userId balance');
        
        if (format === 'csv') {
            const csvHeader = 'ID,User ID,Transaction Hash,From Address,To Address,Amount AGTI,Amount TON,Type,Status,Created At,Confirmed At\n';
            const csvData = transactions.map(tx => 
                `${tx._id},${tx.userId},${tx.transactionHash},${tx.fromAddress},${tx.toAddress},${tx.amount},${tx.tonAmount},${tx.type},${tx.status},${tx.createdAt},${tx.confirmedAt || ''}`
            ).join('\n');
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="ton-transactions.csv"');
            res.send(csvHeader + csvData);
        } else {
            res.json(transactions);
        }
    } catch (error) {
        console.error('Error exporting transactions:', error);
        res.status(500).json({ error: 'Error exporting transactions' });
    }
});

router.get('/ton-config', async (req, res) => {
    try {
        res.json({
            gameWalletAddress: tonService.config.gameWalletAddress,
            minDepositAmount: tonService.config.minDepositAmount,
            networkFee: tonService.config.networkFee,
            tonToAgtiRate: tonService.config.tonToAgtiRate,
            confirmationTimeout: tonService.config.confirmationTimeout
        });
    } catch (error) {
        console.error('Error getting TON config:', error);
        res.status(500).json({ error: 'Error getting config' });
    }
});

router.post('/ton-config', async (req, res) => {
    try {
        const { 
            minDepositAmount, 
            networkFee, 
            tonToAgtiRate, 
            confirmationTimeout 
        } = req.body;
        
        if (minDepositAmount) tonService.config.minDepositAmount = minDepositAmount;
        if (networkFee) tonService.config.networkFee = networkFee;
        if (tonToAgtiRate) tonService.config.tonToAgtiRate = tonToAgtiRate;
        if (confirmationTimeout) tonService.config.confirmationTimeout = confirmationTimeout;
        
        res.json({ 
            message: 'TON configuration updated',
            config: tonService.config
        });
    } catch (error) {
        console.error('Error updating TON config:', error);
        res.status(500).json({ error: 'Error updating config' });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const TradingPair = require('../models/TradingPair');
const Match = require('../models/Match');
const TournamentSettings = require('../models/TournamentSettings');
const bybitService = require('../services/bybitService');
const UserFinance = require('../models/UserFinance');
const ReferralInfo = require('../models/ReferralInfo');
const TournamentResults = require('../models/TournamentResults');
const tonService = require('../services/tonService');

router.get('/pairs', async (req, res) => {
    try {
        const pairs = await TradingPair.find();
        res.json(pairs);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching pairs' });
    }
});

router.get('/user-pair/:userId', async (req, res) => {
    try {
        const pair = await TradingPair.findOne({ 
            userIds: { $in: [req.params.userId] } 
        });
        res.json(pair);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching user pair' });
    }
});

router.post('/reserve', async (req, res) => {
    try {
        const { pairId, userId } = req.body;
        const COMMISSION_RATE = 0.19;
        const REFERRAL_RATE = 0.01;

        const pair = await TradingPair.findById(pairId);
        if (!pair) {
            return res.status(400).json({ error: 'Pair not found' });
        }

        if (pair.userIds.includes(userId)) {
            return res.status(400).json({ error: 'Team already reserved' });
        }

        const existingTeam = await TradingPair.findOne({ 
            userIds: { $in: [userId] } 
        });
        if (existingTeam) {
            return res.status(400).json({ 
                error: 'User already has reserved team' 
            });
        }

        const finance = await UserFinance.findOne({ userId });
        if (!finance || finance.balance < pair.teamCost) {
            return res.status(400).json({ 
                error: `Insufficient funds. Required ${pair.teamCost} AGTI` 
            });
        }

        const settings = await TournamentSettings.findOne();
        if (!settings) {
            return res.status(400).json({ error: 'Waiting for tournament settings' });
        }

        let adminFinance = await UserFinance.findOne({ userId: 'admin' });
        if (!adminFinance) {
            adminFinance = new UserFinance({
                userId: 'admin',
                balance: 0,
                transactions: []
            });
        }

        if (finance.refId) {
            const referralAmount = pair.teamCost * REFERRAL_RATE;
            const tournamentAmount = pair.teamCost * (1 - REFERRAL_RATE);

            const referrerFinance = await UserFinance.findOne({ userId: finance.refId });
            if (referrerFinance) {
                const roundedReferralAmount = parseFloat(referralAmount.toFixed(1));
                referrerFinance.balance = parseFloat((referrerFinance.balance + roundedReferralAmount).toFixed(1));
                referrerFinance.transactions.push({
                    type: 'referral',
                    amount: roundedReferralAmount,
                    description: `Referral reward from ${userId}`,
                    timestamp: new Date()
                });
                await referrerFinance.save();
            }

            settings.totalReservationIncome += tournamentAmount;
            
            const adminCommission = tournamentAmount * COMMISSION_RATE;
            const roundedAdminCommission = parseFloat(adminCommission.toFixed(1));
            adminFinance.balance = parseFloat((adminFinance.balance + roundedAdminCommission).toFixed(1));
            adminFinance.transactions.push({
                type: 'commission',
                amount: roundedAdminCommission,
                description: `Commission from team reservation ${userId}`,
                timestamp: new Date()
            });
        } else {
            settings.totalReservationIncome += pair.teamCost;
            
            const adminCommission = pair.teamCost * COMMISSION_RATE;
            const roundedAdminCommission = parseFloat(adminCommission.toFixed(1));
            adminFinance.balance = parseFloat((adminFinance.balance + roundedAdminCommission).toFixed(1));
            adminFinance.transactions.push({
                type: 'commission',
                amount: roundedAdminCommission,
                description: `Commission from team reservation ${userId}`,
                timestamp: new Date()
            });
        }

        await adminFinance.save();

        const calculatedPrizeFund = settings.totalReservationIncome * (1 - COMMISSION_RATE);
        settings.prizeFund = Math.floor(calculatedPrizeFund);
        await settings.save();

        finance.balance = parseFloat((finance.balance - pair.teamCost).toFixed(1));
        finance.transactions.push({
            type: 'reservation',
            amount: -pair.teamCost,
            description: `Reserved ${pair.symbol}`,
            timestamp: new Date()
        });
        await finance.save();

        pair.userIds.push(userId);
        pair.teamCost += 100;
        await pair.save();

        res.json({
            success: true,
            message: 'Pair reserved successfully',
            pair,
            finance,
            tournamentInfo: {
                totalReservationIncome: settings.totalReservationIncome,
                prizeFund: settings.prizeFund
            }
        });
    } catch (error) {
        console.error('Reservation error:', error);
        res.status(500).json({ error: 'Error reserving pair' });
    }
});

router.get('/matches', async (req, res) => {
    try {
        const matches = await Match.find()
            .populate('pair1')
            .populate('pair2')
            .populate('winner')
            .sort({ round: 1, createdAt: 1 });
        res.json(matches);
    } catch (error) {
        console.error('Error fetching matches:', error);
        res.status(500).json({ error: 'Waiting for tournament start' });
    }
});

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

            livePrices[match._id] = {
                pair1: {
                    currentPrice: 0,
                    change: 0
                },
                pair2: {
                    currentPrice: 0,
                    change: 0
                }
            };

            if (pair1CurrentPrice && pair1StartPrice) {
                const pair1Change = ((pair1CurrentPrice - pair1StartPrice) / pair1StartPrice) * 100;
                livePrices[match._id].pair1 = {
                    currentPrice: pair1CurrentPrice.toFixed(2),
                    change: pair1Change.toFixed(2)
                };
            }

            if (pair2CurrentPrice && pair2StartPrice) {
                const pair2Change = ((pair2CurrentPrice - pair2StartPrice) / pair2StartPrice) * 100;
                livePrices[match._id].pair2 = {
                    currentPrice: pair2CurrentPrice.toFixed(2),
                    change: pair2Change.toFixed(2)
                };
            }
        }

        res.json(livePrices);
    } catch (error) {
        console.error('Error fetching current prices:', error);
        res.status(500).json({ error: 'Error fetching current prices' });
    }
});

router.get('/tournament-settings', async (req, res) => {
    try {
        const settings = await TournamentSettings.findOne();
        if (!settings) {
            return res.status(404).json({ error: 'Waiting for tournament settings' });
        }
        res.json(settings);
    } catch (error) {
        console.error('Error fetching tournament settings:', error);
        res.status(500).json({ error: 'Error fetching tournament settings' });
    }
});

router.get('/tournament-status', async (req, res) => {
    try {
        const settings = await TournamentSettings.findOne();
        res.json({ 
            status: settings?.status || 'pending'
        });
    } catch (error) {
        console.error('Error fetching tournament status:', error);
        res.status(500).json({ error: 'Error fetching tournament status' });
    }
});

router.get('/finance/:userId', async (req, res) => {
    try {
        let finance = await UserFinance.findOne({ userId: req.params.userId });
        if (!finance) {
            finance = { balance: 0, transactions: [] };
        } else {
            finance = finance.toObject();
            finance.balance = parseFloat(finance.balance.toFixed(1));
            
            if (finance.knlBalance !== undefined) {
                finance.knlBalance = parseFloat(finance.knlBalance.toFixed(1));
            }
        }
        res.json(finance);
    } catch (error) {
        console.error('Error fetching financial information:', error);
        res.status(500).json({ error: 'Error fetching financial information' });
    }
});

router.post('/matches/:id/complete', async (req, res) => {
    try {
        const match = await Match.findById(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error completing match:', error);
        res.status(500).json({ error: 'Error completing match' });
    }
});

router.post('/generate-ref-code', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'UserId is required' });
        }

        let user = await UserFinance.findOne({ userId });
        
        if (!user) {
            user = new UserFinance({
                userId,
                balance: 0,
                transactions: []
            });
            await user.save();
        }

        if (user.refCode) {
            const referralInfo = await ReferralInfo.findOne({ referrerId: userId });
            return res.json({ 
                refCode: user.refCode,
                refLink: `${process.env.BOT_URL || 'YOUR_TELEGRAM_BOT_URL'}?start=${user.refCode}`,
                referrals: referralInfo?.referrals || []
            });
        }

        const randomStr = Math.random().toString(36).substring(2, 8);
        const refCode = `${userId}_${randomStr}`;

        user.refCode = refCode;
        await user.save();

        const referralInfo = new ReferralInfo({
            referrerId: userId,
            refCode: refCode,
            referrals: [],
            totalReferrals: 0
        });
        await referralInfo.save();

        res.json({ 
            refCode,
            refLink: `${process.env.BOT_URL || 'YOUR_TELEGRAM_BOT_URL'}?start=${refCode}`,
            referrals: []
        });
    } catch (error) {
        console.error('Error generating referral code:', error);
        res.status(500).json({ error: 'Error generating referral code' });
    }
});

router.post('/activate-ref-code', async (req, res) => {
    res.status(301).json({ 
        message: 'This endpoint has been moved to the referral bot service. Please use the Telegram bot to activate referral codes.',
        botLink: process.env.BOT_URL || 'YOUR_TELEGRAM_BOT_URL'
    });
});

router.get('/referral-info/:userId', async (req, res) => {
    try {
        const referralInfo = await ReferralInfo.findOne({ referrerId: req.params.userId });
        if (!referralInfo) {
            return res.json({ referrals: [], totalReferrals: 0 });
        }
        res.json({
            referrals: referralInfo.referrals,
            totalReferrals: referralInfo.totalReferrals
        });
    } catch (error) {
        console.error('Error fetching referral info:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/user-wallet/:userId', async (req, res) => {
    try {
        const userFinance = await UserFinance.findOne({ userId: req.params.userId });
        res.json({ wallet: userFinance?.walletAddress || null });
    } catch (error) {
        console.error('Error fetching user wallet:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/link-wallet', async (req, res) => {
    try {
        const { userId, walletAddress } = req.body;
        
        if (!walletAddress || walletAddress.length !== 42 || !walletAddress.startsWith('0x')) {
            return res.status(400).json({ message: 'Invalid wallet address' });
        }

        const existingWallet = await UserFinance.findOne({ walletAddress });
        if (existingWallet) {
            return res.status(400).json({ message: 'This wallet is already linked to another account' });
        }

        const userFinance = await UserFinance.findOneAndUpdate(
            { userId },
            { $set: { walletAddress } },
            { upsert: true, new: true }
        );

        res.json({ success: true, wallet: userFinance.walletAddress });
    } catch (error) {
        console.error('Error linking wallet:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/tournament-results', async (req, res) => {
    try {
        const results = await TournamentResults.findOne()
            .sort({ createdAt: -1 })
            .populate('firstPlace.team')
            .populate('secondPlace.team');

        if (!results) {
            return res.status(404).json({ message: 'Tournament results not found' });
        }

        res.json(results);
    } catch (error) {
        console.error('Error fetching tournament results:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ========== TON CONNECT ROUTES ==========

router.post('/ton-deposit', async (req, res) => {
    try {
        const { userId, transactionHash, tonAmount, fromAddress } = req.body;

        if (!userId || !transactionHash || !tonAmount || !fromAddress) {
            return res.status(400).json({ 
                error: 'Insufficient data for deposit processing' 
            });
        }

        const result = await tonService.processDeposit(userId, transactionHash, tonAmount, fromAddress);

        res.json(result);
    } catch (error) {
        console.error('Error processing TON deposit:', error);
        res.status(500).json({ 
            error: error.message || 'Error processing deposit' 
        });
    }
});

router.post('/ton-withdraw', async (req, res) => {
    try {
        const { userId, amount, tonAddress } = req.body;

        if (!userId || !amount || !tonAddress) {
            return res.status(400).json({ 
                error: 'Insufficient data for withdrawal' 
            });
        }

        const result = await tonService.processWithdrawal(userId, amount, tonAddress);

        res.json(result);
    } catch (error) {
        console.error('Error processing TON withdrawal:', error);
        res.status(500).json({ 
            error: error.message || 'Error processing withdrawal' 
        });
    }
});

router.post('/withdraw', async (req, res) => {
    try {
        const { userId, amount, tonAddress, tonAmount } = req.body;

        if (!userId || !amount || !tonAddress) {
            return res.status(400).json({ 
                error: 'Insufficient data for withdrawal' 
            });
        }

        const result = await tonService.processWithdrawal(userId, amount, tonAddress);

        res.json(result);
    } catch (error) {
        console.error('Error processing withdrawal:', error);
        res.status(500).json({ 
            error: error.message || 'Error processing withdrawal' 
        });
    }
});

router.get('/ton-balance/:address', async (req, res) => {
    try {
        const { address } = req.params;

        if (!tonService.validateTonAddress(address)) {
            return res.status(400).json({ 
                error: 'Invalid TON address format' 
            });
        }

        const balance = await tonService.getTonBalance(address);
        res.json({ balance });
    } catch (error) {
        console.error('Error getting TON balance:', error);
        res.status(500).json({ 
            error: 'Error getting balance' 
        });
    }
});

router.get('/ton-transactions/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const transactions = await tonService.getUserTonTransactions(userId);
        res.json(transactions);
    } catch (error) {
        console.error('Error getting TON transactions:', error);
        res.status(500).json({ 
            error: 'Error getting transactions' 
        });
    }
});

router.post('/ton-verify', async (req, res) => {
    try {
        const { transactionHash } = req.body;

        if (!transactionHash) {
            return res.status(400).json({ 
                error: 'Transaction hash required' 
            });
        }

        const verification = await tonService.verifyTonTransaction(transactionHash);
        res.json(verification);
    } catch (error) {
        console.error('Error verifying TON transaction:', error);
        res.status(500).json({ 
            error: 'Error verifying transaction' 
        });
    }
});

router.get('/ton-stats', async (req, res) => {
    try {
        const stats = await tonService.getTonTransactionStats();
        res.json(stats);
    } catch (error) {
        console.error('Error getting TON stats:', error);
        res.status(500).json({ 
            error: 'Error getting stats' 
        });
    }
});

router.post('/ton-convert', async (req, res) => {
    try {
        const { amount, fromCurrency } = req.body;

        if (!amount || !fromCurrency) {
            return res.status(400).json({ 
                error: 'Amount and currency required' 
            });
        }

        let result;
        if (fromCurrency === 'TON') {
            result = {
                tonAmount: amount,
                agtiAmount: tonService.convertTonToAgti(amount)
            };
        } else if (fromCurrency === 'AGTI') {
            result = {
                agtiAmount: amount,
                tonAmount: tonService.convertAgtiToTon(amount)
            };
        } else {
            return res.status(400).json({ 
                error: 'Only TON and AGTI supported' 
            });
        }

        res.json(result);
    } catch (error) {
        console.error('Error converting currencies:', error);
        res.status(500).json({ 
            error: 'Error converting currencies' 
        });
    }
});

router.post('/ton-validate-address', async (req, res) => {
    try {
        const { address } = req.body;

        if (!address) {
            return res.status(400).json({ 
                error: 'Address required for validation' 
            });
        }

        const isValid = tonService.validateTonAddress(address);
        res.json({ 
            address, 
            isValid,
            message: isValid ? 'Address is valid' : 'Address is invalid'
        });
    } catch (error) {
        console.error('Error validating address:', error);
        res.status(500).json({ 
            error: 'Error validating address' 
        });
    }
});

module.exports = router; 
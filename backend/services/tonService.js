const TonTransaction = require('../models/TonTransaction');
const UserFinance = require('../models/UserFinance');

const TON_CONFIG = {
    apiUrl: 'https://toncenter.com/api/v2',
    gameWalletAddress: process.env.GAME_WALLET_ADDRESS || 'YOUR_GAME_WALLET_ADDRESS',
    minDepositAmount: 0.1,
    networkFee: 0.01,
    tonToAgtiRate: 1000,
    confirmationTimeout: 300000
};

class TonService {
    constructor() {
        this.config = TON_CONFIG;
    }

    validateTonAddress(address) {
        if (!address || typeof address !== 'string') {
            return false;
        }
        
        const rawAddressPattern = /^-?[0-9]+:[a-fA-F0-9]{64}$/;
        const userFriendlyPattern = /^[a-zA-Z0-9_-]{48}$/;
        
        return rawAddressPattern.test(address) || userFriendlyPattern.test(address);
    }

    convertTonToAgti(tonAmount) {
        return parseFloat((tonAmount * this.config.tonToAgtiRate).toFixed(1));
    }

    convertAgtiToTon(agtiAmount) {
        return parseFloat((agtiAmount / this.config.tonToAgtiRate).toFixed(4));
    }

    async getTonBalance(address) {
        try {
            const response = await this.makeApiRequest(`/getAddressBalance?address=${address}`);
            
            if (response && response.result) {
                return parseFloat((response.result / 1000000000).toFixed(4));
            }
            
            return 0;
        } catch (error) {
            console.error('Error getting TON balance:', error);
            return 0;
        }
    }

    async verifyTonTransaction(transactionHash) {
        try {
            const response = await this.makeApiRequest(`/getTransactions?address=${this.config.gameWalletAddress}&limit=50`);
            
            if (response && response.result) {
                const transaction = response.result.find(tx => tx.transaction_id.hash === transactionHash);
                
                if (transaction) {
                    return {
                        exists: true,
                        confirmed: transaction.confirmed || false,
                        amount: parseFloat((transaction.in_msg.value / 1000000000).toFixed(4)),
                        fromAddress: transaction.in_msg.source,
                        toAddress: transaction.in_msg.destination,
                        blockNumber: transaction.block_id
                    };
                }
            }
            
            return { exists: false };
        } catch (error) {
            console.error('Error verifying transaction:', error);
            return { exists: false, error: error.message };
        }
    }

    async makeApiRequest(endpoint) {
        try {
            console.log(`TON API request: ${endpoint}`);
            
            return {
                ok: true,
                result: []
            };
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    async processDeposit(userId, transactionHash, tonAmount, fromAddress) {
        try {
            if (!userId || !transactionHash || !tonAmount || !fromAddress) {
                throw new Error('Insufficient parameters for deposit processing');
            }

            if (!this.validateTonAddress(fromAddress)) {
                throw new Error('Invalid TON address format');
            }

            if (tonAmount < this.config.minDepositAmount) {
                throw new Error(`Minimum deposit amount: ${this.config.minDepositAmount} TON`);
            }

            const existingTransaction = await TonTransaction.findOne({ transactionHash });
            if (existingTransaction) {
                throw new Error('Transaction already exists');
            }

            const agtiAmount = this.convertTonToAgti(tonAmount);
            
            const transaction = new TonTransaction({
                userId,
                transactionHash,
                fromAddress,
                toAddress: this.config.gameWalletAddress,
                amount: agtiAmount,
                tonAmount,
                type: 'deposit',
                status: 'pending',
                payload: {
                    originalRequest: {
                        userId,
                        tonAmount,
                        fromAddress
                    }
                }
            });

            await transaction.save();

            this.verifyAndConfirmTransaction(transaction._id);

            return {
                success: true,
                transaction: transaction,
                agtiAmount: agtiAmount,
                message: 'Deposit being processed'
            };
        } catch (error) {
            console.error('Error processing deposit:', error);
            throw error;
        }
    }

    async processWithdrawal(userId, agtiAmount, tonAddress) {
        try {
            if (!userId || !agtiAmount || !tonAddress) {
                throw new Error('Insufficient parameters for withdrawal');
            }

            if (!this.validateTonAddress(tonAddress)) {
                throw new Error('Invalid TON address format');
            }

            if (agtiAmount <= 0) {
                throw new Error('Withdrawal amount must be greater than 0');
            }

            const userFinance = await UserFinance.findOne({ userId });
            if (!userFinance || userFinance.balance < agtiAmount) {
                throw new Error('Insufficient funds for withdrawal');
            }

            const tonAmount = this.convertAgtiToTon(agtiAmount);
            
            const transaction = new TonTransaction({
                userId,
                transactionHash: `withdraw_${Date.now()}_${userId}`,
                fromAddress: this.config.gameWalletAddress,
                toAddress: tonAddress,
                amount: agtiAmount,
                tonAmount,
                type: 'withdraw',
                status: 'pending',
                payload: {
                    originalRequest: {
                        userId,
                        agtiAmount,
                        tonAddress
                    }
                }
            });

            await transaction.save();

            userFinance.balance = parseFloat((userFinance.balance - agtiAmount).toFixed(1));
            userFinance.transactions.push({
                type: 'withdrawal',
                amount: -agtiAmount,
                description: `Withdrawal ${tonAmount} TON to ${tonAddress}`,
                timestamp: new Date()
            });
            await userFinance.save();

            return {
                success: true,
                transaction: transaction,
                tonAmount: tonAmount,
                message: 'Withdrawal request created'
            };
        } catch (error) {
            console.error('Error processing withdrawal:', error);
            throw error;
        }
    }

    async verifyAndConfirmTransaction(transactionId) {
        try {
            const transaction = await TonTransaction.findById(transactionId);
            if (!transaction) {
                throw new Error('Transaction not found');
            }

            if (transaction.type === 'deposit') {
                const verification = await this.verifyTonTransaction(transaction.transactionHash);
                
                if (verification.exists && verification.confirmed) {
                    transaction.status = 'confirmed';
                    transaction.confirmedAt = new Date();
                    transaction.blockNumber = verification.blockNumber;
                    await transaction.save();

                    const userFinance = await UserFinance.findOne({ userId: transaction.userId });
                    if (userFinance) {
                        userFinance.balance = parseFloat((userFinance.balance + transaction.amount).toFixed(1));
                        userFinance.transactions.push({
                            type: 'deposit',
                            amount: transaction.amount,
                            description: `Deposit ${transaction.tonAmount} TON`,
                            timestamp: new Date(),
                            hash: transaction.transactionHash
                        });
                        await userFinance.save();
                    }

                    console.log(`Deposit confirmed: ${transaction.transactionHash}`);
                } else if (verification.error) {
                    transaction.status = 'failed';
                    transaction.errorMessage = verification.error;
                    await transaction.save();
                }
            }

            return transaction;
        } catch (error) {
            console.error('Error verifying transaction:', error);
            
            const transaction = await TonTransaction.findById(transactionId);
            if (transaction) {
                transaction.status = 'failed';
                transaction.errorMessage = error.message;
                await transaction.save();
            }
            
            throw error;
        }
    }

    async getUserTonTransactions(userId) {
        try {
            const transactions = await TonTransaction.find({ userId })
                .sort({ createdAt: -1 })
                .limit(50);

            return transactions;
        } catch (error) {
            console.error('Error getting transactions:', error);
            return [];
        }
    }

    async getTonTransactionStats() {
        try {
            const stats = await TonTransaction.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        totalAmount: { $sum: '$amount' },
                        totalTonAmount: { $sum: '$tonAmount' }
                    }
                }
            ]);

            return stats;
        } catch (error) {
            console.error('Error getting stats:', error);
            return [];
        }
    }
}

module.exports = new TonService(); 
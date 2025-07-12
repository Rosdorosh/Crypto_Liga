import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './UserPanel.css';
import { API_URL } from '../config';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { formatTonAddress, convertToTon, convertFromTon } from '../config/tonConnect';

function UserPanel() {
    // TON Connect hooks
    const [tonConnectUI] = useTonConnectUI();
    const wallet = useTonWallet();

    const [pairs, setPairs] = useState([]);
    const [userId, setUserId] = useState(null);
    const [error, setError] = useState('');
    const [matches, setMatches] = useState([]);
    const [liveMatchData, setLiveMatchData] = useState({});
    const [userPair, setUserPair] = useState(null);
    const [showTestInput, setShowTestInput] = useState(false);
    const [testUserId, setTestUserId] = useState('');
    const [tournamentSettings, setTournamentSettings] = useState({
        startTime: null,
        matchDuration: 0,
        breakDuration: 0,
        status: 'pending'
    });
    const [prizeFund, setPrizeFund] = useState(0);
    const [activeTab, setActiveTab] = useState('teams'); // 'teams', 'schedule', 'live'
    const [finance, setFinance] = useState({ balance: 0, transactions: [] });
    const [isLoading, setIsLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [refLink, setRefLink] = useState('');
    const [matchProgress, setMatchProgress] = useState(0);
    const [showTransactions, setShowTransactions] = useState(false);
    const [showRefCode, setShowRefCode] = useState(false);
    const [walletAddress, setWalletAddress] = useState('');
    const [userWallet, setUserWallet] = useState(null);
    const [showDeposit, setShowDeposit] = useState(false);
    const [showWithdraw, setShowWithdraw] = useState(false);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const GAME_WALLET = process.env.REACT_APP_GAME_WALLET || 'YOUR_GAME_WALLET_ADDRESS';
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [showRefModal, setShowRefModal] = useState(false);
    const [showLinkWalletModal, setShowLinkWalletModal] = useState(false);
    const [notification, setNotification] = useState(null);
    
    const [tonWalletAddress, setTonWalletAddress] = useState('');
    const [tonBalance, setTonBalance] = useState(0);
    const [isConnecting, setIsConnecting] = useState(false);

    useEffect(() => {
        const initTelegramApp = () => {
            try {
                if (window.Telegram?.WebApp) {
                    const webApp = window.Telegram.WebApp;
                    webApp.ready();
                    
                    const initData = webApp.initDataUnsafe;
                    console.log('Telegram WebApp initData:', initData);
                    
                    if (initData?.user?.id) {
                        setUserId(initData.user.id);
                        setShowTestInput(false);
                    } else {
                        console.log('User ID not found in initData');
                        setShowTestInput(true);
                    }
                } else {
                    console.log('Telegram WebApp not found');
                    setShowTestInput(true);
                }
            } catch (error) {
                console.error('Error initializing Telegram WebApp:', error);
                setShowTestInput(true);
            }
        };

        initTelegramApp();
        fetchTournamentSettings();
        fetchPairs();
        fetchMatches();
    }, []);

    useEffect(() => {
        const currentUserId = userId || testUserId;
        if (currentUserId) {
            fetchFinance();
        }
    }, [userId, testUserId]);

    useEffect(() => {
        if (wallet) {
            setTonWalletAddress(wallet.account.address);
            setUserWallet(wallet.account.address);
            fetchTonBalance(wallet.account.address);
        } else {
            setTonWalletAddress('');
            setTonBalance(0);
        }
    }, [wallet]);

    const fetchTonBalance = async (address) => {
        try {
            setTonBalance(0);
        } catch (error) {
            console.error('Error fetching TON balance:', error);
        }
    };

    const fetchPairs = async () => {
        try {
            const response = await axios.get(`${API_URL}/pairs`);
            setPairs(response.data);
        } catch (err) {
            console.error('Error loading pairs:', err);
        }
    };

    const fetchMatches = async () => {
        try {
            const response = await axios.get(`${API_URL}/matches`);
            setMatches(response.data);
        } catch (err) {
            console.error('Error loading matches:', err);
        }
    };

    useEffect(() => {
        const fetchUserPair = async () => {
            const currentUserId = userId || testUserId;
            if (currentUserId) {
                try {
                    const response = await axios.get(`${API_URL}/user-pair/${currentUserId}`);
                    if (response.data) {
                        setUserPair(response.data);
                    }
                } catch (err) {
                    console.error('Error fetching user pair:', err);
                }
            }
        };

        fetchUserPair();
    }, [userId, testUserId]);

    const [tournamentStarted, setTournamentStarted] = useState(false);

    useEffect(() => {
        const checkTournamentStatus = async () => {
            try {
                const response = await axios.get(`${API_URL}/tournament-status`);
                const newStatus = response.data.status;
                
                if (newStatus === 'pending' && tournamentSettings.status !== 'pending') {
                    await Promise.all([
                        fetchTournamentSettings(),
                        fetchMatches(),
                        fetchPairs()
                    ]);
                }
                
                setTournamentStarted(newStatus === 'running');
                setTournamentSettings(prev => ({
                    ...prev,
                    status: newStatus
                }));
            } catch (err) {
                console.error('Error fetching tournament status:', err);
            }
        };

        checkTournamentStatus();
        const interval = setInterval(checkTournamentStatus, 5000);
        return () => clearInterval(interval);
    }, [tournamentSettings.status]);

    useEffect(() => {
        if (activeTab === 'schedule') {
            fetchMatches();
            fetchTournamentSettings();
        }
    }, [activeTab, tournamentSettings.status]);

    const showNotification = (message) => {
        setNotification(message);
        setTimeout(() => {
            setNotification(null);
        }, 3000);
    };

    const handleReserve = async (pairId) => {
        try {
            const currentUserId = userId || testUserId;
            if (!currentUserId) {
                showNotification('Error ID');
                return;
            }

            if (tournamentStarted) {
                showNotification('Reservation unavailable');
                return;
            }

            const response = await axios.post(`${API_URL}/reserve`, {
                pairId,
                userId: currentUserId
            });

            if (response.data.success) {
                setPairs(prevPairs => prevPairs.map(p => 
                    p._id === pairId 
                        ? { 
                            ...p, 
                            userIds: [...(p.userIds || []), currentUserId],
                            teamCost: p.teamCost + 100
                        } 
                        : p
                ));
                setUserPair(response.data.pair);
                
                setFinance(response.data.finance);
            }
        } catch (err) {
            showNotification(err.response?.data?.error || 'Reservation error');
        }
    };

    useEffect(() => {
        const interval = setInterval(() => {
            fetchMatches();
            fetchLivePrices();
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const fetchLivePrices = async () => {
        try {
            const response = await axios.get(`${API_URL}/live-prices`);
            setLiveMatchData(response.data);
        } catch (err) {
            console.error('Error fetching live prices:', err);
        }
    };

    const fetchTournamentSettings = async () => {
        try {
            const response = await axios.get(`${API_URL}/tournament-settings`);
            if (response.data) {
                setTournamentSettings({
                    ...response.data,
                    startTime: new Date(response.data.startTime)
                });
                if (response.data.status === 'pending') {
                    fetchMatches();
                }
            }
        } catch (err) {
            console.error('Error fetching tournament settings:', err);
        }
    };

    useEffect(() => {
        if (tournamentSettings.status === 'pending') {
            fetchMatches();
        }
    }, [tournamentSettings.status]);

    const formatDateTime = (date) => {
        return new Date(date).toLocaleString('en-US', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const calculateMatchSchedule = () => {
        if (!tournamentSettings.startTime || !matches.length) {
            console.log('No start time or matches');
            return [];
        }
        
        const hasActiveOrPendingMatches = matches.some(match => match.status === 'active' || match.status === 'pending');
        
        if (!hasActiveOrPendingMatches && tournamentSettings.status === 'completed') {
            console.log('Tournament completed, waiting for new tournament draw');
            return [];
        }
        
        const matchDuration = tournamentSettings.matchDuration;
        const breakDuration = tournamentSettings.breakDuration;
        const startTime = new Date(tournamentSettings.startTime);

        const matchesByRound = matches.reduce((acc, match) => {
            if (!acc[match.round]) {
                acc[match.round] = [];
            }
            acc[match.round].push(match);
            return acc;
        }, {});

        let currentStartTime = startTime;
        const scheduledMatches = [];

        Object.keys(matchesByRound).sort((a, b) => Number(a) - Number(b)).forEach(round => {
            const roundMatches = matchesByRound[round];
            
            if (round === '1') {
                roundMatches.forEach((match, index) => {
                    const matchStartTime = new Date(startTime.getTime() + 
                        index * (matchDuration + breakDuration) * 1000);
                    const matchEndTime = new Date(matchStartTime.getTime() + matchDuration * 1000);
                    
                    scheduledMatches.push({
                        ...match,
                        scheduledStart: matchStartTime,
                        scheduledEnd: matchEndTime
                    });
                });
            } else {
                const previousRound = String(Number(round) - 1);
                const previousRoundMatches = matchesByRound[previousRound] || [];
                const lastCompletedMatch = previousRoundMatches
                    .filter(m => m.status === 'completed')
                    .sort((a, b) => new Date(b.endTime) - new Date(a.endTime))[0];

                if (lastCompletedMatch?.endTime) {
                    currentStartTime = new Date(lastCompletedMatch.endTime);
                    currentStartTime.setSeconds(currentStartTime.getSeconds() + breakDuration + 30);
                }

                roundMatches.forEach((match, index) => {
                    const matchStartTime = new Date(currentStartTime.getTime() + 
                        index * (matchDuration + breakDuration) * 1000);
                    const matchEndTime = new Date(matchStartTime.getTime() + matchDuration * 1000);
                    
                    scheduledMatches.push({
                        ...match,
                        scheduledStart: matchStartTime,
                        scheduledEnd: matchEndTime
                    });
                });
            }
        });

        return scheduledMatches;
    };

    const getTeamLogo = (symbol) => {
        if (!symbol) return null;
        
        const coin = symbol.replace('USDT', '').toLowerCase();
        
        const logoMap = {
            'btc': require('../logo/btc.png'),
            'eth': require('../logo/eth.png'),
            'bnb': require('../logo/bnb.png'),
            'sol': require('../logo/sol.png'),
            'xrp': require('../logo/xrp.png'),
            'dot': require('../logo/dot.png'),
            'ada': require('../logo/ada.png'),
            'ton': require('../logo/ton.png'),
            'doge': require('../logo/doge.png'),
            'atom': require('../logo/atom.png'),
            'shib': require('../logo/shib.png'),
            'near': require('../logo/near.png'),
            'pol': require('../logo/pol.png'),
            'avax': require('../logo/avax.png'),
            'fil': require('../logo/fil.png'),
            'apt': require('../logo/apt.png'),
            '1inch': require('../logo/1inch.png'),
            'arb': require('../logo/arb.png'),
            'cake': require('../logo/cake.png'),
            'crv': require('../logo/crv.png'),
            'dai': require('../logo/dai.png'),
            'icp': require('../logo/icp.png'),
            'inj': require('../logo/inj.png'),
            'jup': require('../logo/jup.png'),
            'kas': require('../logo/kas.png'),
            'ksm': require('../logo/ksm.png'),
            'ltc': require('../logo/ltc.png'),
            'mnt': require('../logo/mnt.png'),
            'op': require('../logo/op.png'),
            'strk': require('../logo/strk.png'),
            'trx': require('../logo/trx.png'),
            'uni': require('../logo/uni.png')
        };
        
        return logoMap[coin] || null;
    };

    const formatTeamName = (symbol) => {
        return symbol ? symbol.replace('USDT', '') : '';
    };

    const fetchFinance = async () => {
        const currentUserId = userId || testUserId;
        if (!currentUserId) return;

        try {
            const response = await axios.get(`${API_URL}/finance/${currentUserId}`);
            console.log('Financial data received:', response.data);
            setFinance(response.data);
        } catch (err) {
            console.error('Error fetching financial information:', err);
        }
    };

    const handleGenerateRefCode = async () => {
        const currentUserId = userId || testUserId;
        if (!currentUserId) return;
        
        try {
            const response = await axios.post(`${API_URL}/generate-ref-code`, {
                userId: currentUserId
            });

            const refCode = response.data.refCode;
            const refLink = `${process.env.REACT_APP_BOT_URL || 'YOUR_TELEGRAM_BOT_URL'}?start=${refCode}`;
            
            setRefLink(refLink);
            setShowRefModal(true);
        } catch (error) {
            showNotification('Generation error');
        }
    };

    useEffect(() => {
        const updateData = async () => {
            const currentUserId = userId || testUserId;
            if (currentUserId) {
                try {
                    const pairsResponse = await axios.get(`${API_URL}/pairs`);
                    setPairs(pairsResponse.data);

                    const userPairResponse = await axios.get(`${API_URL}/user-pair/${currentUserId}`);
                    setUserPair(userPairResponse.data);

                    const financeResponse = await axios.get(`${API_URL}/finance/${currentUserId}`);
                    setFinance(financeResponse.data);
                } catch (error) {
                    console.error('Error updating data:', error);
                }
            }
        };

        const interval = setInterval(updateData, 5000);

        return () => clearInterval(interval);
    }, [userId, testUserId]);

    useEffect(() => {
        const activeMatch = matches.find(match => match.status === 'active');
        if (activeMatch) {
            const startTime = new Date(activeMatch.startTime).getTime();
            const duration = tournamentSettings.matchDuration * 1000;
            
            const updateProgress = () => {
                const now = Date.now();
                const elapsed = now - startTime;
                const progress = Math.min((elapsed / duration) * 100, 100);
                setMatchProgress(progress);
            };

            updateProgress();
            const interval = setInterval(updateProgress, 1000);
            return () => clearInterval(interval);
        }
    }, [matches, tournamentSettings.matchDuration]);

    const fetchUserWallet = async () => {
        const currentUserId = userId || testUserId;
        if (!currentUserId) return;

        try {
            const response = await axios.get(`${API_URL}/user-wallet/${currentUserId}`);
            if (response.data?.wallet) {
                setUserWallet(response.data.wallet);
            }
        } catch (error) {
            console.error('Error fetching user wallet:', error);
        }
    };

    const handleLinkWallet = async () => {
        const currentUserId = userId || testUserId;
        if (!currentUserId || !walletAddress) return;

        try {
            const response = await axios.post(`${API_URL}/link-wallet`, {
                userId: currentUserId,
                walletAddress: walletAddress
            });

            if (response.data.success) {
                setUserWallet(walletAddress);
                setWalletAddress('');
                showNotification('Wallet Registered!');
            }
        } catch (error) {
            showNotification(error.response?.data?.message || 'Registration error');
        }
    };

    useEffect(() => {
        if (userId || testUserId) {
            fetchUserWallet();
        }
    }, [userId, testUserId]);

    const formatWalletAddress = (address) => {
        if (!address) return '';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const handleCopyAddress = () => {
        navigator.clipboard.writeText(GAME_WALLET);
        showNotification('Done!');
    };


    const fetchPrizeFund = async () => {
        try {
            const response = await axios.get(`${API_URL}/admin/prize-fund`);
            setPrizeFund(response.data.prizeFund);
        } catch (error) {
            console.error('Error fetching prize fund:', error);
        }
    };


    useEffect(() => {
        fetchPrizeFund();
        

        const prizeFundInterval = setInterval(fetchPrizeFund, 10000);


        return () => clearInterval(prizeFundInterval);
    }, []);

    const shortenReferralLink = (link) => {
        if (!link) return '';
        return link;
    };

    const shortenTransactionHash = (hash) => {
        if (!hash) return '';
        return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
    };

    const handleCopyRefLink = () => {
        navigator.clipboard.writeText(refLink);
        showNotification('Done!');
    };

    const getRoundName = (roundName) => {
        switch (roundName) {
            case 'sixteenth':
                return 'Round of 16';
            case 'eighth':
                return 'Round of 8';
            case 'quarter':
                return 'Quarter final';
            case 'semi':
                return 'Semi final';
            case 'final':
                return 'Final';
            default:
                return roundName;
        }
    };

    const handleTonConnect = async () => {
        if (wallet) {
            await tonConnectUI.disconnect();
            showNotification('TON wallet disconnected');
        } else {
            setIsConnecting(true);
            try {
                await tonConnectUI.openModal();
                showNotification('TON wallet connection dialog opened');
            } catch (error) {
                console.error('Error connecting TON wallet:', error);
                showNotification('Wallet connection error');
            } finally {
                setIsConnecting(false);
            }
        }
    };

    const handleTonDeposit = async () => {
        if (!wallet) {
            showNotification('Please connect TON wallet first');
            return;
        }

        try {
            const transaction = {
                validUntil: Date.now() + 5 * 60 * 1000,
                messages: [
                    {
                        address: GAME_WALLET,
                        amount: '100000000',
                        payload: btoa(JSON.stringify({
                            action: 'deposit',
                            userId: userId || testUserId,
                            amount: '0.1'
                        }))
                    }
                ]
            };

            const result = await tonConnectUI.sendTransaction(transaction);
            
            if (result) {
                showNotification('Deposit transaction sent');
                setTimeout(() => {
                    fetchFinance();
                }, 3000);
            }
        } catch (error) {
            console.error('Deposit error:', error);
            showNotification('Deposit error');
        }
    };

    const handleTonWithdraw = async () => {
        if (!wallet) {
            showNotification('Please connect TON wallet first');
            return;
        }

        if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
            showNotification('Enter correct amount for withdrawal');
            return;
        }

        try {
            const tonAmount = convertToTon(withdrawAmount);
            
            const response = await axios.post(`${API_URL}/withdraw`, {
                userId: userId || testUserId,
                amount: withdrawAmount,
                tonAddress: wallet.account.address,
                tonAmount: tonAmount
            });

            if (response.data.success) {
                showNotification('Withdrawal request processed');
                setWithdrawAmount('');
                setShowWithdrawModal(false);
                fetchFinance();
            }
        } catch (error) {
            console.error('Withdrawal error:', error);
            showNotification('Withdrawal error');
        }
    };

    return (
        <div className="user-panel">
            {notification && (
                <div className="notification-message">
                    {notification}
                </div>
            )}
            {/* Navigation tabs */}
            <div className="navigation-tabs">
                <button 
                    className={`tab-button ${activeTab === 'teams' ? 'active' : ''}`}
                    onClick={() => setActiveTab('teams')}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="9" cy="7" r="4" strokeWidth="1.5"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                </button>

                <button 
                    className={`tab-button ${activeTab === 'schedule' ? 'active' : ''}`}
                    onClick={() => setActiveTab('schedule')}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="1.5"/>
                        <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                </button>

                <button 
                    className={`tab-button ${activeTab === 'live' ? 'active' : ''}`}
                    onClick={() => setActiveTab('live')}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" 
                            d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"/>
                    </svg>
                </button>

                <button 
                    className={`tab-button ${activeTab === 'finance' ? 'active' : ''}`}
                    onClick={() => setActiveTab('finance')}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" 
                            d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"/>
                    </svg>
                </button>
            </div>

            {/* Tab content */}
            {activeTab === 'teams' && (
                <div className="pairs-section">
                    <div className="section-glow"></div>
                        <h2 className="section-title">Teams</h2>

                        {/* User team display */}
                        {userPair && (
                            <div className="user-team-display">
                                <h3>Your team:</h3>
                                <div className="team-logo">
                                    <img src={getTeamLogo(userPair.symbol)} alt={userPair.symbol} />
                                </div>
                                <div className="user-team-name">
                                    {formatTeamName(userPair.symbol)}
                                </div>
                            </div>
                        )}

                    <div className="pairs-grid">
                        {pairs.map(pair => (
                            <div key={pair._id} className={`pair-item ${!pair.isAvailable ? 'reserved' : ''}`}>
                                <div className="pair-content">
                                    <div className="team-logo">
                                        <img 
                                            src={getTeamLogo(pair.symbol)} 
                                            alt={formatTeamName(pair.symbol)}
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.style.display = 'none';
                                            }}
                                        />
                                    </div>
                                    <h3 className="team-name">{formatTeamName(pair.symbol)}</h3>
                                    <button
                                        onClick={() => handleReserve(pair._id)}
                                        disabled={
                                                pair.userIds?.includes(userId || testUserId) ||
                                            tournamentStarted
                                        }
                                            className={pair.userIds?.includes(userId || testUserId) ? 'reserved' : ''}
                                    >
                                            {pair.userIds?.includes(userId || testUserId) ? 'Your team' : 
                                         tournamentStarted ? 'Tournament started' :
                                             `Reserve for ${pair.teamCost} AGTI`}
                                    </button>
                                        <div className="team-members">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                                <circle cx="9" cy="7" r="4"/>
                                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                            </svg>
                                            <span className="members-count">{pair.userIds?.length || 0}</span>
                                        </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'schedule' && (
                <div className="schedule-section">
                    <div className="section-glow"></div>
                    <h2 className="section-title">Match Schedule</h2>
                    <div className="tournament-details">
                        <p>Match duration: {tournamentSettings.matchDuration} seconds</p>
                        <p>Break between matches: {tournamentSettings.breakDuration} seconds</p>
                    </div>
                    
                    {/* Check if there are active or pending matches */}
                    {matches.some(match => match.status === 'active' || match.status === 'pending') || tournamentSettings.status !== 'completed' ? (
                        <div className="schedule-list">
                            {calculateMatchSchedule().map((match, index) => (
                                <div key={match._id} className="schedule-item">
                                    <div className="schedule-round">
                                        {getRoundName(match.roundName)}
                                    </div>
                                    <div className="schedule-teams">
                                        {formatTeamName(match.pair1?.symbol)} vs {formatTeamName(match.pair2?.symbol)}
                                    </div>
                                    <div className="schedule-time">
                                        <div className="time-start">
                                            Start: {formatDateTime(match.scheduledStart)}
                                        </div>
                                        <div className="time-end">
                                            End: {formatDateTime(match.scheduledEnd)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="waiting-message">
                            <p>Tournament completed.</p>
                            {tournamentSettings.startTime && (
                                <p>Next tournament: {formatDateTime(new Date(tournamentSettings.startTime))}</p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'live' && (
                <div className="live-section">
                    <div className="section-glow"></div>
                        <h2 className="section-title"></h2>

                        {/* Show last active or completed match */}
                        {matches.filter(match => match.status === 'active' || match.status === 'completed')
                            .slice(-1)
                            .map(match => (
                                <div 
                                    key={`live-${match._id}`} 
                                    className="live-now-section"
                                    data-status={match.status}
                                >
                                    <h3 className="live-now-title">
                                        {match.status === 'active' ? 'LIVE NOW' : 'LAST MATCH'}
                                    </h3>
                                    <div className="live-match-container">
                                        <div className="round-name">
                                            {getRoundName(match.roundName)}
                                            {match.status === 'active' && (
                                                <div className="match-progress">
                                                    <div className="progress-ring">
                                                        <svg width="40" height="40" viewBox="0 0 40 40">
                                                            <circle
                                                                className="progress-ring-circle-bg"
                                                                cx="20"
                                                                cy="20"
                                                                r="15.9155"
                                                                strokeWidth="4"
                                                            />
                                                            <circle
                                                                className="progress-ring-circle"
                                                                cx="20"
                                                                cy="20"
                                                                r="15.9155"
                                                                strokeWidth="4"
                                                                style={{
                                                                    strokeDasharray: `${2 * Math.PI * 15.9155}`,
                                                                    strokeDashoffset: `${2 * Math.PI * 15.9155 * (1 - matchProgress / 100)}`
                                                                }}
                                                            />
                                                        </svg>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="live-teams">
                                            <div className="live-team">
                                                <img src={getTeamLogo(match.pair1.symbol)} alt={match.pair1.symbol} />
                                                <span>{formatTeamName(match.pair1.symbol)}</span>
                                            </div>
                                            <div className="live-score">
                                                {match.status === 'active' ? (
                                                    <>
                                                        <div className="score-number">
                                                            {liveMatchData[match._id]?.pair1?.change >= 0 ? '' : '-'}
                                                            {Math.abs(Math.round((liveMatchData[match._id]?.pair1?.change || 0) * 100))}
                                                        </div>
                                                        <div className="vs">VS</div>
                                                        <div className="score-number">
                                                            {liveMatchData[match._id]?.pair2?.change >= 0 ? '' : '-'}
                                                            {Math.abs(Math.round((liveMatchData[match._id]?.pair2?.change || 0) * 100))}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="score-number">
                                                            {match.pair1Price?.change >= 0 ? '' : '-'}
                                                            {Math.abs(Math.round((match.pair1Price?.change || 0) * 100))}
                                                        </div>
                                                        <div className="vs">:</div>
                                                        <div className="score-number">
                                                            {match.pair2Price?.change >= 0 ? '' : '-'}
                                                            {Math.abs(Math.round((match.pair2Price?.change || 0) * 100))}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            <div className="live-team">
                                                <img src={getTeamLogo(match.pair2.symbol)} alt={match.pair2.symbol} />
                                                <span>{formatTeamName(match.pair2.symbol)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                        {/* Prize fund section */}
                        <div className="prize-fund-section">
                            <h2 className="prize-fund-title">Tournament Prize Fund</h2>
                            <div className="prize-fund-amount">
                                {prizeFund} <span className="prize-fund-currency">AGTI</span>
                            </div>
                        </div>
                        
                        {/* Info section with buttons */}
                        <div className="info-section">
                            <div className="sponsor-image">
                                <img src={process.env.PUBLIC_URL + '/sevlushfoods.png'} alt="Sevlush Foods" />
                            </div>
                            <div className="info-buttons">
                                <a 
                                    href={process.env.REACT_APP_CHAT_URL || "YOUR_CHAT_URL"} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="info-button"
                                >
                                    Chat
                                </a>
                                <a 
                                    href={process.env.REACT_APP_GROUP_URL || "YOUR_GROUP_URL"} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="info-button"
                                >
                                    Group
                                </a>
                            </div>
                        </div>

                        {/* Match grid code */}
                    <div className="matches-grid">
                        {matches.map(match => (
                            <div key={match._id} className="match-item">
                                <div className="match-header">
                                    <span className="round-name">
                                        {getRoundName(match.roundName)}
                                    </span>
                                    <span className={`match-status ${match.status}`}>
                                        {match.status}
                                    </span>
                                </div>
                                <div className="teams-container">
                                    <div className={`team ${userPair?._id === match.pair1._id ? 'user-team' : ''}`}>
                                        <div className="team-logo">
                                            <img src={getTeamLogo(match.pair1.symbol)} alt={match.pair1.symbol} />
                                        </div>
                                        <div className="team-info">
                                            <span className="team-name">{formatTeamName(match.pair1.symbol)}</span>
                                            {match.status === 'active' && liveMatchData[match._id]?.pair1 && (
                                                <div className="price-info">
                                                    <div className={`score-change ${liveMatchData[match._id]?.pair1?.change >= 0 ? 'positive' : 'negative'}`}>
                                                        {liveMatchData[match._id]?.pair1?.change >= 0 ? '' : '-'}
                                                        {Math.abs(Math.round((liveMatchData[match._id]?.pair1?.change || 0) * 100))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="vs-container">
                                        <div className="vs">VS</div>
                                        {match.status === 'active' && (
                                            <div className="live-indicator">LIVE</div>
                                        )}
                                    </div>
                                    <div className={`team ${userPair?._id === match.pair2._id ? 'user-team' : ''}`}>
                                        <div className="team-logo">
                                            <img src={getTeamLogo(match.pair2.symbol)} alt={match.pair2.symbol} />
                                        </div>
                                        <div className="team-info">
                                            <span className="team-name">{formatTeamName(match.pair2.symbol)}</span>
                                            {match.status === 'active' && liveMatchData[match._id]?.pair2 && (
                                                <div className="price-info">
                                                    <div className={`score-change ${liveMatchData[match._id]?.pair2?.change >= 0 ? 'positive' : 'negative'}`}>
                                                        {liveMatchData[match._id]?.pair2?.change >= 0 ? '' : '-'}
                                                        {Math.abs(Math.round((liveMatchData[match._id]?.pair2?.change || 0) * 100))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {match.status === 'completed' && (
                                    <div className="match-result">
                                        <div className="winner-announcement">
                                            {formatTeamName(
                                                match.winner && match.winner._id === match.pair1._id 
                                                    ? match.pair1.symbol 
                                                    : match.pair2.symbol
                                                )} - Win!
                                        </div>
                                        <div className="final-score">
                                                <div className={`final-score-number ${match.pair1Price?.change >= 0 ? 'positive' : 'negative'}`}>
                                                    {match.pair1Price?.change >= 0 ? '' : '-'}
                                                    {Math.abs(Math.round((match.pair1Price?.change || 0) * 100))}
                                            </div>
                                            <div className="vs">:</div>
                                                <div className={`final-score-number ${match.pair2Price?.change >= 0 ? 'positive' : 'negative'}`}>
                                                    {match.pair2Price?.change >= 0 ? '' : '-'}
                                                    {Math.abs(Math.round((match.pair2Price?.change || 0) * 100))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'finance' && (
                <div className="finance-section">
                    <div className="section-glow"></div>
                    <h2 className="section-title">Finance</h2>
                    
                    <div className="balance-section">
                        <div className="balance-header">
                            <span className="balance-label">Balance:</span>
                            <div className="wallet-info">
                                {wallet ? (
                                    <div className="ton-wallet-info">
                                        <span className="wallet-address">
                                            {formatTonAddress(wallet.account.address)}
                                        </span>
                                        <span className="wallet-type">TON</span>
                                    </div>
                                ) : (
                                    <button 
                                        className="link-wallet-btn"
                                        onClick={handleTonConnect}
                                        disabled={isConnecting}
                                    >
                                        {isConnecting ? 'Connecting...' : 'Connect TON'}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="balance-amount">
                            {parseFloat(finance.balance).toFixed(1)} AGTI
                        </div>
                        <div className="knl-balance">
                            {finance.knlBalance !== undefined ? parseFloat(finance.knlBalance).toFixed(1) : '0'} KNL
                        </div>
                        {wallet && (
                            <div className="ton-balance">
                                {tonBalance.toFixed(4)} TON
                            </div>
                        )}
                    </div>

                    <div className="finance-buttons">
                        <button 
                            className={`finance-button ${!wallet ? 'disabled' : ''}`}
                            onClick={handleTonDeposit}
                            disabled={!wallet}
                        >
                            <span className="button-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path d="M12 20V4m0 16l-6-6m6 6l6-6" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                            </span>
                            <span className="button-text">Deposit</span>
                        </button>

                        <button 
                            className={`finance-button ${!wallet ? 'disabled' : ''}`}
                            onClick={() => setShowWithdrawModal(true)}
                            disabled={!wallet}
                        >
                            <span className="button-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path d="M12 4v16m0-16L6 10m6-6l6 6" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                            </span>
                            <span className="button-text">Withdraw</span>
                        </button>

                        <button 
                            className="finance-button"
                            onClick={() => setShowRefModal(true)}
                        >
                            <span className="button-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <rect x="3" y="6" width="18" height="15" rx="2" strokeWidth="2"/>
                                    <path d="M3 10h18M12 6V3m0 0l-3 3m3-3l3 3" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                            </span>
                            <span className="button-text">Referral</span>
                        </button>
                    </div>

                    {/* Deposit modal now uses TON Connect */}
                    {showDepositModal && (
                        <div className="modal-overlay" onClick={() => setShowDepositModal(false)}>
                            <div className="modal-content" onClick={e => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3>Deposit via TON</h3>
                                    <button 
                                        className="modal-close"
                                        onClick={() => setShowDepositModal(false)}
                                    >
                                        ✕
                                    </button>
                                </div>
                                <div className="modal-body">
                                    <div className="ton-deposit-info">
                                        {wallet ? (
                                            <div>
                                                <p>Your TON wallet is connected:</p>
                                                <div className="connected-wallet">
                                                    {formatTonAddress(wallet.account.address)}
                                                </div>
                                                <button 
                                                    className="ton-deposit-button"
                                                    onClick={() => {
                                                        handleTonDeposit();
                                                        setShowDepositModal(false);
                                                    }}
                                                >
                                                    Deposit 0.1 TON
                                                </button>
                                            </div>
                                        ) : (
                                            <div>
                                                <p>Connect TON wallet to deposit</p>
                                                <button 
                                                    className="connect-ton-button"
                                                    onClick={handleTonConnect}
                                                >
                                                    Connect TON
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Withdrawal modal */}
                    {showWithdrawModal && (
                        <div className="modal-overlay" onClick={() => setShowWithdrawModal(false)}>
                            <div className="modal-content" onClick={e => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3>Withdraw Funds</h3>
                                    <button 
                                        className="modal-close"
                                        onClick={() => setShowWithdrawModal(false)}
                                    >
                                        ✕
                                    </button>
                                </div>
                                <div className="modal-body">
                                    <div className="withdraw-form">
                                        <input
                                            type="number"
                                            placeholder="Enter AGTI amount"
                                            value={withdrawAmount}
                                            onChange={(e) => setWithdrawAmount(e.target.value)}
                                            className="withdraw-input"
                                        />
                                        <button
                                            className="withdraw-button"
                                            onClick={handleTonWithdraw}
                                            disabled={!withdrawAmount || withdrawAmount <= 0}
                                        >
                                            Withdraw via TON
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Referral code modal */}
                    {showRefModal && (
                        <div className="modal-overlay" onClick={() => setShowRefModal(false)}>
                            <div className="modal-content" onClick={e => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3>Referral Code</h3>
                                    <button 
                                        className="modal-close"
                                        onClick={() => setShowRefModal(false)}
                                    >
                                        ✕
                                    </button>
                                </div>
                                <div className="modal-body">
                                    <div className="ref-code-content">
                                        {refLink ? (
                                            <div className="ref-link-display">
                                                <p>Your referral link:</p>
                                                <div className="ref-link">
                                                    {shortenReferralLink(refLink)}
                                                    <button 
                                                        className="copy-button"
                                                        onClick={handleCopyRefLink}
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button 
                                                className="generate-ref-code"
                                                onClick={handleGenerateRefCode}
                                            >
                                                Generate referral code
                                                <span>➔</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {isLoading && (
                        <div className="loading-container">
                            <div className="progress-bar">
                                <div 
                                    className="progress-fill"
                                    style={{ width: `${loadingProgress}%` }}
                                ></div>
                            </div>
                            <div className="loading-message">{loadingMessage}</div>
                        </div>
                    )}
                    
                    <div className="transactions-section">
                        <button 
                            className="toggle-transactions"
                            onClick={() => setShowTransactions(!showTransactions)}
                        >
                            Transactions History
                            <span className={`arrow ${showTransactions ? 'up' : 'down'}`}>
                                ▼
                            </span>
                        </button>
                        
                        {showTransactions && (
                            <div className="transactions-list">
                                {[...finance.transactions]
                                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                                    .map((transaction, index) => (
                                    <div key={index} className="transaction-item">
                                        <div className="transaction-date">{transaction.date}</div>
                                        <div className="transaction-description">
                                            {transaction.type === 'deposit' && transaction.hash ? (
                                                `Deposit AGTI (TX: ${shortenTransactionHash(transaction.hash)})`
                                            ) : transaction.description}
                                        </div>
                                        <div className={`transaction-amount ${transaction.amount >= 0 ? 'positive' : 'negative'}`}>
                                            {transaction.amount >= 0 ? '+' : ''}{transaction.amount} 
                                            {transaction.description && transaction.description.includes('KNL') ? 'KNL' : 'AGTI'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Wallet linking modal replaced with TON Connect */}
        </div>
    );
}

export default UserPanel; 
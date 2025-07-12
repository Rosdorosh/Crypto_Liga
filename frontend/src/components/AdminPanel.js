import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AdminPanel.css';
import { ADMIN_API_URL } from '../config';

function AdminPanel() {
    const [pairs, setPairs] = useState([]);
    const [newPair, setNewPair] = useState('');
    const [error, setError] = useState('');
    const [tournamentSettings, setTournamentSettings] = useState({
        startTime: '',
        matchDuration: 300,
        breakDuration: 60,
        autoMode: false,
        autoInterval: 50
    });
    const [matches, setMatches] = useState([]);
    const [tournamentStatus, setTournamentStatus] = useState('pending');
    const [countdown, setCountdown] = useState(null);
    const [matchTimers, setMatchTimers] = useState({});
    const [liveMatchData, setLiveMatchData] = useState({});
    const [currentTournamentTimers, setCurrentTournamentTimers] = useState([]);
    const [settingsSaved, setSettingsSaved] = useState(false);
    const [notification, setNotification] = useState(null);
    const [adminBalance, setAdminBalance] = useState(null);
    const [showAdminBalance, setShowAdminBalance] = useState(false);

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [adminToken, setAdminToken] = useState('');
    const [loginError, setLoginError] = useState('');

    useEffect(() => {
        const savedToken = localStorage.getItem('adminToken');
        if (savedToken) {
            setAdminToken(savedToken);
            setIsAuthenticated(true);
            axios.defaults.headers.common['admin-token'] = savedToken;
        }
    }, []);

    const handleLogin = (e) => {
        e.preventDefault();
        
        if (!adminToken.trim()) {
            setLoginError('Please enter admin token');
            return;
        }
        
        localStorage.setItem('adminToken', adminToken);
        axios.defaults.headers.common['admin-token'] = adminToken;
        setIsAuthenticated(true);
        setLoginError('');
        
        fetchPairs();
        fetchTournamentSettings();
        fetchMatches();
    };
    
    const handleLogout = () => {
        localStorage.removeItem('adminToken');
        delete axios.defaults.headers.common['admin-token'];
        setIsAuthenticated(false);
        setAdminToken('');
    };

    useEffect(() => {
        if (isAuthenticated) {
            fetchPairs();
            fetchTournamentSettings();
            fetchMatches();
        }

        return () => {
            if (window.countdownTimer) {
                clearInterval(window.countdownTimer);
            }
            Object.values(matchTimers).forEach(timer => {
                if (timer.interval) {
                    clearInterval(timer.interval);
                }
            });
        };
    }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchPairs = async () => {
        try {
            const response = await axios.get(`${ADMIN_API_URL}/pairs`);
            setPairs(response.data);
        } catch (err) {
            if (err.response && err.response.status === 401) {
                handleLogout();
                setError('Invalid admin token');
            } else {
                setError('Error loading pairs');
            }
        }
    };

    const fetchTournamentSettings = async () => {
        try {
            const response = await axios.get(`${ADMIN_API_URL}/tournament-settings`);
            if (response.data) {
                const startTimeDate = new Date(response.data.startTime);
                const localStartTime = new Date(startTimeDate.getTime() - startTimeDate.getTimezoneOffset() * 60000);
                
                setTournamentSettings({
                    ...response.data,
                    startTime: localStartTime.toISOString().slice(0, 16),
                    autoMode: response.data.autoMode || false,
                    autoInterval: response.data.autoInterval || 50
                });
            }
        } catch (err) {
            setError('Error loading tournament settings');
        }
    };

    const fetchMatches = async () => {
        try {
            const response = await axios.get(`${ADMIN_API_URL}/matches`);
            setMatches(response.data);
        } catch (err) {
            setError('Error loading matches');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const formattedPair = newPair.replace('/', '').toUpperCase();
            const response = await axios.post(`${ADMIN_API_URL}/pairs`, {
                symbol: formattedPair
            });
            setPairs([...pairs, response.data]);
            setNewPair('');
            setError('');
        } catch (err) {
            setError(err.response?.data?.error || 'Error adding pair');
        }
    };

    const handleDelete = async (id) => {
        try {
            await axios.delete(`${ADMIN_API_URL}/pairs/${id}`);
            setPairs(pairs.filter(pair => pair._id !== id));
        } catch (err) {
            setError('Error deleting pair');
        }
    };

    const handleDraw = async () => {
        try {
            if (pairs.length < 32) {
                setError('Minimum 32 trading pairs required for draw');
                return;
            }
            const response = await axios.post(`${ADMIN_API_URL}/draw`);
            console.log('Draw completed:', response.data);
            fetchMatches();
            setError('');
        } catch (err) {
            setError(err.response?.data?.error || 'Draw error');
        }
    };

    const handleSettingsSave = async () => {
        try {
            const localStartTime = new Date(tournamentSettings.startTime);
            
            const response = await axios.post(`${ADMIN_API_URL}/tournament-settings`, {
                startTime: localStartTime.toISOString(),
                matchDuration: tournamentSettings.matchDuration,
                breakDuration: tournamentSettings.breakDuration,
                autoMode: tournamentSettings.autoMode,
                autoInterval: tournamentSettings.autoInterval
            });
            
            setSettingsSaved(true);
            
            fetchMatches();
            fetchTournamentSettings();
            
            setError('');
        } catch (err) {
            setError(err.response?.data?.error || 'Error saving settings');
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleCompleteMatch = async (matchId) => {
        try {
            const match = matches.find(m => m._id === matchId);
            if (!match || match.status === 'completed') return;

            const response = await axios.post(`${ADMIN_API_URL}/matches/${matchId}/complete`);
            if (response.data.match) {
                setMatches(prevMatches =>
                    prevMatches.map(m => {
                        if (m._id === matchId) {
                            return {
                                ...m,
                                status: 'completed',
                                winner: response.data.match.winner,
                                pair1Price: response.data.match.pair1Price,
                                pair2Price: response.data.match.pair2Price,
                                endTime: response.data.match.endTime
                            };
                        }
                        return m;
                    })
                );
            }
        } catch (err) {
            if (err.response?.status === 400) {
                fetchMatches();
            } else {
                console.error('Error completing match:', err);
                setError('Error completing match');
            }
        }
    };

    const clearAllTimers = () => {
        currentTournamentTimers.forEach(timer => clearTimeout(timer));
        setCurrentTournamentTimers([]);
        
        Object.values(matchTimers).forEach(timer => {
            if (timer.interval) {
                clearInterval(timer.interval);
            }
        });
        setMatchTimers({});
        
        if (window.countdownTimer) {
            clearInterval(window.countdownTimer);
        }
    };

    const handleTournamentStart = async () => {
        try {
            clearAllTimers();
            
            await axios.post(`${ADMIN_API_URL}/tournament/start`);
            setTournamentStatus('pending');
            startCountdown();

            const startTime = new Date(tournamentSettings.startTime).getTime();
            const now = new Date().getTime();
            const initialDelay = Math.max(0, startTime - now);

            const sortedMatches = [...matches].sort((a, b) => a.round - b.round);
            const newTimers = [];

            sortedMatches.forEach((match, index) => {
                const matchDelay = initialDelay + 
                    (tournamentSettings.matchDuration + tournamentSettings.breakDuration) * 1000 * index;

                if (index === 0) {
                    const timer = setTimeout(async () => {
                        try {
                            await axios.post(`${ADMIN_API_URL}/check-websocket`);
                            
                            await axios.post(`${ADMIN_API_URL}/matches/${match._id}/set-start-prices`);
                            
                            await axios.post(`${ADMIN_API_URL}/tournament/update-status`, { status: 'running' });
                            
                            const response = await axios.post(`${ADMIN_API_URL}/matches/${match._id}/start`);
                            if (response.data.match) {
                                setMatches(prevMatches => 
                                    prevMatches.map(m => {
                                        if (m._id === match._id) {
                                            return {
                                                ...m,
                                                status: 'active',
                                                startTime: new Date(startTime)
                                            };
                                        }
                                        return m;
                                    })
                                );
                                setTournamentStatus('running');
                            }
                        } catch (err) {
                            console.error('Error starting first match:', err);
                            setError('Error starting first match. Check connection');
                        }
                    }, initialDelay);
                    newTimers.push(timer);
                } else {
                    const priceTimer = setTimeout(async () => {
                        try {
                            await axios.post(`${ADMIN_API_URL}/matches/${match._id}/set-start-prices`);
                            const response = await axios.post(`${ADMIN_API_URL}/matches/${match._id}/start`);
                            if (response.data.match) {
                                setMatches(prevMatches =>
                                    prevMatches.map(m => {
                                        if (m._id === match._id) {
                                            return {
                                                ...m,
                                                status: 'active',
                                                startTime: new Date(Date.now())
                                            };
                                        }
                                        return m;
                                    })
                                );
                            }
                        } catch (err) {
                            console.error('Error starting match:', err);
                        }
                    }, matchDelay);
                    newTimers.push(priceTimer);
                }

                const matchTimer = setTimeout(() => {
                    handleCompleteMatch(match._id);
                }, matchDelay + tournamentSettings.matchDuration * 1000);
                newTimers.push(matchTimer);
            });

            setCurrentTournamentTimers(newTimers);
            showNotification('Tournament started');
        } catch (err) {
            setError('Error starting tournament');
        }
    };

    const handleTournamentStop = async () => {
        try {
            await axios.post(`${ADMIN_API_URL}/tournament/stop`);
            setTournamentStatus('pending');
            setCountdown(null);
            setSettingsSaved(false);
            
            clearAllTimers();
            
            await axios.post(`${ADMIN_API_URL}/reset-prices`);
            
            fetchMatches();
            showNotification('Tournament stopped');
        } catch (err) {
            setError('Error stopping tournament');
        }
    };

    const startCountdown = () => {
        if (window.countdownTimer) {
            clearInterval(window.countdownTimer);
        }

        const updateCountdown = () => {
            const startTime = new Date(tournamentSettings.startTime).getTime();
            const now = new Date().getTime();
            const distance = startTime - now;

            if (distance < 0) {
                clearInterval(window.countdownTimer);
                setCountdown('Tournament started');
                return;
            }

            const hours = Math.floor(distance / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            setCountdown(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        };

        updateCountdown();
        window.countdownTimer = setInterval(updateCountdown, 1000);

        return () => {
            if (window.countdownTimer) {
                clearInterval(window.countdownTimer);
            }
        };
    };

    useEffect(() => {
        Object.values(matchTimers).forEach(timer => {
            if (timer.interval) {
                clearInterval(timer.interval);
            }
        });

        const interval = setInterval(() => {
            matches.forEach(match => {
                if (match.status === 'active') {
                    const matchStartTime = new Date(match.startTime).getTime();
                    const currentTime = new Date().getTime();
                    const elapsedTime = Math.floor((currentTime - matchStartTime) / 1000);
                    const timeLeft = Math.max(0, tournamentSettings.matchDuration - elapsedTime);

                    if (timeLeft <= 0) {
                        handleCompleteMatch(match._id);
                    } else {
                        setMatchTimers(prev => ({
                            ...prev,
                            [match._id]: {
                                timeLeft,
                                type: 'active'
                            }
                        }));
                    }
                }
            });
        }, 1000);

        return () => {
            clearInterval(interval);
        };
    }, [matches, tournamentSettings.matchDuration]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchLivePrices = async () => {
        try {
            const response = await axios.get(`${ADMIN_API_URL}/live-prices`);
            setLiveMatchData(response.data);
        } catch (err) {
            console.error('Error getting current prices:', err);
        }
    };

    useEffect(() => {
        const hasActiveMatches = matches.some(match => match.status === 'active');
        if (hasActiveMatches) {
            const interval = setInterval(fetchLivePrices, 1000);
            return () => clearInterval(interval);
        }
    }, [matches]);

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
                    
                    scheduledMatches.push({
                        ...match,
                        scheduledStart: matchStartTime
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
                    currentStartTime.setSeconds(currentStartTime.getSeconds() + breakDuration);
                }

                roundMatches.forEach((match, index) => {
                    const matchStartTime = new Date(currentStartTime.getTime() + 
                        index * (matchDuration + breakDuration) * 1000);
                    
                    scheduledMatches.push({
                        ...match,
                        scheduledStart: matchStartTime
                    });
                });
            }
        });

        return scheduledMatches;
    };

    useEffect(() => {
        const checkNewMatches = setInterval(() => {
            const hasCompletedMatches = matches.some(match => match.status === 'completed');
            if (hasCompletedMatches) {
                fetchMatches();
            }
        }, 2000);

        return () => clearInterval(checkNewMatches);
    }, [matches]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        Object.values(matchTimers).forEach(timer => {
            if (timer.interval) {
                clearInterval(timer.interval);
            }
        });

        const interval = setInterval(() => {
            matches.forEach(match => {
                if (match.status === 'active') {
                    const matchStartTime = new Date(match.startTime).getTime();
                    const currentTime = new Date().getTime();
                    const elapsedTime = Math.floor((currentTime - matchStartTime) / 1000);
                    const timeLeft = Math.max(0, tournamentSettings.matchDuration - elapsedTime);

                    if (timeLeft <= 0) {
                        handleCompleteMatch(match._id);
                    } else {
                        setMatchTimers(prev => ({
                            ...prev,
                            [match._id]: {
                                timeLeft,
                                type: 'active'
                            }
                        }));
                    }
                }
            });
        }, 1000);

        return () => {
            clearInterval(interval);
        };
    }, [matches, tournamentSettings.matchDuration]); // eslint-disable-line react-hooks/exhaustive-deps

    const sortedMatches = [...matches].sort((a, b) => {
        if (a.round !== b.round) return a.round - b.round;
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;
        return 0;
    });

    const memoizedMatches = React.useMemo(() => sortedMatches, [sortedMatches]);

    const handleRestartWebSocket = async () => {
        try {
            await axios.post(`${ADMIN_API_URL}/restart-websocket`);
            setError('');
            console.log('WebSocket restarted');
        } catch (err) {
            setError('Error restarting WebSocket');
        }
    };

    const handleClearReservations = async () => {
        try {
            await axios.post(`${ADMIN_API_URL}/clear-reservations`);
            fetchPairs();
            setError('');
            console.log('All reservations cleared');
        } catch (err) {
            setError('Error clearing reservations');
        }
    };

    const showNotification = (message) => {
        setNotification(message);
        setTimeout(() => {
            setNotification(null);
        }, 3000);
    };

    const getRoundName = (roundName) => {
        switch (roundName) {
            case 'sixteenth':
                return 'Round of 16';
            case 'eighth':
                return 'Round of 8';
            case 'quarter':
                return 'Quarter Final';
            case 'semi':
                return 'Semi Final';
            case 'final':
                return 'Final';
            default:
                return roundName;
        }
    };

    const fetchAdminBalance = async () => {
        try {
            const response = await axios.get(`${ADMIN_API_URL}/admin-balance`);
            setAdminBalance(response.data);
            setShowAdminBalance(true);
        } catch (error) {
            console.error('Error getting admin balance:', error);
            showNotification('Error getting admin balance');
        }
    };

    const formatTransactionDate = (dateString) => {
        const date = new Date(dateString);
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    };

    if (!isAuthenticated) {
        return (
            <div className="admin-login-container">
                <div className="admin-login-form">
                    <h2>Admin Panel Login</h2>
                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label>Admin Token:</label>
                            <input
                                type="password"
                                value={adminToken}
                                onChange={(e) => setAdminToken(e.target.value)}
                                placeholder="Enter token"
                            />
                        </div>
                        {loginError && <div className="login-error">{loginError}</div>}
                        <button type="submit" className="login-button">Login</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-panel">
            <div className="admin-header">
                <h1>Admin Panel</h1>
                <button onClick={handleLogout} className="logout-button">Logout</button>
            </div>
            
            {notification && (
                <div className="notification-message">
                    {notification}
                </div>
            )}
            <h2>Trading Pairs Management</h2>
            
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={newPair}
                    onChange={(e) => setNewPair(e.target.value)}
                    placeholder="Enter pair (e.g.: BTC/USDT)"
                />
                <button type="submit">Add Pair</button>
            </form>

            <h3>Existing Pairs:</h3>
            <ul>
                {pairs.map(pair => (
                    <li key={pair._id}>
                        {pair.symbol}
                        <button onClick={() => handleDelete(pair._id)}>Delete</button>
                    </li>
                ))}
            </ul>

            <div className="tournament-controls">
                <button 
                    onClick={handleDraw}
                    disabled={pairs.length < 32 || tournamentStatus === 'running' || matches.length > 0}
                    style={{
                        opacity: (pairs.length < 32 || tournamentStatus === 'running' || matches.length > 0) ? 0.5 : 1,
                        cursor: (pairs.length < 32 || tournamentStatus === 'running' || matches.length > 0) ? 'not-allowed' : 'pointer'
                    }}
                >
                    Conduct Draw
                </button>
                
                <button
                    onClick={handleTournamentStart}
                    disabled={matches.length === 0 || tournamentStatus === 'running' || !settingsSaved}
                    style={{
                        opacity: (matches.length === 0 || tournamentStatus === 'running' || !settingsSaved) ? 0.5 : 1,
                        cursor: (matches.length === 0 || tournamentStatus === 'running' || !settingsSaved) ? 'not-allowed' : 'pointer'
                    }}
                >
                    Start Tournament
                </button>
                
                <button
                    onClick={handleTournamentStop}
                    disabled={matches.length === 0}
                    style={{
                        opacity: matches.length === 0 ? 0.5 : 1,
                        cursor: matches.length === 0 ? 'not-allowed' : 'pointer'
                    }}
                >
                    Stop Tournament
                </button>

                <button 
                    onClick={handleRestartWebSocket}
                    className="websocket-control"
                >
                    Restart WebSocket
                </button>

                <button 
                    onClick={handleClearReservations}
                    className="clear-reservations"
                    disabled={tournamentStatus === 'running'}
                >
                    Clear Reservations
                </button>

                <button 
                    onClick={fetchAdminBalance}
                    className="admin-balance-button"
                >
                    Admin Balance
                </button>

                {tournamentSettings.startTime && (
                    <div className="countdown">
                        Until tournament start: {countdown || 'Waiting for start'}
                    </div>
                )}
            </div>

            {showAdminBalance && adminBalance && (
                <div className="admin-balance-modal">
                    <div className="admin-balance-content">
                        <div className="admin-balance-header">
                            <h3>Administrator Balance</h3>
                            <button onClick={() => setShowAdminBalance(false)} className="close-button">×</button>
                        </div>
                        <div className="admin-balance-body">
                            <p className="admin-balance-amount">Current balance: <span>{adminBalance.balance} AGTI</span></p>
                            
                            <h4>Recent transactions:</h4>
                            {adminBalance.transactions.length > 0 ? (
                                <div className="admin-transactions">
                                    {adminBalance.transactions.map((tx, index) => (
                                        <div key={index} className="admin-transaction-item">
                                            <div className="transaction-details">
                                                <span className="transaction-type">{tx.type}</span>
                                                <span className="transaction-amount">{tx.amount > 0 ? `+${tx.amount}` : tx.amount} AGTI</span>
                                            </div>
                                            <div className="transaction-description">{tx.description}</div>
                                            <div className="transaction-date">
                                                {tx.timestamp ? formatTransactionDate(tx.timestamp) : 'Date not specified'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p>No transactions to display</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="tournament-settings">
                <h3>Tournament Settings</h3>
                <div>
                    <label>Tournament start time:</label>
                    <input
                        type="datetime-local"
                        value={tournamentSettings.startTime}
                        onChange={(e) => {
                            setSettingsSaved(false);
                            setTournamentSettings({
                                ...tournamentSettings,
                                startTime: e.target.value
                            });
                        }}
                        disabled={tournamentStatus === 'running'}
                    />
                </div>
                <div>
                    <label>Match duration (seconds):</label>
                    <input
                        type="number"
                        min="1"
                        value={tournamentSettings.matchDuration || ''}
                        onChange={(e) => {
                            setSettingsSaved(false);
                            setTournamentSettings({
                                ...tournamentSettings,
                                matchDuration: parseInt(e.target.value) || 0
                            });
                        }}
                        disabled={tournamentStatus === 'running'}
                    />
                </div>
                <div>
                    <label>Break between matches (seconds):</label>
                    <input
                        type="number"
                        value={tournamentSettings.breakDuration}
                        onChange={(e) => {
                            setSettingsSaved(false);
                            setTournamentSettings({
                                ...tournamentSettings,
                                breakDuration: parseInt(e.target.value)
                            });
                        }}
                        disabled={tournamentStatus === 'running'}
                    />
                </div>
                <div>
                    <label>Automatic tournament mode:</label>
                    <input
                        type="checkbox"
                        checked={tournamentSettings.autoMode}
                        onChange={(e) => {
                            setSettingsSaved(false);
                            setTournamentSettings({
                                ...tournamentSettings,
                                autoMode: e.target.checked
                            });
                        }}
                        disabled={tournamentStatus === 'running'}
                    />
                </div>
                <div>
                    <label>Interval between tournaments (minutes):</label>
                    <input
                        type="number"
                        min="1"
                        value={tournamentSettings.autoInterval || ''}
                        onChange={(e) => {
                            setSettingsSaved(false);
                            setTournamentSettings({
                                ...tournamentSettings,
                                autoInterval: parseInt(e.target.value) || 50
                            });
                        }}
                        disabled={tournamentStatus === 'running' || !tournamentSettings.autoMode}
                    />
                </div>
                <button 
                    onClick={handleSettingsSave}
                    disabled={settingsSaved || tournamentStatus === 'running'}
                    style={{
                        opacity: (settingsSaved || tournamentStatus === 'running') ? 0.5 : 1,
                        cursor: (settingsSaved || tournamentStatus === 'running') ? 'not-allowed' : 'pointer'
                    }}
                >
                    Save Settings
                </button>
            </div>

            <div className="matches-section">
                <h3>Tournament Matches:</h3>
                {matches.length > 0 && tournamentSettings.startTime && (
                    <div className="schedule-info">
                        <h4>Match Schedule:</h4>
                        {calculateMatchSchedule().map((match, index) => (
                            <div key={match._id} className="schedule-item">
                                <span>Match {index + 1}:</span>
                                <span>{match.pair1?.symbol} vs {match.pair2?.symbol}</span>
                                <span>{formatDateTime(match.scheduledStart)}</span>
                            </div>
                        ))}
                    </div>
                )}
                <div className="matches-list">
                    {memoizedMatches.map(match => (
                        <div key={match._id} className="match-item">
                            <div className="match-header">
                                <p className="round-name">
                                    {getRoundName(match.roundName)}
                                </p>
                                <p className={`match-status ${match.status}`}>
                                    Status: {match.status}
                                </p>
                            </div>

                            <div className="match-content">
                                <div className="team-container">
                                    <div className="team team1">
                                        <div className="team-name">{match.pair1?.symbol}</div>
                                        {match.status === 'active' && liveMatchData[match._id]?.pair1 && (
                                            <div className="price-info">
                                                <div className="current-price">
                                                    Price: {liveMatchData[match._id]?.pair1?.currentPrice || '0.00'}
                                                </div>
                                                <div className={`price-change ${(liveMatchData[match._id]?.pair1?.change || 0) >= 0 ? 'positive' : 'negative'}`}>
                                                    {(liveMatchData[match._id]?.pair1?.change || 0) >= 0 ? '+' : ''}
                                                    {liveMatchData[match._id]?.pair1?.change || '0.00'}%
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="vs">VS</div>
                                    <div className="team team2">
                                        <div className="team-name">{match.pair2?.symbol}</div>
                                        {match.status === 'active' && liveMatchData[match._id]?.pair2 && (
                                            <div className="price-info">
                                                <div className="current-price">
                                                    Price: {liveMatchData[match._id]?.pair2?.currentPrice || '0.00'}
                                                </div>
                                                <div className={`price-change ${(liveMatchData[match._id]?.pair2?.change || 0) >= 0 ? 'positive' : 'negative'}`}>
                                                    {(liveMatchData[match._id]?.pair2?.change || 0) >= 0 ? '+' : ''}
                                                    {liveMatchData[match._id]?.pair2?.change || '0.00'}%
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="match-timer">
                                    {match.status === 'pending' && (
                                        <>Start: {formatDateTime(calculateMatchSchedule()
                                            .find(m => m._id === match._id)?.scheduledStart)}</>
                                    )}
                                    {match.status === 'active' && matchTimers[match._id]?.type === 'active' && (
                                        <>Time remaining: {formatTime(matchTimers[match._id].timeLeft)}</>
                                    )}
                                    {match.status === 'completed' && (
                                        <>Match completed</>
                                    )}
                                </div>

                                {match.status === 'completed' && match.winner && (
                                    <div className="match-result">
                                        <p className="winner">
                                            Winner: {pairs.find(p => p._id === match.winner)?.symbol}
                                        </p>
                                        <div className="final-results">
                                            {match.pair1Price && (
                                                <div className="team-result">
                                                    <span>{match.pair1?.symbol}:</span>
                                                    <span className={match.pair1Price?.change >= 0 ? 'positive' : 'negative'}>
                                                        {match.pair1Price?.change?.toFixed(2)}%
                                                    </span>
                                                </div>
                                            )}
                                            {match.pair2Price && (
                                                <div className="team-result">
                                                    <span>{match.pair2?.symbol}:</span>
                                                    <span className={match.pair2Price?.change >= 0 ? 'positive' : 'negative'}>
                                                        {match.pair2Price?.change?.toFixed(2)}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {error && <p style={{color: 'red'}}>{error}</p>}
        </div>
    );
}

export default AdminPanel;


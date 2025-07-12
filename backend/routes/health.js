const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const os = require('os');

router.get('/', async (req, res) => {
    try {
        const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
        
        const systemInfo = {
            uptime: Math.floor(process.uptime()),
            memory: {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem(),
                usagePercentage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
            },
            cpu: os.cpus(),
            loadAvg: os.loadavg()
        };
        
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: {
                status: dbStatus
            },
            system: systemInfo,
            environment: process.env.NODE_ENV
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

module.exports = router; 
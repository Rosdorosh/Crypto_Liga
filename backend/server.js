const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { MONGODB_URI, PORT, HOST } = require('./config');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'PATCH']
}));

app.use(express.json());

app.use(express.static(path.join(__dirname, '../frontend/build')));

app.use('/api/admin', adminRoutes);
app.use('/api', userRoutes);

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('Connected to MongoDB');
})
.catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Something broke!',
        message: err.message 
    });
});

app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});

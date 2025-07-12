const { exec } = require('child_process');
const path = require('path');

const buildPath = path.join(__dirname, 'frontend', 'build');

console.log('Building frontend...');
exec('cd frontend && npm run build', (error, stdout, stderr) => {
    if (error) {
        console.error(`Frontend build error: ${error}`);
        return;
    }
    console.log('Frontend built successfully');
    
    console.log('Starting server...');
    require('./backend/server.js');
}); 
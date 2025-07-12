<img width="1578" height="392" alt="Знімок екрана 2025-07-12 170633" src="https://github.com/user-attachments/assets/db9df69f-e80d-4d1d-9668-7d35540c0f35" />


# 🏆 Crypto Liga - crypto game, sports competition simulator, with tournament gameplay, crypto teams competition and real cryptocurrency rewards.

(beta version)Telegram Game bot: https://t.me/AGTI_league_bot
Telegram for quick communication: https://t.me/Rosko_Dorosh

1. Gameplay and tournament mechanics

**Joining and registration.** 
Players enter the game through TON Connect, confirm address ownership and top up their game account

**Draw and online matches**
Before the tournament starts, players can choose one of the available crypto teams and reserve it by making a fixed deposit. 
At the beginning of the tournament, the engine forms a tournament bracket and launches matches in real time, which are generated based on market data.
Throughout the tournament, the app hosts online broadcasts of match progress.

**Live tournaments "without pauses".**
In the game world, there are three types of tournaments:

-Daily tournaments where 32 teams compete "elimination" starting from 1/16 finals. Each match lasts 3 minutes, the team that grew the most or fell the least during this period wins. Prize fund is formed from players' contributions and automatically distributed among prize places. Anyone can participate.

-Weekly tournaments where 32 teams compete "elimination" starting from 1/16 finals. Each match lasts 5 minutes, the team that grew the most or fell the least during this period wins. Prize fund is formed from players' contributions, supplemented by platform bonuses and automatically distributed among prize places. Only a player who participated in at least one daily tournament can participate.

-Monthly mega tournament where 128 teams are divided into 16 groups of 8 teams, where they play first matches and return matches, and only 2 crypto teams from the group advance to the final part, where they compete "elimination" starting from 1/16 finals. Each match lasts 10 minutes, the team that grew the most or fell the least during this period wins. Prize fund is formed from players' contributions, supplemented by platform bonuses and automatically distributed among finalists and prize places. Only a player who participated in at least one weekly tournament can participate.

2. Economics

**Prize fund and payouts.**
 90% of entry fees are automatically sent to the smart contract; it is also supplemented by platform bonuses. After the final, the contract instantly divides the pool among prize places.
**Multi-level referral system.** 
By inviting friends, a player receives a share of their contributions; commission is paid in the same TON token and displayed in the wallet without manual actions.
**TON-chain transparency.** 
All deposits, withdrawals and reward distributions are logged on-chain: every transaction can be verified through the block explorer, and in the game - through the built-in operation history.


3. Administrator Panel

**Tournament Management**: Create, schedule and manage tournaments
**Player Administration**: Monitor player activities and statistics
**Financial Oversight**: Track prize funds and transaction flows
**System Configuration**: Flexible game settings and parameters

## Technology Stack

1. Backend
- **Node.js** + **Express.js** - Server framework
- **MongoDB** + **Mongoose** - Database and ODM
- **WebSocket** - Real-time communication
- **TON Web** - TON blockchain integration
- **Bybit API** - Cryptocurrency prices

2. Frontend
- **React 18** - Modern UI framework
- **TON Connect UI** - TON wallet integration
- **React Router** - Client-side routing
- **WebSocket Client** - Real-time updates

3. Infrastructure
- **Docker** - Containerized deployment
- **Nginx** - Reverse proxy and SSL
- **Let's Encrypt** - SSL certificate management

## Quick Start

 Prerequisites
- Node.js 16+ and npm
- MongoDB instance
- Docker and Docker Compose (for production)

 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/crypto-liga.git
   cd crypto-liga/liga
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create `backend/.env`:
   ```env
   MONGO_URI=mongodb://localhost:27017/crypto-liga
   ADMIN_TOKEN=your-secure-admin-token
   PORT=5000
   GAME_WALLET_ADDRESS=your-game-wallet-address
   BOT_URL=https://t.me/your_bot
   ```

   Create `frontend/.env`:
   ```env
   REACT_APP_GAME_WALLET=your-game-wallet-address
   REACT_APP_MANIFEST_URL=https://your-domain.com/tonconnect-manifest.json
   REACT_APP_TWA_RETURN_URL=https://t.me/your_bot
   REACT_APP_SITE_URL=https://your-domain.com
   REACT_APP_BOT_URL=https://t.me/your_bot
   ```

4. **Start development servers**
   ```bash
   npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000
   - Admin Panel: http://localhost:3000/admin

## Production Deployment

Using Docker Compose

1. **Configure environment variables**
   ```bash
   cp liga/backend/.env.example liga/backend/.env
   cp liga/frontend/.env.example liga/frontend/.env
   # Edit the files with your production values
   ```

2. **Build and start services**
   ```bash
   docker-compose up -d
   ```

3. **Setup SSL certificates**
   ```bash
   ./renew-ssl.sh
   ```

Manual Deployment

1. **Build frontend**
   ```bash
   cd liga/frontend
   npm run build
   ```

2. **Start backend**
   ```bash
   cd liga/backend
   npm start
   ```

3. **Configure Nginx**
   - Copy `nginx.conf` to your Nginx configuration
   - Update domain names and SSL certificates


**⚠️ Disclaimer**: This is a crypto gaming platform. Please play responsibly and only invest what you can afford to lose. Cryptocurrency investments carry inherent risks.

 Crypto Liga developed by @Rosko_Dorosh ( https://t.me/Rosko_Dorosh ) 
=======
# Crypto_Liga

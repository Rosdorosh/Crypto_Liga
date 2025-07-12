export const tonConnectConfig = {
    manifestUrl: process.env.REACT_APP_MANIFEST_URL || 'YOUR_MANIFEST_URL',
    buttonRootId: 'ton-connect-button',
    actionsConfiguration: {
        twaReturnUrl: process.env.REACT_APP_TWA_RETURN_URL || 'YOUR_TELEGRAM_BOT_URL'
    },
    network: 'mainnet',
    gameWalletAddress: process.env.REACT_APP_GAME_WALLET || 'YOUR_GAME_WALLET_ADDRESS',
    minAmount: '0.1',
    fee: '0.05'
};

export const tonManifest = {
    url: process.env.REACT_APP_SITE_URL || 'YOUR_SITE_URL',
    name: 'Crypto Liga',
    iconUrl: process.env.REACT_APP_ICON_URL || 'YOUR_ICON_URL',
    termsOfUseUrl: process.env.REACT_APP_TERMS_URL || 'YOUR_TERMS_URL',
    privacyPolicyUrl: process.env.REACT_APP_PRIVACY_URL || 'YOUR_PRIVACY_URL'
};

export const formatTonAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export const convertToTon = (amount) => {
    return parseFloat(amount) * 0.001;
};

export const convertFromTon = (tonAmount) => {
    return parseFloat(tonAmount) / 0.001;
}; 
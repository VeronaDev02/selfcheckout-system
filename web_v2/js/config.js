/**
 * config.js - Configurações globais do sistema
 * Centraliza todas as configurações constantes do aplicativo
 */

const Config = {
    // Configurações STUN/ICE para WebRTC
    iceServers: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    },
    
    // Porta padrão para WebSockets do PDV
    pdvWebSocketPort: 8765,
    
    // Elementos da interface
    selectors: {
        grid: 'mainGrid',
        fullscreenBtn: 'fullscreenBtn',
        toggleServerBtn: 'toggleServerControls',
        toggleConnectionBtn: 'toggleConnectionControls',
        serverPanel: 'serverControlsPanel',
        connectionPanel: 'connectionControlsPanel',
        serverStatus: 'serverStatus',
        serverAddress: 'serverAddress'
    },
    
    // Quantidade de quadrantes
    quadrantCount: 4,
    
    // Tempo limite para inatividade (em segundos)
    inactivityTimeout: 60,
    
    // Classes CSS
    classes: {
        fullscreen: 'fullscreen',
        hasFullscreen: 'has-fullscreen',
        inactivityAlert: 'inactivity-alert',
        inactivityFullscreen: 'inactivity-fullscreen',
        logContent: 'log-content',
        pdvNotification: 'pdv-notification',
        connected: 'connected',
        visible: 'visible'
    }
};

// Previne modificações no objeto de configuração
Object.freeze(Config);

export default Config;
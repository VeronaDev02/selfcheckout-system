/**
 * main.js - Ponto de entrada principal da aplicação
 * Inicializa todos os módulos e configura os event listeners globais
 */

import UI from './modules/ui.js';
import ConnectionManager from './modules/connection.js';
import CameraManager from './modules/camera.js';
import PDVManager from './modules/pdv.js';
import ThemeManager from './modules/theme.js';
import Logger from './utils/logger.js';

// Função principal de inicialização
function initialize() {
    Logger.log('info', 'Inicializando aplicação SelfCheckout');
    
    // Inicializa o gerenciador de temas
    ThemeManager.initialize();
    
    // Inicializa a interface do usuário
    UI.initialize();
    
    // Configura eventos globais específicos da aplicação
    setupGlobalEvents();
    
    // Configura funções globais para compatibilidade com HTML
    setupGlobalFunctions();
    
    Logger.log('info', 'Aplicação inicializada com sucesso');
}

// Configura eventos globais
function setupGlobalEvents() {
    // Tratamento de erros global
    window.addEventListener('error', (event) => {
        Logger.log('error', `Erro global: ${event.message}`, {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
        });
    });
    
    // Tratamento de promessas rejeitadas não capturadas
    window.addEventListener('unhandledrejection', (event) => {
        Logger.log('error', 'Promessa rejeitada não tratada:', event.reason);
    });
}

// Configura funções globais para botões HTML
function setupGlobalFunctions() {
    // Exporta funções para o escopo global para compatibilidade com os atributos onclick no HTML
    window.connectToServer = function() {
        ConnectionManager.connectServer();
    };
    
    window.disconnectFromServer = function() {
        ConnectionManager.disconnectServer();
    };
    
    window.connectCamera = function(id) {
        CameraManager.connectCamera(id);
    };
    
    window.connectPDV = function(id) {
        PDVManager.connectPDV(id);
    };
}

// Inicializa a aplicação quando o DOM estiver completamente carregado
document.addEventListener('DOMContentLoaded', initialize);
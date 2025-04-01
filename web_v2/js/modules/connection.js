/**
 * connection.js - Gerenciamento de conexões
 * Gerencia todas as conexões WebSocket e WebRTC
 */

import Config from '../config.js';
import Logger from '../utils/logger.js';
import UI from './ui.js';
import AlertSystem from './alerts.js';
import PDVManager from './pdv.js';
import CameraManager from './camera.js';

class ConnectionManager {
    constructor() {
        // Conexão principal com o servidor
        this.serverConnection = null;
        
        // Estado da conexão
        this.isConnected = false;
        
        // Escuta por eventos de conectar
        document.addEventListener('server:connect', this.connectServer.bind(this));
    }
    
    /**
     * Conecta ao servidor principal
     */
    connectServer() {
        // Verifica se já está conectado
        if (this.isConnected) {
            Logger.log('info', 'Já conectado ao servidor');
            return;
        }
        
        const serverAddress = UI.getServerAddress();
        
        // Atualiza interface
        UI.updateServerStatus('Conectando...', false);
        
        // Configura a conexão principal do servidor para PDVs
        try {
            const pdvServerUrl = `ws://${serverAddress.replace(':8080', `:${Config.pdvWebSocketPort}`)}`;
            this.serverConnection = new WebSocket(pdvServerUrl);
            
            // Configura handlers de eventos
            this.setupServerEventHandlers();
            
            Logger.log('info', `Iniciando conexão com servidor: ${pdvServerUrl}`);
        } catch (error) {
            Logger.log('error', 'Falha ao conectar ao servidor', error);
            UI.updateServerStatus('Falha na conexão', false);
        }
    }
    
    /**
     * Configura handlers de eventos para a conexão do servidor
     */
    setupServerEventHandlers() {
        if (!this.serverConnection) return;
        
        this.serverConnection.onopen = () => {
            Logger.log('info', 'Conectado ao servidor PDV');
            UI.updateServerStatus('Conectado', true);
            this.isConnected = true;
            
            // Inicializa o gerenciador de PDVs
            PDVManager.initialize(this.serverConnection);
        };
        
        this.serverConnection.onclose = () => {
            Logger.log('info', 'Desconectado do servidor PDV');
            UI.updateServerStatus('Desconectado', false);
            this.isConnected = false;
            
            // Limpa os gerenciadores
            PDVManager.cleanup();
            CameraManager.cleanup();
        };
        
        this.serverConnection.onerror = (error) => {
            Logger.log('error', 'Erro na conexão com o servidor PDV', error);
            UI.updateServerStatus('Erro na conexão', false);
            this.isConnected = false;
        };
        
        this.serverConnection.onmessage = this.handleServerMessage.bind(this);
    }
    
    /**
     * Processa mensagens recebidas do servidor
     * @param {MessageEvent} event - Evento de mensagem WebSocket
     */
    handleServerMessage(event) {
        try {
            const message = JSON.parse(event.data);
            Logger.log('info', 'Mensagem recebida do servidor:', message);
            
            // Encaminha a mensagem para o módulo apropriado com base no tipo
            if (message.type === 'register_response' || message.type === 'pdv_data') {
                PDVManager.handleMessage(message);
            } else if (message.type === 'pdv_inativo_timeout') {
                // Trata alertas de inatividade
                if (message.pdv_ip) {
                    const quadrantId = PDVManager.getQuadrantByPdvIp(message.pdv_ip);
                    if (quadrantId) {
                        AlertSystem.addAlert(quadrantId, message.pdv_ip, message.inactive_time);
                    }
                }
            }
        } catch (error) {
            Logger.log('error', 'Erro ao processar mensagem do servidor:', error);
        }
    }
    
    /**
     * Desconecta do servidor e limpa todas as conexões
     */
    disconnectServer() {
        // Fecha todas as conexões
        if (this.serverConnection) {
            this.serverConnection.close();
            this.serverConnection = null;
        }
        
        // Limpa os módulos dependentes
        CameraManager.cleanup();
        PDVManager.cleanup();
        
        // Limpa os alertas de inatividade
        AlertSystem.clearAllAlerts();
        
        // Atualiza a interface
        UI.updateServerStatus('Desconectado', false);
        
        // Atualiza o status de cada quadrante
        for (let i = 1; i <= Config.quadrantCount; i++) {
            UI.updateQuadrantStatus(i, 'Desconectado');
        }
        
        // Limpa os logs
        UI.clearAllLogs();
        
        this.isConnected = false;
        
        Logger.log('info', 'Desconectado do servidor com sucesso');
    }
    
    /**
     * Verifica se está conectado ao servidor
     * @returns {boolean} Estado da conexão
     */
    isServerConnected() {
        return this.isConnected && 
               this.serverConnection && 
               this.serverConnection.readyState === WebSocket.OPEN;
    }
    
    /**
     * Obtém a conexão atual com o servidor
     * @returns {WebSocket|null} Conexão WebSocket
     */
    getServerConnection() {
        return this.serverConnection;
    }
}

// Exporta uma instância única do gerenciador de conexões
export default new ConnectionManager();
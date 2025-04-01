/**
 * pdv.js - Gerenciamento de PDVs
 * Gerencia a conexão e comunicação com os PDVs
 */

import Config from '../config.js';
import Logger from '../utils/logger.js';
import UI from './ui.js';
import { extractPdvNumber, formatTimestamp } from '../utils/formatting.js';
import AlertSystem from './alerts.js';

class PDVManager {
    constructor() {
        // Mapeamento de IPs de PDV para quadrantes
        this.pdvMapping = {};
        
        // Mapeamento reverso de quadrantes para IPs
        this.quadrantToIp = {};
        
        // Referência à conexão do servidor
        this.serverConnection = null;
        
        // Escuta por eventos de conectar PDV
        document.addEventListener('pdv:connect', this.handleConnectEvent.bind(this));
    }
    
    /**
     * Inicializa o gerenciador com a conexão do servidor
     * @param {WebSocket} serverConnection - Conexão WebSocket com o servidor
     */
    initialize(serverConnection) {
        this.serverConnection = serverConnection;
        Logger.log('info', 'PDV Manager inicializado');
    }
    
    /**
     * Trata evento de conexão de PDV
     * @param {CustomEvent} event - Evento personalizado com ID do PDV
     */
    handleConnectEvent(event) {
        const id = event.detail.id;
        this.connectPDV(id);
    }
    
    /**
     * Conecta a um PDV
     * @param {number} id - ID do quadrante
     */
    connectPDV(id) {
        if (!this.serverConnection) {
            alert('Conecte-se ao servidor primeiro!');
            return;
        }
        
        const pdvIp = UI.getPdvIp(id);
        
        // Verifica se o IP é válido
        if (!pdvIp) {
            alert('Digite um IP de PDV válido');
            return;
        }
        
        const logContainer = document.getElementById(`log${id}`);
        
        // Configura o elemento de conteúdo interno para o log, se ainda não existir
        const logContent = UI.setupLogContent(logContainer);
        
        // Remove alertas de inatividade antigos se existirem
        AlertSystem.clearAlert(id);
        
        // Registra o mapeamento deste quadrante para este IP de PDV
        this.pdvMapping[pdvIp] = id;
        this.quadrantToIp[id] = pdvIp;
        
        // Envia comando de registro para o PDV
        try {
            const registerCommand = {
                command: "register",
                pdv_ip: pdvIp
            };
            
            Logger.log('info', `Enviando registro para PDV ${pdvIp}`, registerCommand);
            this.serverConnection.send(JSON.stringify(registerCommand));
            
            // Atualiza o status e adiciona mensagem de log inicial
            UI.updateQuadrantStatus(id, 'Conectando PDV...');
            
            // Formata número do PDV (últimos 2 dígitos)
            const pdvNumber = extractPdvNumber(pdvIp);
            Logger.addToQuadrantLog(id, 'INFO', `Conectando ao PDV ${pdvNumber}...`);
            
        } catch (error) {
            Logger.log('error', `Erro ao conectar ao PDV ${id}:`, error);
            Logger.addToQuadrantLog(id, 'ERRO', 'Falha na conexão com o PDV');
            UI.updateQuadrantStatus(id, 'Erro PDV');
        }
    }
    
    /**
     * Processa mensagens relacionadas aos PDVs
     * @param {object} message - Mensagem recebida do servidor
     */
    handleMessage(message) {
        // Se for uma resposta de registro, processa
        if (message.type === 'register_response') {
            this.handleRegisterResponse(message);
        }
        // Se for dados do PDV, exibe no log do quadrante correspondente
        else if (message.type === 'pdv_data') {
            this.handlePdvData(message);
        }
    }
    
    /**
     * Processa resposta de registro de PDV
     * @param {object} message - Mensagem de resposta de registro
     */
    handleRegisterResponse(message) {
        const pdvIp = message.pdv_ip;
        const quadrantId = this.pdvMapping[pdvIp];
        
        if (!quadrantId) {
            Logger.log('warn', `Recebida resposta de registro para PDV ${pdvIp}, mas não há quadrante associado`);
            return;
        }
        
        const pdvNumber = extractPdvNumber(pdvIp);
        
        if (message.success) {
            Logger.log('info', `Registrado com sucesso para o PDV ${pdvNumber}`);
            UI.updateQuadrantStatus(quadrantId, `Conectado - PDV ${pdvNumber}`);
            Logger.addToQuadrantLog(quadrantId, 'INFO', `Registrado no PDV ${pdvNumber}`);
        } else {
            Logger.log('error', `Falha ao registrar para o PDV ${pdvIp}`);
            UI.updateQuadrantStatus(quadrantId, 'Falha - PDV');
            Logger.addToQuadrantLog(quadrantId, 'ERRO', `Falha ao registrar no PDV ${pdvNumber}`);
        }
    }
    
    /**
     * Processa dados recebidos do PDV
     * @param {object} message - Mensagem com dados do PDV
     */
    handlePdvData(message) {
        const pdvIp = message.pdv_ip;
        const quadrantId = this.pdvMapping[pdvIp];
        
        if (!quadrantId) {
            Logger.log('warn', `Recebida mensagem do PDV ${pdvIp}, mas não há quadrante associado`);
            return;
        }
        
        const logContainer = document.getElementById(`log${quadrantId}`);
        const logContent = logContainer.querySelector('.log-content') || logContainer;
        
        // Formata a data/hora atual
        const timestamp = formatTimestamp();
        
        // Adiciona a mensagem ao log
        logContent.textContent += `[${timestamp}] ${message.data}\n`;
        
        // Mantém o scroll no final do log
        logContent.scrollTop = logContent.scrollHeight;
        
        Logger.log('info', `Mensagem do PDV ${pdvIp} exibida no quadrante ${quadrantId}`);
    }
    
    /**
     * Obtém o ID do quadrante associado a um IP de PDV
     * @param {string} pdvIp - Endereço IP do PDV
     * @returns {number|null} ID do quadrante ou null se não encontrado
     */
    getQuadrantByPdvIp(pdvIp) {
        return this.pdvMapping[pdvIp] || null;
    }
    
    /**
     * Obtém o IP do PDV associado a um quadrante
     * @param {number} quadrantId - ID do quadrante
     * @returns {string|null} Endereço IP do PDV ou null se não encontrado
     */
    getPdvIpByQuadrant(quadrantId) {
        return this.quadrantToIp[quadrantId] || null;
    }
    
    /**
     * Limpa as conexões e mapeamentos de PDV
     */
    cleanup() {
        // Limpa os mapeamentos
        this.pdvMapping = {};
        this.quadrantToIp = {};
        this.serverConnection = null;
        
        Logger.log('info', 'PDV Manager: conexões e mapeamentos limpos');
    }
}

// Exporta uma instância única do gerenciador de PDVs
export default new PDVManager();
/**
 * logger.js - Sistema de log centralizado
 * Fornece funções para registro de logs no console e na interface
 */

import { formatLogMessage, applyLogStyles } from './formatting.js';

/**
 * Classe para gerenciar logs do sistema
 */
class Logger {
    /**
     * Registra mensagem no console com nível apropriado
     * @param {string} level - Nível de log (info, warn, error)
     * @param {string} message - Mensagem a ser registrada
     * @param {object} [data] - Dados adicionais opcionais
     */
    static log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] ${message}`;
        
        switch (level.toLowerCase()) {
            case 'info':
                console.info(formattedMessage, data || '');
                break;
            case 'warn':
                console.warn(formattedMessage, data || '');
                break;
            case 'error':
                console.error(formattedMessage, data || '');
                break;
            default:
                console.log(formattedMessage, data || '');
        }
    }
    
    /**
     * Adiciona mensagem ao log visual de um quadrante específico
     * @param {number} quadrantId - ID do quadrante (1-4)
     * @param {string} type - Tipo de mensagem (INFO, ERRO, ALERTA)
     * @param {string} message - Conteúdo da mensagem
     */
    static addToQuadrantLog(quadrantId, type, message) {
        const logContainer = document.getElementById(`log${quadrantId}`);
        if (!logContainer) return;
        
        // Encontra ou cria o elemento de conteúdo do log
        let logContent = logContainer.querySelector('.log-content');
        if (!logContent) {
            logContent = document.createElement('div');
            logContent.className = 'log-content';
            logContainer.appendChild(logContent);
        }
        
        // Formata a mensagem
        const formattedMessage = formatLogMessage(type, message);
        
        // Adiciona a mensagem ao log e mantém scroll no fim
        const styledMessage = applyLogStyles(formattedMessage);
        
        // Usando textContent para texto simples ou innerHTML para aplicar estilos
        if (styledMessage === formattedMessage) {
            // Texto simples sem formatação
            const messageElement = document.createElement('div');
            messageElement.textContent = styledMessage;
            logContent.appendChild(messageElement);
        } else {
            // Mensagem com formatação HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = styledMessage;
            logContent.appendChild(tempDiv.firstChild || tempDiv);
        }
        
        // Mantém o scroll no final do log
        logContent.scrollTop = logContent.scrollHeight;
    }
    
    /**
     * Limpa o log de um quadrante específico
     * @param {number} quadrantId - ID do quadrante (1-4)
     */
    static clearQuadrantLog(quadrantId) {
        const logContainer = document.getElementById(`log${quadrantId}`);
        if (!logContainer) return;
        
        const logContent = logContainer.querySelector('.log-content');
        if (logContent) {
            logContent.textContent = '';
        }
    }
    
    /**
     * Atualiza status visual de um quadrante
     * @param {number} quadrantId - ID do quadrante (1-4)
     * @param {string} status - Texto de status a ser exibido
     */
    static updateQuadrantStatus(quadrantId, status) {
        const statusElement = document.getElementById(`status${quadrantId}`);
        if (statusElement) {
            statusElement.textContent = status;
        }
    }
}

export default Logger;
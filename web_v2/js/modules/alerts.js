/**
 * alerts.js - Sistema de alertas de inatividade
 * Gerencia a exibição e controle de alertas de inatividade nos quadrantes
 */

import Config from '../config.js';
import Logger from '../utils/logger.js';
import { extractPdvNumber } from '../utils/formatting.js';
import UI from './ui.js';

class AlertSystem {
    constructor() {
        // Fila de alertas pendentes
        this.queue = [];
        
        // Alertas atualmente ativos por quadrante
        this.active = {};
    }
    
    /**
     * Adiciona um novo alerta de inatividade à fila
     * @param {number} quadrantId - ID do quadrante
     * @param {string} pdvIp - Endereço IP do PDV
     * @param {number} inactiveTime - Tempo de inatividade em segundos
     */
    addAlert(quadrantId, pdvIp, inactiveTime) {
        // Se já existe um alerta para este quadrante, não faça nada
        if (this.active[quadrantId]) {
            Logger.log('info', `Alerta já ativo para o quadrante ${quadrantId}`);
            return;
        }
        
        // Cria o objeto de alerta
        const alert = {
            quadrantId,
            pdvIp,
            inactiveTime
        };
        
        // Adiciona à fila
        this.queue.push(alert);
        
        // Registra a mensagem de alerta no log do quadrante
        const pdvNumber = extractPdvNumber(pdvIp);
        Logger.addToQuadrantLog(
            quadrantId, 
            'ALERTA', 
            `PDV ${pdvNumber} inativo por ${inactiveTime} segundos!`
        );
        
        // Se não há alertas ativos neste quadrante, inicia o alerta
        if (!this.active[quadrantId]) {
            this.processNextAlert();
        }
    }
    
    /**
     * Processa o próximo alerta na fila
     */
    processNextAlert() {
        // Se não há alertas na fila, não faz nada
        if (this.queue.length === 0) {
            return;
        }
        
        // Verifica se algum quadrante já está em fullscreen devido a um alerta de inatividade
        const hasFullscreenAlert = Object.values(this.active).some(alert => {
            const quadrantElement = document.getElementById(`quadrant${alert.quadrantId}`);
            return quadrantElement && 
                   quadrantElement.classList.contains(Config.classes.fullscreen) && 
                   quadrantElement.classList.contains(Config.classes.inactivityFullscreen);
        });
        
        // Pega o próximo alerta da fila
        const alert = this.queue.shift();
        
        // Mostra o alerta com ou sem fullscreen
        this.showAlert(alert, !hasFullscreenAlert);
    }
    
    /**
     * Exibe o alerta de inatividade visualmente
     * @param {object} alert - Objeto de alerta
     * @param {boolean} showFullscreen - Se deve exibir em fullscreen
     */
    showAlert(alert, showFullscreen) {
        // Marca como ativo
        this.active[alert.quadrantId] = alert;
        
        const quadrantElement = document.getElementById(`quadrant${alert.quadrantId}`);
        const logContainer = document.getElementById(`log${alert.quadrantId}`);
        
        if (quadrantElement && logContainer) {
            // Adiciona a classe de alerta
            logContainer.classList.add(Config.classes.inactivityAlert);
            
            // Adiciona ou atualiza um elemento de notificação
            let notificationElement = logContainer.querySelector(`.${Config.classes.pdvNotification}`);
            if (!notificationElement) {
                notificationElement = document.createElement('div');
                notificationElement.className = Config.classes.pdvNotification;
                logContainer.appendChild(notificationElement);
            }
            
            const pdvNumber = extractPdvNumber(alert.pdvIp);
            notificationElement.textContent = `PDV ${pdvNumber} inativo por ${alert.inactiveTime}s`;
            notificationElement.style.display = 'block';
            
            Logger.log('info', `Iniciado alerta visual para quadrante ${alert.quadrantId}`);
            
            // Se deve exibir em fullscreen e não está já em fullscreen
            if (showFullscreen && !quadrantElement.classList.contains(Config.classes.fullscreen)) {
                // Marca com uma classe adicional para sabermos que foi colocado em fullscreen por causa de inatividade
                quadrantElement.classList.add(Config.classes.inactivityFullscreen);
                // Usa a função existente para ativar o fullscreen
                UI.toggleQuadrantFullscreen(quadrantElement);
                Logger.log('info', `Quadrante ${alert.quadrantId} colocado em fullscreen automático devido à inatividade`);
            }
        }
    }
    
    /**
     * Limpa o alerta de inatividade de um quadrante específico
     * @param {number} quadrantId - ID do quadrante
     */
    clearAlert(quadrantId) {
        const wasActive = this.active[quadrantId];
        
        // Remove da lista de alertas ativos
        if (wasActive) {
            delete this.active[quadrantId];
            
            // Remove classes visuais
            const logContainer = document.getElementById(`log${quadrantId}`);
            const quadrantElement = document.getElementById(`quadrant${quadrantId}`);
            
            if (logContainer) {
                logContainer.classList.remove(Config.classes.inactivityAlert);
                
                // Remove a notificação
                const notification = logContainer.querySelector(`.${Config.classes.pdvNotification}`);
                if (notification) {
                    notification.style.display = 'none';
                }
            }
            
            // Se este quadrante estava em fullscreen devido à inatividade, remova o fullscreen
            if (quadrantElement && quadrantElement.classList.contains(Config.classes.inactivityFullscreen)) {
                // Remove a marca de fullscreen por inatividade
                quadrantElement.classList.remove(Config.classes.inactivityFullscreen);
                
                // Se estiver em fullscreen, remove o fullscreen
                if (quadrantElement.classList.contains(Config.classes.fullscreen)) {
                    UI.toggleQuadrantFullscreen(quadrantElement);
                    Logger.log('info', `Removido fullscreen automático do quadrante ${quadrantId}`);
                }
            }
            
            Logger.log('info', `Removido alerta visual do quadrante ${quadrantId}`);
            
            // Processa o próximo alerta na fila
            this.processNextAlert();
        }
        
        // Remove quaisquer alertas pendentes deste quadrante da fila
        this.queue = this.queue.filter(alert => alert.quadrantId !== quadrantId);
    }
    
    /**
     * Limpa todos os alertas de inatividade
     */
    clearAllAlerts() {
        // Remove todos os alertas ativos
        Object.keys(this.active).forEach(quadrantId => {
            this.clearAlert(parseInt(quadrantId));
        });
        
        // Limpa a fila
        this.queue = [];
        
        // Remove classes visuais de todos os quadrantes
        for (let i = 1; i <= Config.quadrantCount; i++) {
            const logContainer = document.getElementById(`log${i}`);
            const quadrantElement = document.getElementById(`quadrant${i}`);
            
            if (logContainer) {
                logContainer.classList.remove(Config.classes.inactivityAlert);
                
                // Remove a notificação
                const notification = logContainer.querySelector(`.${Config.classes.pdvNotification}`);
                if (notification) {
                    notification.style.display = 'none';
                }
            }
            
            // Remove a classe de fullscreen por inatividade e o fullscreen se necessário
            if (quadrantElement && quadrantElement.classList.contains(Config.classes.inactivityFullscreen)) {
                quadrantElement.classList.remove(Config.classes.inactivityFullscreen);
                if (quadrantElement.classList.contains(Config.classes.fullscreen)) {
                    UI.toggleQuadrantFullscreen(quadrantElement);
                }
            }
        }
    }
}

// Exporta uma instância única do sistema de alertas
export default new AlertSystem();
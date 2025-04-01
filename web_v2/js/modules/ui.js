/**
 * ui.js - Interface do usuário
 * Gerencia a interface do usuário e manipulações do DOM
 */

import Config from '../config.js';
import Logger from '../utils/logger.js';
import AlertSystem from './alerts.js';

class UI {
    constructor() {
        // Armazena elementos importantes da UI para acesso rápido
        this.elements = {};
    }
    
    /**
     * Inicializa a interface do usuário e configura event listeners
     */
    initialize() {
        Logger.log('info', 'Inicializando interface do usuário');
        
        // Carrega referências para elementos importantes
        this.loadElements();
        
        // Configura event listeners
        this.setupEventListeners();
        
        // Limpa todos os logs inicialmente
        this.clearAllLogs();
        
        // Desativa controles de vídeo em todos os players
        this.disableVideoControls();
    }
    
    /**
     * Carrega referências para elementos importantes
     */
    loadElements() {
        // Elementos do seletor de configuração
        for (const [key, selector] of Object.entries(Config.selectors)) {
            this.elements[key] = document.getElementById(selector);
        }
        
        // Elementos dos quadrantes
        this.quadrants = [];
        this.logContainers = [];
        this.statusElements = [];
        this.videoElements = [];
        
        for (let i = 1; i <= Config.quadrantCount; i++) {
            this.quadrants[i] = document.getElementById(`quadrant${i}`);
            this.logContainers[i] = document.getElementById(`log${i}`);
            this.statusElements[i] = document.getElementById(`status${i}`);
            this.videoElements[i] = document.getElementById(`remoteVideo${i}`);
        }
    }
    
    /**
     * Configura event listeners para a interface
     */
    setupEventListeners() {
        // Adiciona event listeners para os quadrantes
        for (let i = 1; i <= Config.quadrantCount; i++) {
            if (this.quadrants[i]) {
                this.quadrants[i].addEventListener('dblclick', (event) => {
                    // Limpa qualquer alerta de inatividade neste quadrante
                    AlertSystem.clearAlert(i);
                    
                    // Ativa/desativa modo tela cheia
                    this.toggleQuadrantFullscreen(event.currentTarget);
                });
            }
        }
        
        // Configurar botão de tela cheia
        if (this.elements.fullscreenBtn) {
            this.elements.fullscreenBtn.addEventListener('click', () => this.toggleDocumentFullscreen());
        }
        
        // Configurar toggle do painel do servidor
        if (this.elements.toggleServerBtn) {
            this.elements.toggleServerBtn.addEventListener('click', () => this.togglePanel('serverPanel'));
        }
        
        // Configurar toggle do painel de conexão
        if (this.elements.toggleConnectionBtn) {
            this.elements.toggleConnectionBtn.addEventListener('click', () => this.togglePanel('connectionPanel'));
        }
        
        // Listener para a tecla ESC - sai do modo fullscreen
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                const fullscreenQuadrant = document.querySelector(`.stream-container.${Config.classes.fullscreen}`);
                if (fullscreenQuadrant) {
                    this.toggleQuadrantFullscreen(fullscreenQuadrant);
                }
            }
        });
        
        // Adiciona listener para a tecla Enter nos campos de entrada
        document.addEventListener('keypress', this.handleEnterKey.bind(this));
    }
    
    /**
     * Trata eventos de tecla Enter nos campos de entrada
     * @param {KeyboardEvent} event - Evento de teclado
     */
    handleEnterKey(event) {
        // Verifica se foi pressionado Enter
        if (event.key !== 'Enter') return;
        
        const target = event.target;
        
        // Verifica o tipo de campo e dispara ação apropriada
        if (target.id === Config.selectors.serverAddress) {
            // Se foi no campo de servidor, dispara evento customizado
            const connectEvent = new CustomEvent('server:connect');
            document.dispatchEvent(connectEvent);
        }
        // Campo RTSP
        else if (target.id.startsWith('rtspUrl')) {
            const id = target.id.charAt(target.id.length - 1);
            const connectEvent = new CustomEvent('camera:connect', { detail: { id } });
            document.dispatchEvent(connectEvent);
        }
        // Campo PDV
        else if (target.id.startsWith('pdvIp')) {
            const id = target.id.charAt(target.id.length - 1);
            const connectEvent = new CustomEvent('pdv:connect', { detail: { id } });
            document.dispatchEvent(connectEvent);
        }
    }
    
    /**
     * Alterna a visibilidade de um painel
     * @param {string} panelKey - Chave do painel no objeto elements
     */
    togglePanel(panelKey) {
        if (!this.elements[panelKey]) return;
        
        const panel = this.elements[panelKey];
        const isVisible = panel.classList.toggle(Config.classes.visible);
        
        // Atualiza o texto do botão correspondente
        let toggleBtn;
        
        if (panelKey === 'serverPanel') {
            toggleBtn = this.elements.toggleServerBtn;
            toggleBtn.textContent = isVisible ? '↓ Servidor' : '↑ Servidor';
        } else if (panelKey === 'connectionPanel') {
            toggleBtn = this.elements.toggleConnectionBtn;
            toggleBtn.textContent = isVisible ? '↑ Ocultar Controles' : '↓ Mostrar Controles';
        }
    }
    
    /**
     * Alterna o modo de tela cheia para um quadrante
     * @param {HTMLElement} element - Elemento do quadrante
     */
    toggleQuadrantFullscreen(element) {
        if (!element) return;
        
        const grid = this.elements.grid;
        
        if (element.classList.contains(Config.classes.fullscreen)) {
            // Sair do modo fullscreen
            element.classList.remove(Config.classes.fullscreen);
            grid.classList.remove(Config.classes.hasFullscreen);
            
            // Mostrar todos os quadrantes
            const allQuadrants = document.querySelectorAll('.stream-container');
            allQuadrants.forEach(quadrant => {
                quadrant.style.display = 'flex';
                
                // Resetar layout para o padrão
                const logContainer = quadrant.querySelector('.log-container');
                const videoContainer = quadrant.querySelector('.video-container');
                
                if (logContainer) logContainer.style.width = '30%';
                if (videoContainer) videoContainer.style.width = '70%';
            });
            
            // Se estava em fullscreen por inatividade e saiu manualmente, limpe também essa marcação
            if (element.classList.contains(Config.classes.inactivityFullscreen)) {
                element.classList.remove(Config.classes.inactivityFullscreen);
                
                // Extrair o ID do quadrante
                const quadranteId = parseInt(element.id.replace('quadrant', ''));
                
                // Limpar alerta de inatividade para este quadrante
                AlertSystem.clearAlert(quadranteId);
            }
        } else {
            // Entrar no modo fullscreen
            element.classList.add(Config.classes.fullscreen);
            grid.classList.add(Config.classes.hasFullscreen);
            
            // Esconder os outros quadrantes
            const allQuadrants = document.querySelectorAll('.stream-container');
            allQuadrants.forEach(quadrant => {
                if (quadrant !== element) {
                    quadrant.style.display = 'none';
                }
            });
        }
    }
    
    /**
     * Alterna o modo de tela cheia para o documento
     */
    toggleDocumentFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                Logger.log('error', `Erro ao ativar modo tela cheia: ${err.message}`);
            });
            this.elements.fullscreenBtn.textContent = '[ ] Sair da Tela Cheia';
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                this.elements.fullscreenBtn.textContent = '[ ] Tela Cheia';
            }
        }
    }
    
    /**
     * Desativa controles de vídeo em todos os players
     */
    disableVideoControls() {
        const allVideos = document.querySelectorAll('video');
        allVideos.forEach(video => {
            video.controls = false;
        });
    }
    
    /**
     * Limpa todos os logs
     */
    clearAllLogs() {
        for (let i = 1; i <= Config.quadrantCount; i++) {
            Logger.clearQuadrantLog(i);
        }
    }
    
    /**
     * Atualiza o status do servidor na interface
     * @param {string} status - Texto de status
     * @param {boolean} isConnected - Se está conectado
     */
    updateServerStatus(status, isConnected) {
        if (this.elements.serverStatus) {
            this.elements.serverStatus.textContent = status;
            
            if (isConnected) {
                this.elements.serverStatus.classList.add(Config.classes.connected);
            } else {
                this.elements.serverStatus.classList.remove(Config.classes.connected);
            }
        }
    }
    
    /**
     * Obtém o valor do campo de endereço do servidor
     * @returns {string} Valor do campo
     */
    getServerAddress() {
        return this.elements.serverAddress ? this.elements.serverAddress.value : '';
    }
    
    /**
     * Obtém o valor de um campo de URL RTSP
     * @param {number} id - ID do quadrante
     * @returns {string} URL RTSP
     */
    getRtspUrl(id) {
        const element = document.getElementById(`rtspUrl${id}`);
        return element ? element.value : '';
    }
    
    /**
     * Obtém o valor de um campo de IP do PDV
     * @param {number} id - ID do quadrante
     * @returns {string} Endereço IP do PDV
     */
    getPdvIp(id) {
        const element = document.getElementById(`pdvIp${id}`);
        return element ? element.value : '';
    }
    
    /**
     * Atualiza o status de um quadrante específico
     * @param {number} id - ID do quadrante
     * @param {string} status - Texto de status
     */
    updateQuadrantStatus(id, status) {
        if (this.statusElements[id]) {
            this.statusElements[id].textContent = status;
        }
    }
    
    /**
     * Configura um elemento de log para o formato adequado
     * @param {HTMLElement} logContainer - Container do log
     * @returns {HTMLElement} Elemento de conteúdo do log
     */
    setupLogContent(logContainer) {
        if (!logContainer) return null;
        
        // Procura pelo elemento .log-content existente
        let logContent = logContainer.querySelector(`.${Config.classes.logContent}`);
        
        // Se não existir, cria um novo
        if (!logContent) {
            logContent = document.createElement('div');
            logContent.className = Config.classes.logContent;
            // Move o conteúdo existente para o novo elemento
            logContent.textContent = logContainer.textContent;
            // Limpa o container original e adiciona o novo elemento
            logContainer.textContent = '';
            logContainer.appendChild(logContent);
        }
        
        return logContent;
    }
}

// Exporta uma instância única da UI
export default new UI();
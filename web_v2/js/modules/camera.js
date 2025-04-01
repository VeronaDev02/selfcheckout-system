/**
 * camera.js - Gerenciamento de conexões de câmeras RTSP
 * Gerencia a conexão e comunicação com as câmeras RTSP via WebRTC
 */

import Config from '../config.js';
import Logger from '../utils/logger.js';
import UI from './ui.js';
import ConnectionManager from './connection.js';

class CameraManager {
    constructor() {
        // Armazena as conexões WebSocket para RTSP
        this.rtspWebsockets = {};
        
        // Armazena as conexões WebRTC
        this.peerConnections = {};
        
        // Escuta por eventos de conectar câmera
        document.addEventListener('camera:connect', this.handleConnectEvent.bind(this));
    }
    
    /**
     * Trata evento de conexão de câmera
     * @param {CustomEvent} event - Evento personalizado com ID da câmera
     */
    handleConnectEvent(event) {
        const id = event.detail.id;
        this.connectCamera(id);
    }
    
    /**
     * Conecta a uma câmera RTSP
     * @param {number} id - ID do quadrante/câmera
     */
    async connectCamera(id) {
        // Verifica se o servidor está conectado
        if (!ConnectionManager.isServerConnected()) {
            alert('Conecte-se ao servidor primeiro!');
            return;
        }
        
        const rtspUrl = UI.getRtspUrl(id);
        const videoElement = document.getElementById(`remoteVideo${id}`);
        
        if (!rtspUrl || !videoElement) {
            Logger.log('error', `Dados inválidos para conectar câmera ${id}`);
            return;
        }
        
        // Fecha conexão existente, se houver
        this.closeCamera(id);
        
        // Atualiza interface
        UI.updateQuadrantStatus(id, 'Conectando câmera...');
        
        try {
            // Cria nova conexão WebSocket para RTSP
            const serverAddress = UI.getServerAddress();
            const wsUrl = `ws://${serverAddress}`;
            
            this.rtspWebsockets[id] = new WebSocket(wsUrl);
            
            this.rtspWebsockets[id].onopen = async () => {
                Logger.log('info', `WebSocket ${id} conectado. Enviando URL RTSP:`, rtspUrl);
                this.rtspWebsockets[id].send(rtspUrl);
            };
            
            this.rtspWebsockets[id].onmessage = async (event) => {
                try {
                    const message = JSON.parse(event.data);
                    
                    // Verifica se a mensagem contém sdp (oferta SDP)
                    if (message.sdp && message.type === 'offer') {
                        await this.handleOffer(id, message, videoElement);
                        UI.updateQuadrantStatus(id, `Conectado - Câmera ${id}`);
                    } else {
                        Logger.log('info', `Câmera ${id} recebeu mensagem:`, message);
                    }
                } catch (error) {
                    Logger.log('error', `Erro ao processar mensagem na câmera ${id}:`, error);
                    UI.updateQuadrantStatus(id, 'Erro');
                }
            };
            
            this.rtspWebsockets[id].onclose = () => {
                Logger.log('info', `WebSocket ${id} fechado`);
                UI.updateQuadrantStatus(id, 'Desconectado');
            };
            
            this.rtspWebsockets[id].onerror = (error) => {
                Logger.log('error', `Erro no WebSocket ${id}:`, error);
                UI.updateQuadrantStatus(id, 'Erro');
            };
        } catch (error) {
            Logger.log('error', `Erro ao conectar à câmera ${id}:`, error);
            UI.updateQuadrantStatus(id, 'Erro');
        }
    }
    
    /**
     * Processa a oferta SDP do servidor para estabelecer conexão WebRTC
     * @param {number} id - ID da câmera/quadrante
     * @param {object} offer - Oferta SDP recebida
     * @param {HTMLVideoElement} videoElement - Elemento de vídeo para exibir o stream
     */
    async handleOffer(id, offer, videoElement) {
        try {
            // Fecha conexão existente, se houver
            if (this.peerConnections[id]) {
                this.peerConnections[id].close();
            }
            
            // Cria uma nova conexão RTCPeerConnection
            this.peerConnections[id] = new RTCPeerConnection(Config.iceServers);
            
            // Configura os handlers de eventos
            this.peerConnections[id].ontrack = (event) => {
                if (event.track.kind === 'video') {
                    videoElement.srcObject = event.streams[0];
                    Logger.log('info', `Câmera ${id}: Stream de vídeo conectado`);
                }
            };
            
            this.peerConnections[id].onicecandidate = (event) => {
                if (event.candidate === null) {
                    // ICE gathering completed, envia a resposta final
                    this.sendAnswer(id);
                }
            };
            
            this.peerConnections[id].oniceconnectionstatechange = () => {
                const state = this.peerConnections[id].iceConnectionState;
                Logger.log('info', `ICE connection state para câmera ${id}:`, state);
                
                // Atualiza status na interface com base no estado da conexão ICE
                if (state === 'connected' || state === 'completed') {
                    UI.updateQuadrantStatus(id, `Conectado - Câmera ${id}`);
                } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                    UI.updateQuadrantStatus(id, `Câmera ${id}: ${state}`);
                }
            };
            
            Logger.log('info', `Processando oferta SDP para câmera ${id}`);
            
            // Verifica se a oferta SDP está correta
            if (!offer.sdp) {
                throw new Error('Oferta SDP não contém o campo sdp');
            }
            
            // Define a oferta remota
            await this.peerConnections[id].setRemoteDescription({
                type: offer.type,
                sdp: offer.sdp
            });
            
            // Cria a resposta
            const answer = await this.peerConnections[id].createAnswer();
            await this.peerConnections[id].setLocalDescription(answer);
            
            Logger.log('info', `Resposta SDP para câmera ${id} criada com sucesso`);
        } catch (error) {
            Logger.log('error', `Erro ao processar oferta para câmera ${id}:`, error);
            UI.updateQuadrantStatus(id, 'Erro WebRTC');
        }
    }
    
    /**
     * Envia a resposta SDP para o servidor
     * @param {number} id - ID da câmera/quadrante
     */
    sendAnswer(id) {
        try {
            if (this.peerConnections[id] && 
                this.peerConnections[id].localDescription &&
                this.rtspWebsockets[id]) {
                
                const answer = {
                    type: this.peerConnections[id].localDescription.type,
                    sdp: this.peerConnections[id].localDescription.sdp
                };
                
                this.rtspWebsockets[id].send(JSON.stringify(answer));
                Logger.log('info', `Resposta SDP enviada para câmera ${id}`);
            }
        } catch (error) {
            Logger.log('error', `Erro ao enviar resposta para câmera ${id}:`, error);
        }
    }
    
    /**
     * Fecha uma conexão de câmera específica
     * @param {number} id - ID da câmera/quadrante
     */
    closeCamera(id) {
        // Fecha a conexão WebSocket RTSP
        if (this.rtspWebsockets[id]) {
            this.rtspWebsockets[id].close();
            delete this.rtspWebsockets[id];
        }
        
        // Fecha a conexão WebRTC
        if (this.peerConnections[id]) {
            this.peerConnections[id].close();
            delete this.peerConnections[id];
        }
        
        Logger.log('info', `Fechada conexão da câmera ${id}`);
    }
    
    /**
     * Limpa todas as conexões de câmeras
     */
    cleanup() {
        // Fecha todas as conexões WebSocket RTSP
        Object.keys(this.rtspWebsockets).forEach(id => {
            if (this.rtspWebsockets[id]) {
                this.rtspWebsockets[id].close();
                delete this.rtspWebsockets[id];
            }
        });
        
        // Fecha todas as conexões WebRTC
        Object.keys(this.peerConnections).forEach(id => {
            if (this.peerConnections[id]) {
                this.peerConnections[id].close();
                delete this.peerConnections[id];
            }
        });
        
        Logger.log('info', 'Todas as conexões de câmeras foram encerradas');
    }
}

// Exporta uma instância única do gerenciador de câmeras
export default new CameraManager();
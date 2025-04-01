// Variáveis globais para controle de estado
let rtspWebsockets = {}; // Armazena as conexões WebSocket para RTSP
let pdvWebsockets = {}; // Armazena as conexões WebSocket para PDVs
let peerConnections = {}; // Armazena as conexões WebRTC
let serverConnection = null; // Conexão com o servidor PDV
let isConnectedToServer = false;

// Fila de alertas de inatividade por quadrante
let inactivityAlerts = {
    queue: [], // Fila de alertas pendentes
    active: {} // Alertas atualmente ativos por quadrante
};

// Configurações de ICE para WebRTC
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Função para conectar ao servidor
function connectToServer() {
    const serverAddress = document.getElementById('serverAddress').value;
    const serverStatus = document.getElementById('serverStatus');
    
    // Verifica se já está conectado
    if (isConnectedToServer) {
        console.log('Já conectado ao servidor');
        return;
    }
    
    // Atualiza interface
    serverStatus.textContent = 'Conectando...';
    
    // Configura a conexão principal do servidor para PDVs
    try {
        const pdvServerUrl = `ws://${serverAddress.replace(':8080', ':8765')}`;
        serverConnection = new WebSocket(pdvServerUrl);
        
        serverConnection.onopen = () => {
            console.log('Conectado ao servidor PDV');
            serverStatus.textContent = 'Conectado';
            serverStatus.classList.add('connected');
            isConnectedToServer = true;
        };
        
        serverConnection.onclose = () => {
            console.log('Desconectado do servidor PDV');
            serverStatus.textContent = 'Desconectado';
            serverStatus.classList.remove('connected');
            isConnectedToServer = false;
        };
        
        serverConnection.onerror = (error) => {
            console.error('Erro na conexão com o servidor PDV:', error);
            serverStatus.textContent = 'Erro na conexão';
            serverStatus.classList.remove('connected');
            isConnectedToServer = false;
        };
    } catch (error) {
        console.error('Falha ao conectar ao servidor:', error);
        serverStatus.textContent = 'Falha na conexão';
        serverStatus.classList.remove('connected');
    }
}

// Função para desconectar do servidor
function disconnectFromServer() {
    // Fecha todas as conexões
    if (serverConnection) {
        serverConnection.close();
        serverConnection = null;
    }
    
    // Fecha todas as conexões WebRTC
    Object.keys(peerConnections).forEach(id => {
        if (peerConnections[id]) {
            peerConnections[id].close();
            peerConnections[id] = null;
        }
    });
    
    // Fecha todas as conexões WebSocket RTSP
    Object.keys(rtspWebsockets).forEach(id => {
        if (rtspWebsockets[id]) {
            rtspWebsockets[id].close();
            rtspWebsockets[id] = null;
        }
    });
    
    // Fecha todas as conexões WebSocket PDV
    Object.keys(pdvWebsockets).forEach(id => {
        if (pdvWebsockets[id]) {
            pdvWebsockets[id].close();
            pdvWebsockets[id] = null;
        }
    });
    
    // Atualiza a interface
    document.getElementById('serverStatus').textContent = 'Desconectado';
    document.getElementById('serverStatus').classList.remove('connected');
    
    // Atualiza o status de cada quadrante
    for (let i = 1; i <= 4; i++) {
        document.getElementById(`status${i}`).textContent = 'Desconectado';
    }
    
    // Limpa os logs
    for (let i = 1; i <= 4; i++) {
        document.getElementById(`log${i}`).textContent = '';
    }
    
    // Limpa alertas de inatividade
    clearAllInactivityAlerts();
    
    isConnectedToServer = false;
}

// Função para conectar à câmera RTSP
async function connectCamera(id) {
    if (!isConnectedToServer) {
        alert('Conecte-se ao servidor primeiro!');
        return;
    }
    
    const rtspUrl = document.getElementById(`rtspUrl${id}`).value;
    const videoElement = document.getElementById(`remoteVideo${id}`);
    const statusElement = document.getElementById(`status${id}`);
    
    // Fecha conexão existente, se houver
    if (rtspWebsockets[id]) {
        rtspWebsockets[id].close();
    }
    if (peerConnections[id]) {
        peerConnections[id].close();
    }
    
    // Atualiza interface
    statusElement.textContent = 'Conectando câmera...';
    
    try {
        // Cria nova conexão WebSocket para RTSP
        const serverAddress = document.getElementById('serverAddress').value;
        const wsUrl = `ws://${serverAddress}`;
        
        rtspWebsockets[id] = new WebSocket(wsUrl);
        
        rtspWebsockets[id].onopen = async () => {
            console.log(`WebSocket ${id} conectado. Enviando URL RTSP:`, rtspUrl);
            rtspWebsockets[id].send(rtspUrl);
        };
        
        rtspWebsockets[id].onmessage = async (event) => {
            try {
                const message = JSON.parse(event.data);
                
                // Verifica se a mensagem contém sdp (oferta SDP)
                if (message.sdp && message.type === 'offer') {
                    await handleOffer(id, message, videoElement);
                    statusElement.textContent = `Conectado - Câmera ${id}`;
                } else {
                    console.log(`Câmera ${id} recebeu mensagem:`, message);
                }
            } catch (error) {
                console.error(`Erro ao processar mensagem na câmera ${id}:`, error);
                statusElement.textContent = 'Erro';
            }
        };
        
        rtspWebsockets[id].onclose = () => {
            console.log(`WebSocket ${id} fechado`);
            statusElement.textContent = 'Desconectado';
        };
        
        rtspWebsockets[id].onerror = (error) => {
            console.error(`Erro no WebSocket ${id}:`, error);
            statusElement.textContent = 'Erro';
        };
    } catch (error) {
        console.error(`Erro ao conectar à câmera ${id}:`, error);
        statusElement.textContent = 'Erro';
    }
}

// Mantenha um mapeamento de quais quadrantes estão conectados a quais PDVs
let pdvMapping = {};

// Mapeamento reverso de IPs para quadrantes
let ipToQuadrant = {};

// Função para conectar ao PDV
function connectPDV(id) {
    if (!isConnectedToServer || !serverConnection) {
        alert('Conecte-se ao servidor primeiro!');
        return;
    }
    
    const pdvIp = document.getElementById(`pdvIp${id}`).value;
    const logContainer = document.getElementById(`log${id}`);
    const statusElement = document.getElementById(`status${id}`);
    
    // Verifica se o IP é válido
    if (!pdvIp) {
        alert('Digite um IP de PDV válido');
        return;
    }
    
    // Configura o elemento de conteúdo interno para o log, se ainda não existir
    let logContent = logContainer.querySelector('.log-content');
    if (!logContent) {
        logContent = document.createElement('div');
        logContent.className = 'log-content';
        // Move o conteúdo existente para o novo elemento
        logContent.textContent = logContainer.textContent;
        // Limpa o container original e adiciona o novo elemento
        logContainer.textContent = '';
        logContainer.appendChild(logContent);
    } else {
        // Limpa o log ao reconectar
        logContent.textContent = '';
    }
    
    // Remove alertas de inatividade antigos se existirem
    clearInactivityAlert(id);
    
    // Registra o mapeamento deste quadrante para este IP de PDV
    pdvMapping[pdvIp] = id;
    ipToQuadrant[id] = pdvIp; // Mapeamento reverso
    
    // Envia comando de registro para o PDV
    try {
        const registerCommand = {
            command: "register",
            pdv_ip: pdvIp
        };
        
        console.log(`Enviando registro para PDV ${pdvIp}:`, registerCommand);
        serverConnection.send(JSON.stringify(registerCommand));
        
        // Configura o handler de mensagens centralizadas
        setupMessageHandler();
        
        // Adiciona mensagem de log inicial
        statusElement.textContent = 'Conectando PDV...';
        const lastTwoDigits = pdvIp.split('.').pop().padStart(3, '0').slice(-2);
        logContent.textContent += `[INFO] Conectando ao PDV ${lastTwoDigits}...\n`;
        
    } catch (error) {
        console.error(`Erro ao conectar ao PDV ${id}:`, error);
        logContent.textContent += '[ERRO] Falha na conexão com o PDV\n';
        statusElement.textContent = 'Erro PDV';
    }
}

// Handler centralizado para mensagens do servidor PDV
function setupMessageHandler() {
    if (!serverConnection) return;
    
    // Primeiro, garanto que cada log-container tenha um elemento interno para o conteúdo
    for (let i = 1; i <= 4; i++) {
        const logContainer = document.getElementById(`log${i}`);
        // Verifica se já existe um elemento interno para o conteúdo
        if (!logContainer.querySelector('.log-content')) {
            // Cria um elemento div para conter o conteúdo do log
            const logContent = document.createElement('div');
            logContent.className = 'log-content';
            // Move o conteúdo existente para o novo elemento
            logContent.textContent = logContainer.textContent;
            // Limpa o container original e adiciona o novo elemento
            logContainer.textContent = '';
            logContainer.appendChild(logContent);
        }
    }
    
    // Remove handler anterior, se existir
    if (serverConnection.onmessage) {
        serverConnection._oldOnMessage = serverConnection.onmessage;
    }
    
    // Configura o novo handler
    serverConnection.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log("Mensagem recebida do servidor:", message);
            
            // Se for uma resposta de registro, processa
            if (message.type === 'register_response') {
                const pdvIp = message.pdv_ip;
                const quadranteId = pdvMapping[pdvIp];
                
                if (quadranteId) {
                    const logContainer = document.getElementById(`log${quadranteId}`);
                    const logContent = logContainer.querySelector('.log-content') || logContainer;
                    const statusElement = document.getElementById(`status${quadranteId}`);
                    
                    if (message.success) {
                        const lastTwoDigits = pdvIp.split('.').pop().padStart(3, '0').slice(-2);
                        console.log(`Registrado com sucesso para o PDV ${lastTwoDigits}`);
                        statusElement.textContent = `Conectado - PDV ${lastTwoDigits}`;
                        logContent.textContent += `[INFO] Registrado no PDV ${lastTwoDigits}\n`;
                    } else {
                        console.log(`Falha ao registrar para o PDV ${pdvIp}`);
                        statusElement.textContent = 'Falha - PDV';
                        logContent.textContent += `[ERRO] Falha ao registrar no PDV ${pdvIp}\n`;
                    }
                }
            }
            // Se for dados do PDV, exibe no log do quadrante correspondente
            else if (message.type === 'pdv_data') {
                const pdvIp = message.pdv_ip;
                const quadranteId = pdvMapping[pdvIp];
                
                if (quadranteId) {
                    const logContainer = document.getElementById(`log${quadranteId}`);
                    const logContent = logContainer.querySelector('.log-content') || logContainer;
                    
                    // Formata a data/hora atual
                    const now = new Date();
                    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                    
                    // Adiciona a mensagem ao log
                    logContent.textContent += `[${timestamp}] ${message.data}\n`;
                    
                    // Mantém o scroll no final do log
                    logContent.scrollTop = logContent.scrollHeight;
                    
                    console.log(`Mensagem do PDV ${pdvIp} exibida no quadrante ${quadranteId}`);
                } else {
                    console.warn(`Recebida mensagem do PDV ${pdvIp}, mas não há quadrante associado`);
                }
            }
            // Se for alerta de inatividade do PDV
            else if (message.type === 'pdv_inativo_timeout') {
                const pdvIp = message.pdv_ip;
                const quadranteId = pdvMapping[pdvIp];
                
                if (quadranteId) {
                    // Adiciona o alerta à fila
                    addInactivityAlert(quadranteId, pdvIp, message.inactive_time);
                    
                    // Adiciona mensagem ao log
                    const logContainer = document.getElementById(`log${quadranteId}`);
                    const logContent = logContainer.querySelector('.log-content') || logContainer;
                    
                    // Formata a data/hora atual
                    const now = new Date();
                    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                    
                    const lastTwoDigits = pdvIp.split('.').pop().padStart(3, '0').slice(-2);
                    
                    // Adiciona a mensagem ao log
                    logContent.textContent += `[${timestamp}] [ALERTA] PDV ${lastTwoDigits} inativo por ${message.inactive_time} segundos!\n`;
                    
                    // Mantém o scroll no final do log
                    logContent.scrollTop = logContent.scrollHeight;
                    
                    console.log(`Alerta de inatividade do PDV ${pdvIp} no quadrante ${quadranteId} por ${message.inactive_time} segundos`);
                }
            }
        } catch (error) {
            console.error('Erro ao processar mensagem do PDV:', error);
        }
    };
}

// Adiciona um novo alerta de inatividade à fila
function addInactivityAlert(quadranteId, pdvIp, inactiveTime) {
    // Se já existe um alerta para este quadrante, não faça nada
    if (inactivityAlerts.active[quadranteId]) {
        console.log(`Alerta já ativo para o quadrante ${quadranteId}`);
        return;
    }
    
    // Cria o objeto de alerta
    const alert = {
        quadranteId,
        pdvIp,
        inactiveTime
    };
    
    // Adiciona à fila
    inactivityAlerts.queue.push(alert);
    
    // Se não há alertas ativos neste quadrante, inicia o alerta
    if (!inactivityAlerts.active[quadranteId]) {
        processNextAlert();
    }
}

// Processa o próximo alerta na fila
function processNextAlert() {
    // Se não há alertas na fila, não faz nada
    if (inactivityAlerts.queue.length === 0) {
        return;
    }
    
    // Verifica se algum quadrante já está em fullscreen devido a um alerta de inatividade
    const hasFullscreenAlert = Object.values(inactivityAlerts.active).some(alert => {
        const quadrantElement = document.getElementById(`quadrant${alert.quadranteId}`);
        return quadrantElement && quadrantElement.classList.contains('fullscreen') && 
               quadrantElement.classList.contains('inactivity-fullscreen');
    });
    
    // Se já tenho um quadrante em fullscreen devido a inatividade, não mostra outro em fullscreen
    if (hasFullscreenAlert) {
        // Mesmo assim processa o alerta visual sem fullscreen
        const alert = inactivityAlerts.queue.shift();
        showInactivityAlert(alert, false); // Passa false para não exibir em fullscreen
        return;
    }
    
    // Pega o próximo alerta da fila
    const alert = inactivityAlerts.queue.shift();
    
    // Mostra o alerta com fullscreen
    showInactivityAlert(alert, true); // Passa true para exibir em fullscreen
}

// Função para exibir alerta de inatividade (com ou sem fullscreen)
function showInactivityAlert(alert, showFullscreen) {
    // Marca como ativo
    inactivityAlerts.active[alert.quadranteId] = alert;
    
    const quadrantElement = document.getElementById(`quadrant${alert.quadranteId}`);
    const logContainer = document.getElementById(`log${alert.quadranteId}`);
    
    if (quadrantElement && logContainer) {
        // Adiciona a classe de alerta
        logContainer.classList.add('inactivity-alert');
        
        // Adiciona ou atualiza um elemento de notificação
        let notificationElement = logContainer.querySelector('.pdv-notification');
        if (!notificationElement) {
            notificationElement = document.createElement('div');
            notificationElement.className = 'pdv-notification';
            logContainer.appendChild(notificationElement);
        }
        
        const lastTwoDigits = alert.pdvIp.split('.').pop().padStart(3, '0').slice(-2);
        notificationElement.textContent = `PDV ${lastTwoDigits} inativo por ${alert.inactiveTime}s`;
        notificationElement.style.display = 'block';
        
        console.log(`Iniciado alerta visual para quadrante ${alert.quadranteId}`);
        
        // Se devo exibir em fullscreen e não está já em fullscreen
        if (showFullscreen && !quadrantElement.classList.contains('fullscreen')) {
            // Marca com uma classe adicional para sabermos que foi colocado em fullscreen por causa de inatividade
            quadrantElement.classList.add('inactivity-fullscreen');
            // Usa a função existente para ativar o fullscreen
            toggleQuadrantFullscreen(quadrantElement);
            console.log(`Quadrante ${alert.quadranteId} colocado em fullscreen automático devido à inatividade`);
        }
    }
}

// Limpa o alerta de inatividade de um quadrante específico
function clearInactivityAlert(quadranteId) {
    const wasActive = inactivityAlerts.active[quadranteId];
    
    // Remove da lista de alertas ativos
    if (wasActive) {
        delete inactivityAlerts.active[quadranteId];
        
        // Remove classes visuais
        const logContainer = document.getElementById(`log${quadranteId}`);
        const quadrantElement = document.getElementById(`quadrant${quadranteId}`);
        
        if (logContainer) {
            logContainer.classList.remove('inactivity-alert');
            
            // Remove a notificação
            const notification = logContainer.querySelector('.pdv-notification');
            if (notification) {
                notification.style.display = 'none';
            }
        }
        
        // Se este quadrante estava em fullscreen devido à inatividade, remova o fullscreen
        if (quadrantElement && quadrantElement.classList.contains('inactivity-fullscreen')) {
            // Remove a marca de fullscreen por inatividade
            quadrantElement.classList.remove('inactivity-fullscreen');
            
            // Se estiver em fullscreen, remove o fullscreen
            if (quadrantElement.classList.contains('fullscreen')) {
                toggleQuadrantFullscreen(quadrantElement);
                console.log(`Removido fullscreen automático do quadrante ${quadranteId}`);
            }
        }
        
        console.log(`Removido alerta visual do quadrante ${quadranteId}`);
        
        // Processa o próximo alerta na fila
        processNextAlert();
    }
    
    // Remove quaisquer alertas pendentes deste quadrante da fila
    inactivityAlerts.queue = inactivityAlerts.queue.filter(
        alert => alert.quadranteId !== quadranteId
    );
}

// Limpa todos os alertas de inatividade
function clearAllInactivityAlerts() {
    // Remove todos os alertas ativos
    Object.keys(inactivityAlerts.active).forEach(quadranteId => {
        clearInactivityAlert(quadranteId);
    });
    
    // Limpa a fila
    inactivityAlerts.queue = [];
    
    // Remove classes visuais de todos os quadrantes
    for (let i = 1; i <= 4; i++) {
        const logContainer = document.getElementById(`log${i}`);
        const quadrantElement = document.getElementById(`quadrant${i}`);
        
        if (logContainer) {
            logContainer.classList.remove('inactivity-alert');
            
            // Remove a notificação
            const notification = logContainer.querySelector('.pdv-notification');
            if (notification) {
                notification.style.display = 'none';
            }
        }
        
        // Remove a classe de fullscreen por inatividade e o fullscreen se necessário
        if (quadrantElement && quadrantElement.classList.contains('inactivity-fullscreen')) {
            quadrantElement.classList.remove('inactivity-fullscreen');
            if (quadrantElement.classList.contains('fullscreen')) {
                toggleQuadrantFullscreen(quadrantElement);
            }
        }
    }
}

// Função para lidar com a oferta SDP do servidor
async function handleOffer(id, offer, videoElement) {
    try {
        // Fecha conexão existente, se houver
        if (peerConnections[id]) {
            peerConnections[id].close();
        }
        
        // Cria uma nova conexão RTCPeerConnection
        peerConnections[id] = new RTCPeerConnection(iceServers);
        
        // Configura os handlers de eventos
        peerConnections[id].ontrack = (event) => {
            if (event.track.kind === 'video') {
                videoElement.srcObject = event.streams[0];
                console.log(`Câmera ${id}: Stream de vídeo conectado`);
            }
        };
        
        peerConnections[id].onicecandidate = (event) => {
            if (event.candidate === null) {
                // ICE gathering completed, envia a resposta final
                sendAnswer(id);
            }
        };
        
        peerConnections[id].oniceconnectionstatechange = () => {
            const state = peerConnections[id].iceConnectionState;
            console.log(`ICE connection state para câmera ${id}:`, state);
            
            // Atualiza status na interface
            const statusElement = document.getElementById(`status${id}`);
            
            // Busca o IP do PDV associado a este quadrante
            const associatedPdvIp = Object.keys(pdvMapping).find(ip => pdvMapping[ip] == id);
            
            if (associatedPdvIp) {
                // Extrai os últimos dois dígitos do IP do PDV
                const lastTwoDigits = associatedPdvIp.split('.').pop().padStart(3, '0').slice(-2);
                
                if (state === 'connected' || state === 'completed') {
                    statusElement.textContent = `Conectado - PDV ${lastTwoDigits}`;
                } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                    statusElement.textContent = `PDV ${lastTwoDigits}: ${state}`;
                }
            } else {
                // Fallback caso não encontre o PDV associado
                if (state === 'connected' || state === 'completed') {
                    statusElement.textContent = 'Conectado';
                } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                    statusElement.textContent = state;
                }
            }
        };
        
        console.log(`Processando oferta SDP para câmera ${id}:`, offer);
        
        // Verifica se a oferta SDP está correta
        if (!offer.sdp) {
            throw new Error('Oferta SDP não contém o campo sdp');
        }
        
        // Tenta corrigir problemas comuns na oferta SDP
        let sdp = offer.sdp;
        
        // Define a oferta remota
        await peerConnections[id].setRemoteDescription({
            type: offer.type,
            sdp: sdp
        });
        
        // Cria a resposta
        const answer = await peerConnections[id].createAnswer();
        await peerConnections[id].setLocalDescription(answer);
        
        console.log(`Resposta SDP para câmera ${id} criada com sucesso`);
    } catch (error) {
        console.error(`Erro ao processar oferta para câmera ${id}:`, error);
        const statusElement = document.getElementById(`status${id}`);
        statusElement.textContent = 'Erro WebRTC';
    }
}

// Função para enviar a resposta SDP para o servidor
function sendAnswer(id) {
    try {
        if (peerConnections[id] && peerConnections[id].localDescription) {
            const answer = {
                type: peerConnections[id].localDescription.type,
                sdp: peerConnections[id].localDescription.sdp
            };
            
            rtspWebsockets[id].send(JSON.stringify(answer));
        }
    } catch (error) {
        console.error(`Erro ao enviar resposta para câmera ${id}:`, error);
    }
}

// Function to toggle fullscreen on a quadrant
function toggleQuadrantFullscreen(element) {
    const grid = document.getElementById('mainGrid');
    
    if (element.classList.contains('fullscreen')) {
        // Exit fullscreen
        element.classList.remove('fullscreen');
        grid.classList.remove('has-fullscreen');
        
        // Show all quadrants
        const allQuadrants = document.querySelectorAll('.stream-container');
        allQuadrants.forEach(quadrant => {
            quadrant.style.display = 'flex';
            
            // Reset the layout to default (log left, video right)
            const logContainer = quadrant.querySelector('.log-container');
            const videoContainer = quadrant.querySelector('.video-container');
            
            if (logContainer) logContainer.style.width = '30%';
            if (videoContainer) videoContainer.style.width = '70%';
        });
        
        // Se estava em fullscreen por inatividade e saiu do fullscreen manualmente,
        // remova também a classe de inatividade-fullscreen
        if (element.classList.contains('inactivity-fullscreen')) {
            element.classList.remove('inactivity-fullscreen');
            
            // Extrair o ID do quadrante a partir do ID do elemento
            const quadranteId = element.id.replace('quadrant', '');
            
            // Limpar alerta de inatividade para este quadrante também
            clearInactivityAlert(quadranteId);
        }
    } else {
        // Enter fullscreen
        element.classList.add('fullscreen');
        grid.classList.add('has-fullscreen');
        
        // Hide all other quadrants
        const allQuadrants = document.querySelectorAll('.stream-container');
        allQuadrants.forEach(quadrant => {
            if (quadrant !== element) {
                quadrant.style.display = 'none';
            }
        });
    }
}

// Inicializa a interface
document.addEventListener('DOMContentLoaded', () => {
    // Limpa todos os logs
    for (let i = 1; i <= 4; i++) {
        document.getElementById(`log${i}`).textContent = '';
    }
    
    // Adiciona event listeners de duplo clique para todos os quadrantes
    for (let i = 1; i <= 4; i++) {
        const quadrant = document.getElementById(`quadrant${i}`);
        if (quadrant) {
            quadrant.addEventListener('dblclick', function() {
                // Limpa qualquer alerta de inatividade neste quadrante
                clearInactivityAlert(i);
                
                // Ativa/desativa modo tela cheia
                toggleQuadrantFullscreen(this);
            });
        }
    }
    
    // Handle document fullscreen
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', function() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.error(`Error attempting to enable fullscreen: ${err.message}`);
                });
                this.textContent = '[ ] Sair da Tela Cheia';
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                    this.textContent = '[ ] Tela Cheia';
                }
            }
        });
    }

    // Toggle - controle do server
    const toggleServerBtn = document.getElementById('toggleServerControls');
    if (toggleServerBtn) {
        toggleServerBtn.addEventListener('click', function() {
            const panel = document.getElementById('serverControlsPanel');
            panel.classList.toggle('visible');
            this.textContent = panel.classList.contains('visible') ? '↓ Servidor' : '↑ Servidor';
        });
    }
    
    // Toggle - controle de conexão
    const toggleConnectionBtn = document.getElementById('toggleConnectionControls');
    if (toggleConnectionBtn) {
        toggleConnectionBtn.addEventListener('click', function() {
            const connectionPanel = document.getElementById('connectionControlsPanel');
            connectionPanel.classList.toggle('visible');
            this.textContent = connectionPanel.classList.contains('visible') ? '↑ Ocultar Controles' : '↓ Mostrar Controles';
        });
    }

    // Escuta a tecla para sair do quadrante fullscreen
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const fullscreenQuadrant = document.querySelector('.stream-container.fullscreen');
            if (fullscreenQuadrant) {
                toggleQuadrantFullscreen(fullscreenQuadrant);
            }
        }
    });

    // Tenha certeza de que os vídeos não têm controles padrão
    const allVideos = document.querySelectorAll('video');
    allVideos.forEach(video => {
        video.controls = false;
    });

    // Adiciona listener para a tecla Enter nos campos de entrada
    document.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            const target = event.target;
            
            // Se for campo de endereço do servidor
            if (target.id === 'serverAddress') {
                connectToServer();
            }
            // Se for campo de URL RTSP
            else if (target.id.startsWith('rtspUrl')) {
                const id = target.id.charAt(target.id.length - 1);
                connectCamera(id);
            }
            // Se for campo de IP do PDV
            else if (target.id.startsWith('pdvIp')) {
                const id = target.id.charAt(target.id.length - 1);
                connectPDV(id);
            }
        }
    });
});
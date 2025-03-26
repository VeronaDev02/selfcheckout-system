// Variáveis globais para controle de estado
let rtspWebsockets = {}; // Armazena as conexões WebSocket para RTSP
let pdvWebsockets = {}; // Armazena as conexões WebSocket para PDVs
let peerConnections = {}; // Armazena as conexões WebRTC
let serverConnection = null; // Conexão com o servidor PDV
let isConnectedToServer = false;

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
                    statusElement.textContent = 'Conectado - Câmera';
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

// Função para conectar ao PDV
function connectPDV(id) {
    if (!isConnectedToServer || !serverConnection) {
        alert('Conecte-se ao servidor primeiro!');
        return;
    }
    
    const pdvIp = document.getElementById(`pdvIp${id}`).value;
    const logElement = document.getElementById(`log${id}`);
    const statusElement = document.getElementById(`status${id}`);
    
    // Verifica se o IP é válido
    if (!pdvIp) {
        alert('Digite um IP de PDV válido');
        return;
    }
    
    // Limpa o log ao reconectar
    logElement.textContent = '';
    
    // Registra o mapeamento deste quadrante para este IP de PDV
    pdvMapping[pdvIp] = id;
    
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
        logElement.textContent += `[INFO] Conectando ao PDV ${pdvIp}...\n`;
        
    } catch (error) {
        console.error(`Erro ao conectar ao PDV ${id}:`, error);
        logElement.textContent += '[ERRO] Falha na conexão com o PDV\n';
        statusElement.textContent = 'Erro PDV';
    }
}

// Handler centralizado para mensagens do servidor PDV
function setupMessageHandler() {
    if (!serverConnection) return;
    
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
                    const logElement = document.getElementById(`log${quadranteId}`);
                    const statusElement = document.getElementById(`status${quadranteId}`);
                    
                    if (message.success) {
                        console.log(`Registrado com sucesso para o PDV ${pdvIp}`);
                        statusElement.textContent = 'Conectado - PDV';
                        logElement.textContent += `[INFO] Registrado no PDV ${pdvIp}\n`;
                    } else {
                        console.log(`Falha ao registrar para o PDV ${pdvIp}`);
                        statusElement.textContent = 'Falha - PDV';
                        logElement.textContent += `[ERRO] Falha ao registrar no PDV ${pdvIp}\n`;
                    }
                }
            }
            // Se for dados do PDV, exibe no log do quadrante correspondente
            else if (message.type === 'pdv_data') {
                const pdvIp = message.pdv_ip;
                const quadranteId = pdvMapping[pdvIp];
                
                if (quadranteId) {
                    const logElement = document.getElementById(`log${quadranteId}`);
                    
                    // Formata a data/hora atual
                    const now = new Date();
                    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                    
                    // Adiciona a mensagem ao log
                    logElement.textContent += `[${timestamp}] ${message.data}\n`;
                    
                    // Mantém o scroll no final do log
                    logElement.scrollTop = logElement.scrollHeight;
                    
                    console.log(`Mensagem do PDV ${pdvIp} exibida no quadrante ${quadranteId}`);
                } else {
                    console.warn(`Recebida mensagem do PDV ${pdvIp}, mas não há quadrante associado`);
                }
            }
        } catch (error) {
            console.error('Erro ao processar mensagem do PDV:', error);
        }
    };
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
            if (state === 'connected' || state === 'completed') {
                statusElement.textContent = 'Conectado - Câmera';
            } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                statusElement.textContent = `Câmera: ${state}`;
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

// Inicializa a interface
document.addEventListener('DOMContentLoaded', () => {
    // Limpa todos os logs
    for (let i = 1; i <= 4; i++) {
        document.getElementById(`log${i}`).textContent = '';
    }
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
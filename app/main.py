import argparse
import asyncio
import json
import logging
import socket
import time
import re
import websockets
from aiortc import RTCSessionDescription
from typing import Dict, Set
from webrtc_conversion import WebRTCConversion
from rtsp_connection import RTSPConnection
from message_processor import process_message
from pdv_transaction import PDVTransaction

# Dicionário dinâmico para armazenar os clientes WebSocket por IP do PDV
pdv_clients = {}

class UnifiedServer:
    def __init__(self, ws_port=8765, rtsp_ws_port=8080, udp_port=38800, pdv_timeout=180):

        self.ws_port = ws_port
        self.rtsp_ws_port = rtsp_ws_port
        self.udp_port = udp_port
        
        # Para o servidor WebRTC
        self.active_rtsp_connections = set()
        self.webrtc_conversions: Dict[str, WebRTCConversion] = {}
        
        # Rastrear quantos clientes estão usando cada URL RTSP
        self.rtsp_client_count: Dict[str, int] = {}

        # Monitor de transações do PDV
        self.pdv_monitor = PDVTransaction(timeout_seconds=pdv_timeout)
        
        # Configuração do DVR para redirecionamento
        self.dvr_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            
    def get_dvr_port_for_pdv(self, pdv_ip):
        """
        Calcula a porta do DVR com base no IP do PDV.
        A porta é 8 + os 3 últimos dígitos do IP do PDV.
        Ex: 192.168.101.131 -> porta 8131
        """
        try:
            # Extrai o último octeto do IP
            last_octet = pdv_ip.split('.')[-1]
            last_octet_padded = last_octet.zfill(3)
            port = int('8' + last_octet_padded[-3:])
            
            return port
        
        except Exception as e:
            print(f"Erro ao calcular porta do DVR para IP {pdv_ip}: {e}")
            return 8000  # Porta padrão em caso de erro
        
    async def register_pdv_client(self, websocket, pdv_ip):
        """Registra um cliente WebSocket para receber mensagens de um PDV específico"""
        # Cria o conjunto para o IP do PDV se ele não existir
        if pdv_ip not in pdv_clients:
            pdv_clients[pdv_ip] = set()
            
        pdv_clients[pdv_ip].add(websocket)
        print(f"Cliente registrado para o PDV {pdv_ip}")
        return True

    async def unregister_pdv_client(self, websocket):
        """Remove um cliente WebSocket quando a conexão é fechada"""
        for ip, clients in list(pdv_clients.items()):
            if websocket in clients:
                clients.remove(websocket)
                print(f"Cliente removido do PDV {ip}")
                # Remover o conjunto vazio para economizar memória
                if len(clients) == 0:
                    del pdv_clients[ip]
                    print(f"Conjunto de clientes para o PDV {ip} removido (vazio)")
                break

    # Handlers do WebSocket para PDV
    async def pdv_websocket_handler(self, websocket):
        """Manipula as conexões WebSocket para o serviço PDV"""
        try:
            async for message in websocket:
                data = json.loads(message)
                command = data.get("command")
                
                if command == "register":
                    pdv_ip = data.get("pdv_ip")
                    success = await self.register_pdv_client(websocket, pdv_ip)
                    
                    response = {
                        "type": "register_response",
                        "success": success,
                        "pdv_ip": pdv_ip
                    }
                    await websocket.send(json.dumps(response))
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            await self.unregister_pdv_client(websocket)

    # Handlers do WebSocket para RTSP/WebRTC
    async def register_rtsp_client(self, websocket):
        self.active_rtsp_connections.add(websocket)
        
    async def unregister_rtsp_client(self, websocket):
        """Remove um cliente WebRTC e libera recursos associados"""
        try:
            if websocket in self.active_rtsp_connections:
                self.active_rtsp_connections.remove(websocket)
                print("Cliente RTSP desconectado e removido da lista")
        except Exception as e:
            print(f"Erro ao remover cliente RTSP da lista: {e}")
        
    async def cleanup_conversion(self, conversion_key):
        """Remove a conversão WebRTC quando não estiver mais em uso"""
        if conversion_key in self.webrtc_conversions:
            try:
                conversion = self.webrtc_conversions[conversion_key]
                await conversion.close()
                del self.webrtc_conversions[conversion_key]
                print(f"Conversão WebRTC para {conversion_key} encerrada e removida")
            except Exception as e:
                print(f"Erro ao limpar conversão WebRTC para {conversion_key}: {e}")
                # Tenta remover do dicionário mesmo que ocorra um erro
                self.webrtc_conversions.pop(conversion_key, None)
        
    async def get_or_create_webrtc_conversion(self, rtsp_url, session_id):
        """Cria sempre uma nova conversão para cada sessão"""
        try:
            # Cria um identificador único para esta conversão específica
            conversion_key = f"{rtsp_url}_{session_id}"
            
            # Sempre cria uma nova conversão limpa
            print(f"Criando nova conversão WebRTC para {rtsp_url} (Sessão: {session_id})")
            conversion = WebRTCConversion.get_instance(rtsp_url, downscale_factor=3.7, frame_skip=1, quality_reduce=80)
            
            # Conecta a nova conversão
            await conversion.connect(rtsp_url)
            
            # Armazena com chave única por sessão
            self.webrtc_conversions[conversion_key] = conversion
            
            return conversion, conversion_key
        except Exception as e:
            print(f"Erro ao criar conversão WebRTC para {rtsp_url}: {e}")
            raise

    async def rtsp_websocket_handler(self, websocket):
        rtsp_url = None
        session_id = f"{id(websocket)}_{time.time()}"  # ID único para esta conexão
        conversion_key = None
        
        await self.register_rtsp_client(websocket)
        
        try:
            # Primeira mensagem deve ser a URL RTSP
            rtsp_url = await websocket.recv()
            print(f"Recebida URL RTSP: {rtsp_url} (Sessão: {session_id})")

            # Incrementa o contador de clientes para esta URL
            self.rtsp_client_count[rtsp_url] = self.rtsp_client_count.get(rtsp_url, 0) + 1
            print(f"Clientes conectados para URL {rtsp_url}: {self.rtsp_client_count[rtsp_url]}")
            
            # Obtém ou cria conversão WebRTC (sempre cria uma nova por sessão)
            webrtc_conversion, conversion_key = await self.get_or_create_webrtc_conversion(rtsp_url, session_id)
                    
            # Cria oferta SDP
            offer = await webrtc_conversion.create_offer()
            
            # Envia oferta para o cliente
            print(f"Enviando oferta SDP para o cliente (Sessão: {session_id})")
            offer_dict = {"sdp": offer.sdp, "type": offer.type}
            await websocket.send(json.dumps(offer_dict))
            
            # Recebe resposta SDP
            answer_json = await websocket.recv()
            answer_dict = json.loads(answer_json)
            answer = RTCSessionDescription(sdp=answer_dict["sdp"], type=answer_dict["type"])
            
            # Processa resposta
            await webrtc_conversion.process_answer(answer)
            print(f"Conexão WebRTC estabelecida para {rtsp_url} (Sessão: {session_id})")
            
            # Mantém a conexão aberta
            while True:
                try:
                    message = await websocket.recv()
                    if message == "CLOSE":
                        break
                except websockets.exceptions.ConnectionClosed:
                    print(f"Conexão fechada para {rtsp_url} (Sessão: {session_id})")
                    break
                        
        except Exception as e:
            print(f"Erro no handler WebSocket RTSP: {e} (Sessão: {session_id})")
        finally:
            # Sempre remove o cliente da lista de conexões ativas
            await self.unregister_rtsp_client(websocket)
            
            # Se houver uma URL RTSP associada, decrementa o contador
            if rtsp_url:
                try:
                    self.rtsp_client_count[rtsp_url] = max(0, self.rtsp_client_count.get(rtsp_url, 1) - 1)
                    print(f"Cliente desconectado da URL {rtsp_url} (Sessão: {session_id}). Clientes restantes: {self.rtsp_client_count[rtsp_url]}")
                    
                    # Limpa a conversão específica desta sessão
                    if conversion_key and conversion_key in self.webrtc_conversions:
                        try:
                            conversion = self.webrtc_conversions[conversion_key]
                            await conversion.close()
                            del self.webrtc_conversions[conversion_key]
                            print(f"Conversão WebRTC para sessão {session_id} encerrada e removida")
                        except Exception as e:
                            print(f"Erro ao limpar conversão para sessão {session_id}: {e}")
                            # Tenta remover do dicionário mesmo que ocorra um erro
                            self.webrtc_conversions.pop(conversion_key, None)
                except Exception as e:
                    print(f"Erro ao decrementar contador RTSP para {rtsp_url}: {e} (Sessão: {session_id})")

    # Servidor UDP para recebimento de mensagens do PDV
    async def start_udp_server(self):
        loop = asyncio.get_running_loop()
        
        # Cria o socket UDP
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.bind(('0.0.0.0', self.udp_port))
        sock.setblocking(False)
        
        print(f"Servidor UDP ouvindo na porta {self.udp_port}...")
        
        # Loop para receber dados do socket UDP
        while True:
            try:
                # Recebe os dados de forma não-bloqueante
                data, addr = await loop.sock_recvfrom(sock, 1024)
                client_ip = addr[0]
                
                if data:
                    # Redirecionamento para o DVR conforme configurado
                    try:
                        # Calcula a porta de origem com base no PDV
                        source_port = self.get_dvr_port_for_pdv(client_ip)
                        
                        # Cria um novo socket para poder definir a porta de origem
                        temp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                        # Associa a porta de origem específica
                        temp_socket.bind(('0.0.0.0', source_port))
                        
                        # Envia para o DVR na porta 38800
                        temp_socket.sendto(data, ('192.168.101.250', 38800))
                        
                        print(f"[DVR-RECORDER] Enviado de 192.168.101.140:{source_port} para 192.168.101.250:38800 | Origem PDV: {client_ip}")
                        
                        # Fecha o socket temporário
                        temp_socket.close()

                    except Exception as e:
                        print(f"Erro ao redirecionar para DVR: {e}")
                    
                    # Continua com o processamento normal
                    raw_message = data.decode('utf-8', 'ignore')
                    processed_message = process_message(raw_message, client_ip)
                    
                    # Processa a mensagem com o monitor de transações do PDV
                    self.pdv_monitor.process_pdv_message(
                        raw_message, 
                        client_ip, 
                        pdv_clients, 
                        loop
                    )
                    
                    # Envia para os clientes WebSocket registrados para este IP
                    if client_ip in pdv_clients:
                        message_to_send = json.dumps({
                            "type": "pdv_data",
                            "pdv_ip": client_ip,
                            "data": processed_message
                        })
                        
                        # Envia a mensagem para todos os clientes interessados nesse PDV
                        for client in pdv_clients[client_ip]:
                            try:
                                await client.send(message_to_send)
                            except websockets.exceptions.ConnectionClosed:
                                pass
            except BlockingIOError:
                # Se não houver dados disponíveis, continue para a próxima iteração
                await asyncio.sleep(0.01)

    async def cleanup_stale_connections(self):
        """Limpa conexões obsoletas periodicamente"""
        while True:
            try:
                # Verificar quais conexões precisam ser limpas
                print(f"Verificando conexões obsoletas. Total de conversões: {len(self.webrtc_conversions)}")
                
                # Aguarda 60 segundos entre verificações
                await asyncio.sleep(60)
                    
            except Exception as e:
                print(f"Erro na limpeza de conexões: {e}")
                await asyncio.sleep(60)

    async def start(self):
        logging.basicConfig(level=logging.INFO)
        
        # Inicia o servidor WebSocket para PDV
        pdv_websocket_server = await websockets.serve(
            self.pdv_websocket_handler, 
            "0.0.0.0", 
            self.ws_port,
            ping_interval=None
        )
        print(f"Servidor WebSocket PDV iniciado em 0.0.0.0:{self.ws_port}")
        
        # Inicia o servidor WebSocket para RTSP
        rtsp_websocket_server = await websockets.serve(
            self.rtsp_websocket_handler,
            "0.0.0.0", 
            self.rtsp_ws_port
        )
        print(f"Servidor WebSocket RTSP iniciado em 0.0.0.0:{self.rtsp_ws_port}")
        
        # Inicia o servidor UDP
        udp_task = asyncio.create_task(self.start_udp_server())
        
        # Inicia tarefa de limpeza periódica
        cleanup_task = asyncio.create_task(self.cleanup_stale_connections())
        
        print("Todos os servidores iniciados. Pressione Ctrl+C para sair.")
        
        # Mantém os servidores rodando
        await asyncio.gather(
            pdv_websocket_server.wait_closed(),
            rtsp_websocket_server.wait_closed(),
            udp_task,
            cleanup_task 
        )

def main():
    parser = argparse.ArgumentParser(description='Servidor Unificado: PDV + RTSP/WebRTC')
    parser.add_argument('--ws-port', type=int, default=8765, help='Porta do servidor WebSocket para PDV')
    parser.add_argument('--rtsp-ws-port', type=int, default=8080, help='Porta do servidor WebSocket para RTSP')
    parser.add_argument('--udp-port', type=int, default=38800, help='Porta do servidor UDP')
    parser.add_argument('--pdv-timeout', type=int, default=180, help='Tempo (em segundos) para timeout de inatividade do PDV')
    args = parser.parse_args()
    
    unified_server = UnifiedServer(
        ws_port=args.ws_port,
        rtsp_ws_port=args.rtsp_ws_port,
        udp_port=args.udp_port,
        pdv_timeout=args.pdv_timeout,
    )
    
    try:
        asyncio.run(unified_server.start())
    except KeyboardInterrupt:
        print("Servidor finalizado pelo usuário")
        if unified_server.dvr_socket:
            unified_server.dvr_socket.close()

if __name__ == "__main__":
    main()
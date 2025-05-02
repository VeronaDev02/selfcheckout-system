import argparse
import asyncio
import json
import logging
import socket
import time  # Adicionado o import do módulo time
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
        
    async def cleanup_conversion(self, rtsp_url):
        """Remove a conversão WebRTC quando não estiver mais em uso"""
        if rtsp_url in self.webrtc_conversions:
            try:
                conversion = self.webrtc_conversions[rtsp_url]
                await conversion.close()
                del self.webrtc_conversions[rtsp_url]
                print(f"Conversão WebRTC para {rtsp_url} encerrada e removida")
            except Exception as e:
                print(f"Erro ao limpar conversão WebRTC para {rtsp_url}: {e}")
                # Tenta remover do dicionário mesmo que ocorra um erro
                self.webrtc_conversions.pop(rtsp_url, None)
        
    async def get_or_create_webrtc_conversion(self, rtsp_url):
        try:
            # Verifica se já existe uma conversão para esta URL
            if rtsp_url in self.webrtc_conversions:
                # Limpa a conversão existente para garantir uma nova conexão limpa
                print(f"Removendo conversão existente para {rtsp_url} e criando nova")
                await self.cleanup_conversion(rtsp_url)
                
            # Cria uma nova conversão limpa
            print(f"Criando nova conversão WebRTC para {rtsp_url}")
            conversion = WebRTCConversion.get_instance(rtsp_url, downscale_factor=2.0, frame_skip=2, quality_reduce=50)
            
            # Conecta a nova conversão
            await conversion.connect(rtsp_url)
            self.webrtc_conversions[rtsp_url] = conversion
            
            return conversion
        except Exception as e:
            print(f"Erro ao criar/obter conversão WebRTC para {rtsp_url}: {e}")
            # Em caso de erro, tentar limpar recursos existentes e propagar o erro
            await self.cleanup_conversion(rtsp_url)
            raise

    async def reset_webrtc_system(self):
        """Reinicia completamente o sistema WebRTC, fechando e limpando todas as conexões"""
        print("REINICIANDO COMPLETAMENTE O SISTEMA WEBRTC")
        
        # Fecha todas as conversões
        for rtsp_url in list(self.webrtc_conversions.keys()):
            try:
                await self.cleanup_conversion(rtsp_url)
            except Exception as e:
                print(f"Erro ao limpar conversão {rtsp_url}: {e}")
        
        # Limpa o contador de clientes
        self.rtsp_client_count.clear()
        
        # Força uma coleta de lixo para liberar recursos
        import gc
        gc.collect()
        
        print("SISTEMA WEBRTC REINICIADO")

    async def rtsp_websocket_handler(self, websocket):
        rtsp_url = None
        session_id = f"session_{id(websocket)}_{time.time()}"  # ID único para esta conexão
        await self.register_rtsp_client(websocket)
        
        try:
            # Primeira mensagem deve ser a URL RTSP
            rtsp_url = await websocket.recv()
            print(f"Recebida URL RTSP: {rtsp_url} (Sessão: {session_id})")

            # Incrementa o contador de clientes para esta URL
            self.rtsp_client_count[rtsp_url] = self.rtsp_client_count.get(rtsp_url, 0) + 1
            print(f"Clientes conectados para URL {rtsp_url}: {self.rtsp_client_count[rtsp_url]}")
            
            # Verifica se a URL já existe, mas está em um estado problemático
            need_reconnect = False
            if rtsp_url in self.webrtc_conversions:
                conversion = self.webrtc_conversions[rtsp_url]
                # Se a conversão existir mas não estiver conectada, forçamos reconexão
                if not conversion.is_connected:
                    print(f"Conexão existente inativa para {rtsp_url}, forçando reconexão")
                    await self.cleanup_conversion(rtsp_url)
                    need_reconnect = True
                    
            # Criar nova conversão se não existir ou precisar reconectar
            if need_reconnect or rtsp_url not in self.webrtc_conversions:
                # Obtém ou cria conversão WebRTC
                webrtc_conversion = await self.get_or_create_webrtc_conversion(rtsp_url)
            else:
                # Usa a conversão existente
                webrtc_conversion = self.webrtc_conversions[rtsp_url]
                
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
            
            # Mantém a conexão aberta com um ping periódico para detectar desconexões
            ping_interval = 5  # segundos
            while True:
                try:
                    # Usa um timeout para evitar bloquear para sempre
                    message = await asyncio.wait_for(
                        websocket.recv(),
                        timeout=ping_interval
                    )
                    if message == "CLOSE":
                        break
                except asyncio.TimeoutError:
                    # Timeout usado para verificar a conexão periodicamente
                    try:
                        # Tenta enviar um ping para verificar se a conexão ainda está ativa
                        await websocket.ping()
                    except:
                        print(f"Ping falhou para {rtsp_url} (Sessão: {session_id}), assumindo desconexão")
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
                    
                    # Se não houver mais clientes, limpa a conversão
                    if self.rtsp_client_count[rtsp_url] <= 0:
                        await self.cleanup_conversion(rtsp_url)
                        self.rtsp_client_count.pop(rtsp_url, None)
                        print(f"Sem clientes para URL {rtsp_url}, recursos liberados (Sessão: {session_id})")
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
                    # print(f"Dados recebidos de {client_ip}:{addr[1]}")
                    
                    # Processa a mensagem recebida
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
                # Apenas limpa as URLs RTSP que não têm mais clientes
                rtsp_urls_to_check = list(self.rtsp_client_count.keys())
                for rtsp_url in rtsp_urls_to_check:
                    if self.rtsp_client_count[rtsp_url] <= 0:
                        try:
                            await self.cleanup_conversion(rtsp_url)
                            self.rtsp_client_count.pop(rtsp_url, None)
                            print(f"Limpeza periódica: URL RTSP {rtsp_url} limpa (sem clientes)")
                        except Exception as e:
                            print(f"Erro ao limpar URL RTSP {rtsp_url}: {e}")
                
                # Verifica se alguma conversão está "pendurada" (sem clientes no contador)
                for rtsp_url in list(self.webrtc_conversions.keys()):
                    if rtsp_url not in self.rtsp_client_count or self.rtsp_client_count[rtsp_url] <= 0:
                        try:
                            await self.cleanup_conversion(rtsp_url)
                            print(f"Correção: WebRTC conversão {rtsp_url} foi removida - não tinha clientes")
                        except Exception as e:
                            print(f"Erro ao limpar conversão pendente {rtsp_url}: {e}")
                
                # Executa a cada 15 segundos (aumentando para reduzir sobrecarga)
                await asyncio.sleep(15)
                
            except Exception as e:
                print(f"Erro na limpeza de conexões: {e}")
                await asyncio.sleep(15)  # Em caso de erro, também espera 15 segundos

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
            cleanup_task  # Adicione a tarefa de limpeza aqui
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
        pdv_timeout=args.pdv_timeout
    )
    
    try:
        # No Python 3.13, precisamos criar e executar o loop explicitamente
        asyncio.run(unified_server.start())
    except KeyboardInterrupt:
        print("Servidor finalizado pelo usuário")

if __name__ == "__main__":
    main()
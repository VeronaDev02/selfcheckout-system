import argparse
import asyncio
import json
import logging
import socket
import time
import re
import os
import websockets
from aiortc import RTCSessionDescription
from typing import Dict, Set, List
from webrtc_conversion import WebRTCConversion
from rtsp_connection import RTSPConnection
from message_processor import process_message
from pdv_transaction import PDVTransaction

pdv_clients = {}

class UnifiedServer:
    def __init__(self, ws_port=8765, rtsp_ws_port=8080, pdv_timeout=180, config_path=None):
        self.ws_port = ws_port
        self.rtsp_ws_port = rtsp_ws_port
        self.config_path = config_path
        
        self.active_rtsp_connections = set()
        self.webrtc_conversions: Dict[str, WebRTCConversion] = {}
        
        self.rtsp_client_count: Dict[str, int] = {}

        self.pdv_monitor = PDVTransaction(timeout_seconds=pdv_timeout)
        
        self.selfs_config = []
        
        self.pdv_ip_to_config = {}
        
        self.pdv_listen_sockets = {}
        
        self.dvr_sockets = {}
        
    def load_config(self):
        if not self.config_path or not os.path.exists(self.config_path):
            print(f"Arquivo de configuração não encontrado: {self.config_path}")
            return False
            
        try:
            with open(self.config_path, 'r') as file:
                self.selfs_config = json.load(file)
                
            self.pdv_ip_to_config = {}
            for config in self.selfs_config:
                pdv_ip = config.get('pdv_ip')
                if pdv_ip:
                    self.pdv_ip_to_config[pdv_ip] = config
            
            pdv_ips = [config.get('pdv_ip') for config in self.selfs_config]
            print(f"Configuração carregada: {len(self.selfs_config)} SelfCheckouts encontrados.")
            print(f"IPs dos PDVs: {', '.join(pdv_ips)}")
                
            return True
        except Exception as e:
            print(f"Erro ao carregar configuração: {e}")
            return False
            
    def setup_pdv_sockets(self):
        for config in self.selfs_config:
            pdv_ip = config.get('pdv_ip')
            pdv_port = int(config.get('pdv_port', 38800))
            
            if pdv_ip:
                try:
                    pdv_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                    
                    pdv_socket.bind(('0.0.0.0', pdv_port))
                    pdv_socket.setblocking(False)
                    
                    self.pdv_listen_sockets[f"{pdv_ip}:{pdv_port}"] = {
                        'socket': pdv_socket,
                        'pdv_ip': pdv_ip,
                        'pdv_port': pdv_port,
                        'config': config
                    }
                    
                    print(f"Socket de escuta configurado para PDV {pdv_ip}:{pdv_port}")
                except Exception as e:
                    print(f"Erro ao configurar socket para PDV {pdv_ip}:{pdv_port}: {e}")
    
    def setup_dvr_sockets(self):
        for sock_data in self.dvr_sockets.values():
            try:
                sock_data['socket'].close()
            except:
                pass
        
        self.dvr_sockets = {}
        
        for config in self.selfs_config:
            pdv_ip = config.get('pdv_ip')
            dvr_ip = config.get('dvr_ip')
            dvr_port = config.get('dvr_port')
            origin_port = config.get('origin_port')

            if dvr_ip and dvr_port and origin_port:
                dvr_key = f"{pdv_ip}_{dvr_ip}:{dvr_port}"
                
                try:
                    dvr_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                    
                    dvr_socket.bind(('0.0.0.0', int(origin_port)))

                    self.dvr_sockets[dvr_key] = {
                        'socket': dvr_socket,
                        'dvr_ip': dvr_ip,
                        'dvr_port': int(dvr_port),
                        'pdv_ip': pdv_ip,
                        'origin_port': int(origin_port)
                    }
                    
                    print(f"Socket de envio configurado para DVR {dvr_ip}:{dvr_port} com origem na porta {origin_port} para PDV {pdv_ip}")
                except Exception as e:
                    print(f"Erro ao configurar socket para DVR {dvr_key}: {e}")
    
    async def register_pdv_client(self, websocket, pdv_ip):
        if pdv_ip not in pdv_clients:
            pdv_clients[pdv_ip] = set()
            
        pdv_clients[pdv_ip].add(websocket)
        print(f"Cliente WebSocket registrado para o PDV {pdv_ip}")
        return True

    async def unregister_pdv_client(self, websocket):
        for ip, clients in list(pdv_clients.items()):
            if websocket in clients:
                clients.remove(websocket)
                print(f"Cliente WebSocket removido do PDV {ip}")
                if len(clients) == 0:
                    del pdv_clients[ip]
                    print(f"Conjunto de clientes para o PDV {ip} removido (vazio)")
                break

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

    async def register_rtsp_client(self, websocket):
        self.active_rtsp_connections.add(websocket)
        
    async def unregister_rtsp_client(self, websocket):
        try:
            if websocket in self.active_rtsp_connections:
                self.active_rtsp_connections.remove(websocket)
                print("Cliente RTSP desconectado e removido da lista")
        except Exception as e:
            print(f"Erro ao remover cliente RTSP da lista: {e}")
        
    async def cleanup_conversion(self, conversion_key):
        if conversion_key in self.webrtc_conversions:
            try:
                conversion = self.webrtc_conversions[conversion_key]
                await conversion.close()
                del self.webrtc_conversions[conversion_key]
                print(f"Conversão WebRTC para {conversion_key} encerrada e removida")
            except Exception as e:
                print(f"Erro ao limpar conversão WebRTC para {conversion_key}: {e}")
                self.webrtc_conversions.pop(conversion_key, None)
        
    async def get_or_create_webrtc_conversion(self, rtsp_url, session_id, quality_preset="medium"):
        """Cria sempre uma nova conversão para cada sessão com qualidade ajustável"""
        try:
            conversion_key = f"{rtsp_url}_{session_id}"
            
            # Definir presets de qualidade
            quality_presets = {
                "low": {"downscale_factor": 4.5, "frame_skip": 2, "quality_reduce": 85},
                "medium-low": {"downscale_factor": 3.7, "frame_skip": 1, "quality_reduce": 80},
                "medium": {"downscale_factor": 2.5, "frame_skip": 1, "quality_reduce": 60},
                "high": {"downscale_factor": 1.5, "frame_skip": 1, "quality_reduce": 30}
            }
            
            # Obter configurações do preset selecionado (ou usar medium-low como padrão se não existir)
            preset = quality_presets.get(quality_preset, quality_presets["medium-low"])
            
            print(f"Criando nova conversão WebRTC para {rtsp_url} (Sessão: {session_id}, Qualidade: {quality_preset})")
            conversion = WebRTCConversion.get_instance(
                rtsp_url, 
                downscale_factor=preset["downscale_factor"], 
                frame_skip=preset["frame_skip"], 
                quality_reduce=preset["quality_reduce"]
            )
            
            await conversion.connect(rtsp_url)
            
            self.webrtc_conversions[conversion_key] = conversion
            
            return conversion, conversion_key
        except Exception as e:
            print(f"Erro ao criar conversão WebRTC para {rtsp_url}: {e}")
            raise

    async def rtsp_websocket_handler(self, websocket):
        rtsp_url = None
        session_id = f"{id(websocket)}_{time.time()}"
        conversion_key = None
        quality_preset = "medium-low"
        
        await self.register_rtsp_client(websocket)
        
        try:
            rtsp_url = await websocket.recv()
            print(f"Recebida URL RTSP: {rtsp_url} (Sessão: {session_id})")
            
            try:
                quality_data = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                try:
                    quality_json = json.loads(quality_data)
                    if 'quality' in quality_json:
                        quality_preset = quality_json['quality']
                        print(f"Recebida configuração de qualidade: {quality_preset} (Sessão: {session_id})")
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                pass

            self.rtsp_client_count[rtsp_url] = self.rtsp_client_count.get(rtsp_url, 0) + 1
            print(f"Clientes conectados para URL {rtsp_url}: {self.rtsp_client_count[rtsp_url]}")
            
            webrtc_conversion, conversion_key = await self.get_or_create_webrtc_conversion(rtsp_url, session_id, quality_preset)
                    
            offer = await webrtc_conversion.create_offer()
            
            print(f"Enviando oferta SDP para o cliente (Sessão: {session_id})")
            offer_dict = {"sdp": offer.sdp, "type": offer.type}
            await websocket.send(json.dumps(offer_dict))
            
            answer_json = await websocket.recv()
            answer_dict = json.loads(answer_json)
            answer = RTCSessionDescription(sdp=answer_dict["sdp"], type=answer_dict["type"])
            
            await webrtc_conversion.process_answer(answer)
            print(f"Conexão WebRTC estabelecida para {rtsp_url} (Sessão: {session_id}, Qualidade: {quality_preset})")
            
            while True:
                try:
                    message = await websocket.recv()
                    if message == "CLOSE":
                        break
                    elif message.startswith('{"change_quality":'):
                        try:
                            quality_json = json.loads(message)
                            if 'change_quality' in quality_json:
                                new_quality = quality_json['change_quality']
                                print(f"Alterando qualidade para: {new_quality} (Sessão: {session_id})")
                                
                                if conversion_key in self.webrtc_conversions:
                                    await self.cleanup_conversion(conversion_key)
                                
                                webrtc_conversion, conversion_key = await self.get_or_create_webrtc_conversion(rtsp_url, session_id, new_quality)
                                
                                offer = await webrtc_conversion.create_offer()
                                offer_dict = {"sdp": offer.sdp, "type": offer.type}
                                await websocket.send(json.dumps(offer_dict))
                                
                                answer_json = await websocket.recv()
                                answer_dict = json.loads(answer_json)
                                answer = RTCSessionDescription(sdp=answer_dict["sdp"], type=answer_dict["type"])
                                
                                await webrtc_conversion.process_answer(answer)
                                print(f"Conexão WebRTC reestabelecida com nova qualidade: {new_quality} (Sessão: {session_id})")
                        except json.JSONDecodeError:
                            print(f"Erro ao analisar mensagem de mudança de qualidade (Sessão: {session_id})")
                        except Exception as e:
                            print(f"Erro ao alterar qualidade: {e} (Sessão: {session_id})")
                except websockets.exceptions.ConnectionClosed:
                    print(f"Conexão fechada para {rtsp_url} (Sessão: {session_id})")
                    break
                        
        except Exception as e:
            print(f"Erro no handler WebSocket RTSP: {e} (Sessão: {session_id})")
        finally:
            await self.unregister_rtsp_client(websocket)
            
            if rtsp_url:
                try:
                    self.rtsp_client_count[rtsp_url] = max(0, self.rtsp_client_count.get(rtsp_url, 1) - 1)
                    print(f"Cliente desconectado da URL {rtsp_url} (Sessão: {session_id}). Clientes restantes: {self.rtsp_client_count[rtsp_url]}")
                    
                    if conversion_key and conversion_key in self.webrtc_conversions:
                        await self.cleanup_conversion(conversion_key)
                except Exception as e:
                    print(f"Erro ao decrementar contador RTSP para {rtsp_url}: {e} (Sessão: {session_id})")

    async def listen_pdv_socket(self, pdv_key, pdv_socket_data):
        """
        Escuta em um socket específico de um PDV e processa as mensagens
        """
        loop = asyncio.get_running_loop()
        pdv_socket = pdv_socket_data['socket']
        pdv_ip = pdv_socket_data['pdv_ip']
        pdv_port = pdv_socket_data['pdv_port']
        config = pdv_socket_data['config']
        
        dvr_ip = config.get('dvr_ip')
        dvr_port = config.get('dvr_port')

        dvr_key = f"{pdv_ip}_{dvr_ip}:{dvr_port}"
        
        print(f"Iniciando escuta para PDV {pdv_ip}:{pdv_port}")
        
        while True:
            try:
                data, addr = await loop.sock_recvfrom(pdv_socket, 1024)
                client_ip = addr[0]
                client_port = addr[1]
                
                if data:
                    print(f"[PDV-RECV] Recebido {len(data)} bytes de {client_ip}:{client_port}")
                    
                    try:
                        # Usa o socket específico vinculado à porta de origem correta para este PDV
                        if dvr_key in self.dvr_sockets:
                            dvr_socket = self.dvr_sockets[dvr_key]['socket']
                            origin_port = self.dvr_sockets[dvr_key]['origin_port']
                            dvr_socket.sendto(data, (dvr_ip, int(dvr_port)))
                            print(f"[DVR-SEND] Enviado de {client_ip}:{client_port} (origem: porta {origin_port}) para {dvr_ip}:{dvr_port}")
                        else:
                            print(f"Socket DVR não encontrado para {dvr_key}")
                    except Exception as e:
                        print(f"Erro ao redirecionar para DVR: {e}")
                        
                    raw_message = data.decode('utf-8', 'ignore')
                    processed_message = process_message(raw_message, client_ip)
                    
                    self.pdv_monitor.process_pdv_message(
                        raw_message, 
                        client_ip, 
                        pdv_clients, 
                        loop
                    )
                    
                    if client_ip in pdv_clients:
                        message_to_send = json.dumps({
                            "type": "pdv_data",
                            "pdv_ip": client_ip,
                            "data": processed_message
                        })
                        
                        for client in pdv_clients[client_ip]:
                            try:
                                await client.send(message_to_send)
                            except websockets.exceptions.ConnectionClosed:
                                pass
            except BlockingIOError:
                await asyncio.sleep(0.01)
            except Exception as e:
                print(f"Erro ao processar dados do PDV {pdv_ip}:{pdv_port}: {e}")
                await asyncio.sleep(0.1)

    async def cleanup_stale_connections(self):
        """Limpa conexões obsoletas periodicamente"""
        while True:
            try:
                await asyncio.sleep(60)
                    
            except Exception as e:
                print(f"Erro na limpeza de conexões: {e}")
                await asyncio.sleep(60)

    async def start(self):
        logging.basicConfig(level=logging.INFO)
        
        success = self.load_config()
        if not success:
            print("AVISO: Não foi possível carregar a configuração. O servidor continuará com configuração vazia.")
        
        self.setup_pdv_sockets()
        
        self.setup_dvr_sockets()
        
        pdv_websocket_server = await websockets.serve(
            self.pdv_websocket_handler, 
            "0.0.0.0", 
            self.ws_port,
            ping_interval=None
        )
        print(f"Servidor WebSocket PDV iniciado em 0.0.0.0:{self.ws_port}")
        
        rtsp_websocket_server = await websockets.serve(
            self.rtsp_websocket_handler,
            "0.0.0.0", 
            self.rtsp_ws_port
        )
        print(f"Servidor WebSocket RTSP iniciado em 0.0.0.0:{self.rtsp_ws_port}")
        
        pdv_listen_tasks = []
        for pdv_key, pdv_socket_data in self.pdv_listen_sockets.items():
            task = asyncio.create_task(self.listen_pdv_socket(pdv_key, pdv_socket_data))
            pdv_listen_tasks.append(task)
            
        cleanup_task = asyncio.create_task(self.cleanup_stale_connections())
        
        print("Todos os servidores iniciados. Pressione Ctrl+C para sair.")
        print("Escutando em portas específicas para cada PDV configurado.")

        await asyncio.gather(
            pdv_websocket_server.wait_closed(),
            rtsp_websocket_server.wait_closed(),
            cleanup_task,
            *pdv_listen_tasks
        )

def main():
    parser = argparse.ArgumentParser(description='Servidor Unificado: PDV + RTSP/WebRTC')
    parser.add_argument('--ws-port', type=int, default=8765, help='Porta do servidor WebSocket para PDV')
    parser.add_argument('--rtsp-ws-port', type=int, default=8080, help='Porta do servidor WebSocket para RTSP')
    parser.add_argument('--pdv-timeout', type=int, default=180, help='Tempo (em segundos) para timeout de inatividade do PDV')
    parser.add_argument('--config', type=str, default='./config.json', help='Caminho para o arquivo de configuração')
    args = parser.parse_args()
    
    unified_server = UnifiedServer(
        ws_port=args.ws_port,
        rtsp_ws_port=args.rtsp_ws_port,
        pdv_timeout=args.pdv_timeout,
        config_path=args.config
    )
    
    try:
        asyncio.run(unified_server.start())
    except KeyboardInterrupt:
        print("Servidor finalizado pelo usuário")
        for config in unified_server.pdv_listen_sockets.values():
            if 'socket' in config:
                config['socket'].close()
        for config in unified_server.dvr_sockets.values():
            if 'socket' in config:
                config['socket'].close()

if __name__ == "__main__":
    main()
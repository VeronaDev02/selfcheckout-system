import asyncio
import json
import re
import time

class PDVTransaction:
    def __init__(self, timeout_seconds=60):
        # Tempo máximo de inatividade permitido (em segundos)
        self.timeout_seconds = timeout_seconds
        
        # Dicionário para armazenar o estado de cada PDV
        # Formato: { ip_pdv: { 'active_transaction': bool, 'last_activity': timestamp, 'timeout_task': Task } }
        self.pdv_states = {}
        
    def is_transaction_start(self, message):
        """Verifica se a mensagem indica o início de uma transação"""
        # Identifica o padrão que indica início de transação
        return "*PDV" in message and "*Trans:" in message and "*Atend:" in message
        
    def is_transaction_end(self, message):
        """Verifica se a mensagem indica o fim de uma transação"""
        # Identifica o padrão que indica pagamento/finalização
        return "TOTAL" in message and "R$" in message or "Pagamento" in message
        
    def reset_pdv_state(self, pdv_ip):
        """Reinicia o estado de um PDV"""
        if pdv_ip in self.pdv_states:
            # Se existir uma tarefa de timeout rodando, cancela
            if 'timeout_task' in self.pdv_states[pdv_ip] and self.pdv_states[pdv_ip]['timeout_task']:
                self.pdv_states[pdv_ip]['timeout_task'].cancel()
                
            # Reinicia o estado
            self.pdv_states[pdv_ip] = {
                'active_transaction': False,
                'last_activity': time.time(),
                'timeout_task': None
            }
        
    def register_pdv_if_needed(self, pdv_ip):
        """Registra um PDV no monitoramento se ainda não estiver registrado"""
        if pdv_ip not in self.pdv_states:
            self.pdv_states[pdv_ip] = {
                'active_transaction': False,
                'last_activity': time.time(),
                'timeout_task': None
            }
    
    async def timeout_checker(self, pdv_ip, websocket_clients):
        """Tarefa que verifica timeout de inatividade do PDV"""
        try:
            # Espera pelo tempo de timeout
            await asyncio.sleep(self.timeout_seconds)
            
            # Verifica se ainda está em uma transação ativa
            if (pdv_ip in self.pdv_states and 
                self.pdv_states[pdv_ip]['active_transaction']):
                
                # Calcula quanto tempo passou desde a última atividade
                inactive_time = time.time() - self.pdv_states[pdv_ip]['last_activity']
                
                # Se passou mais tempo que o timeout, notifica
                if inactive_time >= self.timeout_seconds:
                    print(f"[ALERTA] PDV {pdv_ip} inativo por {inactive_time:.1f} segundos durante transação")
                    
                    # Prepara mensagem de timeout
                    timeout_message = {
                        "type": "pdv_inativo_timeout",
                        "pdv_ip": pdv_ip,
                        "inactive_time": round(inactive_time, 1)
                    }
                    
                    # Envia para todos os clientes conectados a este PDV
                    for client in websocket_clients.get(pdv_ip, set()):
                        try:
                            await client.send(json.dumps(timeout_message))
                        except Exception as e:
                            print(f"Erro ao enviar notificação de timeout: {e}")
        except asyncio.CancelledError:
            # Tarefa cancelada (normal quando há atividade no PDV)
            pass
        except Exception as e:
            print(f"Erro no verificador de timeout: {e}")
    
    def process_pdv_message(self, message, pdv_ip, websocket_clients, loop):
        """
        Processa uma mensagem do PDV para monitorar atividade
        
        Args:
            message (str): Mensagem recebida do PDV
            pdv_ip (str): Endereço IP do PDV
            websocket_clients (dict): Dicionário com clientes WebSocket por IP
            loop (asyncio.AbstractEventLoop): Loop de eventos atual
            
        Returns:
            bool: True se a mensagem indica produto escaneado, False caso contrário
        """
        self.register_pdv_if_needed(pdv_ip)
        
        # Verifica início de transação
        if self.is_transaction_start(message):
            # Log apenas de inicialização de transação, silencioso
            # print(f"PDV {pdv_ip}: Início de transação detectado")
            
            # Reinicia o estado e marca como transação ativa
            self.reset_pdv_state(pdv_ip)
            self.pdv_states[pdv_ip]['active_transaction'] = True
            self.pdv_states[pdv_ip]['last_activity'] = time.time()
            
            # Inicia tarefa de verificação de timeout
            self.pdv_states[pdv_ip]['timeout_task'] = asyncio.create_task(
                self.timeout_checker(pdv_ip, websocket_clients)
            )
            
        # Verifica fim de transação
        elif self.is_transaction_end(message):
            # Log de finalização de transação, silencioso
            # print(f"PDV {pdv_ip}: Fim de transação detectado")
            
            # Reinicia o estado
            self.reset_pdv_state(pdv_ip)
            
        # Verifica se é uma mensagem de produto (atividade durante transação)
        elif self.pdv_states[pdv_ip]['active_transaction']:
            # Verifica padrões que indicam leitura de produto
            is_product = False
            
            # Verifica se tem algum padrão de código de barras ou produto
            # (Personalizar conforme formato dos dados do PDV)
            if re.search(r'\d{8,13}', message) or 'Produto' in message or 'Item' in message:
                is_product = True
            
            if is_product:
                # Log de atividade detectada, removido para ser silencioso
                # print(f"PDV {pdv_ip}: Atividade detectada durante transação")
                
                # Atualiza timestamp de última atividade
                self.pdv_states[pdv_ip]['last_activity'] = time.time()
                
                # Cancela a tarefa de timeout anterior se existir
                if self.pdv_states[pdv_ip]['timeout_task']:
                    self.pdv_states[pdv_ip]['timeout_task'].cancel()
                
                # Inicia nova tarefa de timeout
                self.pdv_states[pdv_ip]['timeout_task'] = asyncio.create_task(
                    self.timeout_checker(pdv_ip, websocket_clients)
                )
                
                return True
                
        return False
def process_message(raw_message, client_ip):
    """
    Processa a mensagem recebida de um PDV.
    
    Args:
        raw_message (str): Mensagem bruta recebida do PDV
        client_ip (str): IP do cliente PDV que enviou a mensagem
        
    Returns:
        str: Mensagem processada
    """
    # TODO: Fazer a filtragem das mensagens que quero enviar.
    # Aqui podemos implementar a lógica de filtragem, formatação, etc.
    # Por exemplo:
    # - Filtrar apenas mensagens específicas
    # - Formatar a saída para um formato mais legível
    # - Extrair informações relevantes como código de produto, valor, etc.
    
    # Por enquanto, apenas retorna a mensagem original
    processed_message = raw_message
    
    # Adiciona um timestamp ou outras informações úteis
    return processed_message
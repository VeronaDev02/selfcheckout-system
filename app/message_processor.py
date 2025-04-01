import re

def process_message(raw_message, client_ip):
    """
    Processa a mensagem recebida de um PDV, preservando todas as informações
    essenciais e aplicando apenas formatação básica para melhorar a legibilidade.
    
    Args:
        raw_message (str): Mensagem bruta recebida do PDV
        client_ip (str): IP do cliente PDV que enviou a mensagem
        
    Returns:
        str: Mensagem processada com formatação mínima
    """
    # Remove caracteres de controle e espaços extras
    cleaned_message = raw_message.strip()
    
    # Remove caracteres de formatação repetidos
    cleaned_message = re.sub(r'(\*{3,}|\^{2,}|\.{5,}|\={5,}|\-{5,})', ' ', cleaned_message)
    
    # Remove múltiplos espaços em branco
    cleaned_message = re.sub(r' {2,}', ' ', cleaned_message)
    
    # Remove ^ no final das linhas
    cleaned_message = cleaned_message.replace('^', '')
    
    # Simplificação para algumas mensagens padrão
    # Abertura de gaveta
    if "Abertura de Gaveta" in cleaned_message:
        return cleaned_message.replace("************", "").replace("******************", "")
    
    # Relatório gerencial
    if "Relatorio Gerencial" in cleaned_message:
        return cleaned_message.replace("***********", "").replace("******************", "")
    
    # Linhas de separação
    if re.match(r'^\[[\d:]+\]\s*\.+$', cleaned_message):
        return "" # Remove linhas que são apenas pontos
    
    # Linhas de separação
    if re.match(r'^\[[\d:]+\]\s*\*+$', cleaned_message):
        return "" # Remove linhas que são apenas asteriscos
    
    # Para transações
    if "*PDV" in cleaned_message and "*Trans:" in cleaned_message:
        # Deixa o cabeçalho de transação mais visível
        cleaned_message = cleaned_message.replace("*PDV", "PDV").replace("*Trans:", "Trans:").replace("*Atend:", "Atend:")
        # Poderia adicionar separadores, mas preferimos manter o texto original
    
    return cleaned_message
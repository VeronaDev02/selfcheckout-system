/**
 * formatting.js - Utilitários para formatação
 * Funções auxiliares para formatação de dados e texto
 */

/**
 * Formata timestamp atual para exibição
 * @returns {string} Timestamp no formato HH:MM:SS
 */
export function formatTimestamp() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
}

/**
 * Extrai os últimos dois dígitos de um endereço IP
 * @param {string} ipAddress - Endereço IP completo
 * @returns {string} Últimos dois dígitos formatados
 */
export function extractPdvNumber(ipAddress) {
    if (!ipAddress) return 'Desconhecido';
    return ipAddress.split('.').pop().padStart(3, '0').slice(-2);
}

/**
 * Cria uma mensagem de log formatada
 * @param {string} type - Tipo de mensagem (INFO, ERRO, ALERTA)
 * @param {string} message - Conteúdo da mensagem
 * @returns {string} Mensagem formatada com timestamp
 */
export function formatLogMessage(type, message) {
    const timestamp = formatTimestamp();
    return `[${timestamp}] [${type}] ${message}`;
}

/**
 * Adiciona classes CSS personalizadas com base no conteúdo da mensagem
 * @param {string} message - Mensagem original do log
 * @returns {string} Mensagem formatada com HTML/CSS para destaque
 */
export function applyLogStyles(message) {
    // Implementação simplificada - na versão completa, aplicaria regex para estilos contextuais
    if (message.includes('TOTAL R$:')) {
        return `<div class="total">${message}</div>`;
    } else if (message.includes('ABERTURA DE GAVETA')) {
        return `<div class="gaveta">${message}</div>`;
    } else if (message.includes('RELATÓRIO GERENCIAL')) {
        return `<div class="relatorio">${message}</div>`;
    } else if (message.includes('NOVA VENDA')) {
        return `<div class="nova-venda">${message}</div>`;
    } else if (message.includes('PAGAMENTO')) {
        return `<div class="pagamento">${message}</div>`;
    } else if (message.includes('DESCONTO')) {
        return `<div class="desconto">${message}</div>`;
    }
    
    return message;
}
# Documentação do Front-End SelfCheckout

## Visão Geral

O SelfCheckout é uma aplicação web projetada para monitoramento de PDVs (Pontos de Venda) e câmeras RTSP. A aplicação permite visualizar até 4 câmeras e seus respectivos logs de PDV simultaneamente, com recursos de alerta para inatividade e alternância entre temas claro e escuro.

A arquitetura do front-end segue uma abordagem modular usando JavaScript ES6, CSS modular e HTML5.

## Estrutura de Arquivos

```
/
├── css/
│   ├── main.css                   # Arquivo principal CSS (importa todos os módulos)
│   └── modules/
│       ├── alerts.css             # Estilos para alertas de inatividade
│       ├── controls.css           # Estilos para controles e painéis
│       ├── header.css             # Estilos para o cabeçalho
│       ├── layout.css             # Estilos para layout e grid
│       ├── logs.css               # Estilos para área de logs
│       ├── quadrants.css          # Estilos para quadrantes
│       ├── reset.css              # Reset e estilos base
│       ├── responsive.css         # Estilos para responsividade
│       ├── themes.css             # Sistema de temas claro/escuro
│       └── video.css              # Estilos para players de vídeo
│
├── js/
│   ├── main.js                    # Ponto de entrada principal
│   ├── modules/
│   │   ├── alerts.js              # Sistema de alertas de inatividade
│   │   ├── camera.js              # Gerenciamento de câmeras RTSP
│   │   ├── connection.js          # Gerenciamento de conexões WebSocket/WebRTC
│   │   ├── pdv.js                 # Gerenciamento de PDVs
│   │   ├── theme.js               # Gerenciamento de temas
│   │   └── ui.js                  # Interface do usuário
│   └── utils/
│       ├── formatting.js          # Funções de formatação
│       └── logger.js              # Sistema de logs
│
├── imgs/
│   ├── verona_logo.png            # Logo para tema escuro
│   └── verona_logo_white.png      # Logo para tema claro
│
└── index.html                     # Página principal
```

## Módulos e Componentes

### HTML

#### `index.html`

**Função**: Ponto de entrada da aplicação

**Responsabilidades**:
- Estrutura base da aplicação
- Carregamento de scripts e estilos
- Definição da grade de quadrantes
- Controles para conexões de servidor, câmeras e PDVs

### CSS

#### `main.css`

**Função**: Arquivo central que importa todos os módulos CSS

**Responsabilidades**:
- Importa todos os módulos CSS em ordem apropriada
- Define a ordem de cascata para garantir sobrescrita adequada

#### `themes.css`

**Função**: Sistema de temas claro/escuro

**Responsabilidades**:
- Define variáveis CSS para ambos os temas
- Configura cores, bordas e estilos específicos por tema
- Gerencia transições entre temas

#### `reset.css`

**Função**: Reset CSS e estilos base

**Responsabilidades**:
- Normaliza estilos entre navegadores
- Define estilos base para elementos HTML
- Configura fonte, cores e comportamento padrão

#### `layout.css`

**Função**: Layout principal e grid

**Responsabilidades**:
- Define a estrutura de grid para os quadrantes
- Gerencia o comportamento de fullscreen
- Configura posicionamento flex

#### `header.css`

**Função**: Estilização do cabeçalho

**Responsabilidades**:
- Estiliza o logo e texto da marca
- Configura botões de tema e tela cheia
- Define posicionamento e alinhamento dos elementos

#### `quadrants.css`

**Função**: Estilização dos quadrantes de visualização

**Responsabilidades**:
- Define layout para os containers de log e vídeo
- Configura proporções e comportamento dos quadrantes
- Estiliza overlay de status

#### `controls.css`

**Função**: Estilização dos controles e painéis

**Responsabilidades**:
- Estiliza painéis de controle de servidor e conexão
- Define botões, inputs e indicadores de status
- Configura comportamento de expansão/contração

#### `logs.css`

**Função**: Estilização da área de logs

**Responsabilidades**:
- Define estilos para diferentes tipos de mensagens
- Configura formatação de texto e cores específicas
- Estiliza scrollbars e comportamento de overflow

#### `video.css`

**Função**: Estilização dos players de vídeo

**Responsabilidades**:
- Configura dimensões e comportamento de vídeo
- Remove controles nativos
- Define comportamento de objeto

#### `alerts.css`

**Função**: Estilização de alertas de inatividade

**Responsabilidades**:
- Define animações de alerta (piscar)
- Estiliza notificações flutuantes
- Configura comportamento visual de alertas

#### `responsive.css`

**Função**: Adaptação para diferentes tamanhos de tela

**Responsabilidades**:
- Define breakpoints para dispositivos móveis e tablets
- Ajusta layout e tamanhos para diferentes resoluções
- Reorganiza elementos em telas menores

### JavaScript

#### `main.js`

**Função**: Ponto de entrada principal do JavaScript

**Responsabilidades**:
- Inicializa todos os módulos
- Configura event listeners globais
- Exporta funções globais para compatibilidade com HTML
- Gerencia tratamento de erros global

#### `modules/ui.js`

**Função**: Gerenciamento de interface do usuário

**Responsabilidades**:
- Manipulação do DOM
- Gerenciamento de estados visuais
- Alternância de fullscreen
- Gerenciamento de toggles e painéis

#### `modules/connection.js`

**Função**: Gerenciamento central de conexões

**Responsabilidades**:
- Conexão com servidor principal
- Encaminhamento de mensagens para outros módulos
- Estado geral de conexão da aplicação
- Limpeza de recursos ao desconectar

#### `modules/camera.js`

**Função**: Gerenciamento de conexões de câmeras RTSP

**Responsabilidades**:
- Estabelecimento de conexões WebRTC
- Processamento de ofertas SDP
- Gerenciamento de streams de vídeo
- Monitoramento de estados de conexão ICE

#### `modules/pdv.js`

**Função**: Gerenciamento de Pontos de Venda (PDVs)

**Responsabilidades**:
- Registro e conexão com PDVs
- Processamento de dados dos PDVs
- Mapeamento entre quadrantes e IPs
- Exibição de mensagens nos logs

#### `modules/alerts.js`

**Função**: Sistema de alertas de inatividade

**Responsabilidades**:
- Detecção e processamento de inatividade
- Gerenciamento de fila de alertas
- Exibição visual de alertas nos quadrantes
- Alternância automática para fullscreen em alertas críticos

#### `modules/theme.js`

**Função**: Gerenciamento de temas (claro/escuro)

**Responsabilidades**:
- Alternância entre temas
- Persistência de preferências no localStorage
- Atualização da interface com base no tema
- Alternância do logo conforme o tema

#### `utils/formatting.js`

**Função**: Funções auxiliares de formatação

**Responsabilidades**:
- Formatação de timestamps
- Extração de números de PDV a partir de IPs
- Formatação de mensagens de log
- Aplicação de estilos condicionais

#### `utils/logger.js`

**Função**: Sistema centralizado de logging

**Responsabilidades**:
- Registro de logs no console com níveis
- Adição de mensagens nos logs dos quadrantes
- Formatação consistente de mensagens
- Atualização de indicadores de status

## Funcionalidades Principais

### Conexão com Servidor
- Estabelece conexão WebSocket com servidor central
- Mantém estado de conexão e propaga para outros módulos
- Exibe indicadores visuais de status de conexão
- Limpa conexões ao desconectar

### Streaming de Câmeras
- Conecta a câmeras RTSP via WebRTC
- Processa ofertas SDP e estabelece conexões de mídia
- Exibe streams de vídeo em tempo real
- Monitora qualidade e estado das conexões

### Monitoramento de PDVs
- Conecta a PDVs através do servidor central
- Exibe logs e mensagens em tempo real
- Formata diferentes tipos de mensagens com cores específicas
- Mapeia quadrantes a endereços IP específicos

### Sistema de Alertas
- Detecta inatividade de PDVs
- Cria alertas visuais (animações, bordas coloridas)
- Implementa fila de alertas para múltiplos eventos
- Pode expandir quadrantes automaticamente para alertas críticos

### Alternância de Temas
- Permite alternar entre temas claro e escuro
- Persiste preferência do usuário
- Aplica estilos diferentes via variáveis CSS
- Alterna logos automaticamente conforme o tema

### Modo Fullscreen
- Permite expandir quadrantes individuais
- Mantém proporcionalidade dos elementos
- Oferece visibilidade aprimorada para um PDV específico
- Inclui atalhos de teclado (ESC) para sair do modo

## Tecnologias Utilizadas

- **HTML5**: Estrutura base da aplicação
- **CSS3**:
  - Variáveis CSS
  - Grid Layout
  - Flexbox
  - Animações e transições
  - Media Queries para responsividade

- **JavaScript ES6+**:
  - Módulos ES6
  - Classes
  - Promises e async/await
  - Event listeners e custom events

- **WebRTC**: Para streaming de vídeo
- **WebSockets**: Para comunicação em tempo real
- **localStorage**: Para persistência de preferências

## Práticas de Desenvolvimento

- **Modularidade**: Código dividido em módulos com responsabilidades específicas
- **Padrão Singleton**: Instâncias únicas para gerenciadores
- **Programação orientada a eventos**: Comunicação via eventos customizados
- **Progressive Enhancement**: Funcionalidade básica garantida, com melhorias quando possível
- **Responsividade**: Adaptação para diferentes tamanhos de tela

## Considerações de Deploy

- A aplicação deve ser servida por um servidor HTTP para funcionar corretamente, especialmente para o funcionamento dos módulos ES6
- Recomenda-se uso de HTTPS em ambiente de produção para funcionalidades WebRTC
- A aplicação depende de um servidor back-end que implementa WebSockets para comunicação com PDVs e câmeras

## Manutenção e Extensão

Para adicionar novos recursos:

- **Novos módulos CSS**: Adicione arquivos em `css/modules/` e importe-os em `main.css`
- **Novos módulos JS**: Adicione arquivos em `js/modules/` e importe-os em `main.js`
- **Novos utilitários**: Adicione em `js/utils/` para funcionalidades reutilizáveis

A estrutura modular facilita a manutenção e a extensão, permitindo que novos desenvolvedores trabalhem em módulos específicos sem interferir no funcionamento geral da aplicação.

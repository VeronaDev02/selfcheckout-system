FROM python:3.9-slim

WORKDIR /app

# Instalar as dependências necessárias
RUN apt-get update && apt-get install -y \
    libavdevice-dev \
    libavfilter-dev \
    libopus-dev \
    libvpx-dev \
    pkg-config \
    libsrtp2-dev \
    libopencv-dev \
    python3-opencv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copiar o arquivo de requisitos primeiro para aproveitar o cache do Docker
COPY requirements.txt .

# Instalar as dependências Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar os arquivos do projeto
COPY main.py message_processor.py rtsp_connection.py webrtc_conversion.py /app/

# Criar um script de entrada que tenta ambos os comandos
RUN echo '#!/bin/bash\n\
if command -v py &> /dev/null; then\n\
    py main.py --ws-port=8765 --rtsp-ws-port=8080 --udp-port=38800\n\
else\n\
    python main.py --ws-port=8765 --rtsp-ws-port=8080 --udp-port=38800\n\
fi' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Expor as portas necessárias
EXPOSE 8080 8765 38800/udp

# Usar o script de entrada como comando
CMD ["/app/entrypoint.sh"]
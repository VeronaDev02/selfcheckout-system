FROM python:3.11-slim-bullseye

# Instala dependências do sistema necessárias para opencv, aiortc e outras libs
RUN apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    libavfilter-dev \
    libopencv-dev \
    libsrtp2-dev \
    libssl-dev \
    libopus-dev \
    libvpx-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Cria e ativa o diretório de trabalho
WORKDIR /app

# Copia os requisitos e instala as dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o código da aplicação
COPY main.py .
COPY rtsp_connection.py .
COPY webrtc_conversion.py .
COPY message_processor.py .

# Expõe as portas necessárias
EXPOSE 8765 8080 38800/udp

# Comando para iniciar a aplicação
CMD ["python", "main.py"]
import asyncio
import time
import threading
import queue
from aiortc import MediaStreamTrack, RTCPeerConnection
import cv2
import numpy as np
import fractions
from av import VideoFrame

class FrameGrabber(threading.Thread):
    """Thread dedicada para capturar frames do RTSP com redução de qualidade para otimizar CPU"""
    def __init__(self, rtsp_connection, max_queue_size=90, 
                 downscale_factor=2.0, frame_skip=2, quality_reduce=50):
        super().__init__(daemon=True)
        self.rtsp_connection = rtsp_connection
        self.queue = queue.Queue(maxsize=max_queue_size)
        self.running = True
        self.frame_count = 0
        self.start_time = time.time()
        
        # Parâmetros de otimização
        self.downscale_factor = downscale_factor  # Reduz tamanho da imagem (2.0 = 50% do tamanho)
        self.frame_skip = frame_skip  # Processa 1 a cada N frames (2 = 50% dos frames)
        self.quality_reduce = quality_reduce  # Reduz qualidade de JPEG (0-100, menor = mais compressão)
        self.frame_skip_counter = 0
        
    def run(self):
        while self.running:
            try:
                frame = self.rtsp_connection.read_frame()
                if frame is not None:
                    # Frame skipping - ignora alguns frames para reduzir carga
                    self.frame_skip_counter += 1
                    if self.frame_skip_counter % self.frame_skip != 0:
                        continue
                    
                    # Reduz resolução do frame
                    frame = self._downscale_frame(frame)
                    
                    # Calcula o timestamp
                    self.frame_count += 1
                    timestamp = int((time.time() - self.start_time) * 90000)  # Unidade de 90kHz para pts
                    
                    # Se a fila estiver cheia, remove o frame mais antigo
                    if self.queue.full():
                        try:
                            self.queue.get_nowait()
                        except queue.Empty:
                            pass
                    
                    # Adiciona o novo frame
                    try:
                        self.queue.put((frame, timestamp), block=False)
                    except queue.Full:
                        pass  # Ignora se estiver cheio, pegará o próximo frame
                else:
                    # Pequena pausa para não sobrecarregar a CPU quando não há frames
                    time.sleep(0.01)
            except Exception as e:
                print(f"Erro ao capturar frame: {e}")
                time.sleep(0.1)  # Pausa antes de tentar novamente

    def _downscale_frame(self, frame):
        """Reduz a qualidade e tamanho da imagem para diminuir uso de CPU"""
        # Reduz resolução
        width = int(frame.shape[1] / self.downscale_factor)
        height = int(frame.shape[0] / self.downscale_factor)
        
        # Usa interpolação mais rápida (INTER_NEAREST é o método mais rápido)
        resized = cv2.resize(frame, (width, height), interpolation=cv2.INTER_NEAREST)
        
        # Opcional: aplica blur para reduzir detalhes (mais compressão)
        if self.quality_reduce > 70:  # Só aplica blur se a redução for significativa
            resized = cv2.GaussianBlur(resized, (3, 3), 0)
            
        # Opcionalmente, converte para escala de cinza para reduzir ainda mais o processamento
        # Se eu quiser tirar as cores:
        # resized = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        # resized = cv2.cvtColor(resized, cv2.COLOR_GRAY2BGR)  # Converte de volta para BGR se necessário
        
        return resized
    
    def stop(self):
        self.running = False
        self.join(timeout=1.0)

class VideoStreamTrack(MediaStreamTrack):
    """Implementação aprimorada de MediaStreamTrack com buffering e redução de qualidade"""
    kind = "video"

    def __init__(self, rtsp_connection, downscale_factor=2.0, frame_skip=2, quality_reduce=50):
        super().__init__()
        self.rtsp_connection = rtsp_connection
        
        # Cria frame grabber com parâmetros de qualidade reduzida
        self.frame_grabber = FrameGrabber(
            rtsp_connection, 
            downscale_factor=downscale_factor,
            frame_skip=frame_skip,
            quality_reduce=quality_reduce
        )
        self.frame_grabber.start()
        self.time_base = fractions.Fraction(1, 90000)  # Base de tempo padrão para vídeo
        
    async def recv(self):
        # Espera até que haja um frame disponível
        while self.frame_grabber.queue.empty():
            await asyncio.sleep(0.01)
        
        # Obtém o próximo frame da fila
        frame, timestamp = self.frame_grabber.queue.get()
        
        # Converte para formato compatível com aiortc
        # Já estamos trabalhando com frames reduzidos, então essa conversão será mais rápida
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Cria um VideoFrame do PyAV
        video_frame = VideoFrame.from_ndarray(frame_rgb, format="rgb24")
        
        # Define o timestamp correto
        video_frame.pts = timestamp
        video_frame.time_base = self.time_base
        
        return video_frame
    
    def stop(self):
        """Método para encerrar corretamente a captura de frames"""
        if self.frame_grabber:
            self.frame_grabber.stop()

class WebRTCConversion:
    def __init__(self, reuse_connection=True, downscale_factor=2.0, frame_skip=2, quality_reduce=50):
        self.pc = None
        self.rtsp_connection = None
        self.video_track = None
        self.reuse_connection = reuse_connection  # Flag para reutilização
        
        # Parâmetros de qualidade
        self.downscale_factor = downscale_factor  # 2.0 = metade da resolução
        self.frame_skip = frame_skip              # 2 = metade dos frames
        self.quality_reduce = quality_reduce      # 0-100 (maior = mais compressão)

    async def connect(self, rtsp_url):
        from rtsp_connection import RTSPConnection
        
        # Se reutilização estiver habilitada, preserva a conexão RTSP
        if not self.rtsp_connection or not self.reuse_connection:
            if self.rtsp_connection:
                self.rtsp_connection.close()
            
            self.rtsp_connection = RTSPConnection(rtsp_url)
            self.rtsp_connection.connect()
        
        # Criação do peer connection
        self.pc = RTCPeerConnection()
        
        # Adiciona a track de vídeo com qualidade reduzida
        self.video_track = VideoStreamTrack(
            self.rtsp_connection,
            downscale_factor=self.downscale_factor,
            frame_skip=self.frame_skip,
            quality_reduce=self.quality_reduce
        )
        self.pc.addTrack(self.video_track)
        
        print(f"WebRTC conectado e configurado com RTSP: {rtsp_url}")
        print(f"Otimizações: downscale={self.downscale_factor}x, skip={self.frame_skip} frames, quality={self.quality_reduce}%")

    async def create_offer(self):
        if not self.pc:
            raise Exception("WebRTC não inicializado. Chame connect() primeiro.")
            
        offer = await self.pc.createOffer()
        await self.pc.setLocalDescription(offer)
        return self.pc.localDescription

    async def process_answer(self, answer):
        if not self.pc:
            raise Exception("WebRTC não inicializado. Chame connect() primeiro.")
            
        await self.pc.setRemoteDescription(answer)
        print("Resposta SDP processada com sucesso")

    async def close(self):
        if self.video_track:
            self.video_track.stop()
            
        if self.rtsp_connection:
            self.rtsp_connection.close()
            
        if self.pc:
            await self.pc.close()
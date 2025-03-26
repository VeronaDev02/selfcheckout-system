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
    """Thread dedicada para capturar frames do RTSP sem bloquear o loop principal"""
    def __init__(self, rtsp_connection, max_queue_size=30):
        super().__init__(daemon=True)
        self.rtsp_connection = rtsp_connection
        self.queue = queue.Queue(maxsize=max_queue_size)
        self.running = True
        self.frame_count = 0
        self.start_time = time.time()
    
    def run(self):
        while self.running:
            try:
                frame = self.rtsp_connection.read_frame()
                if frame is not None:
                    # Se a fila estiver cheia, remova o frame mais antigo
                    if self.queue.full():
                        self.queue.get()
                    
                    # Salva o frame com seu timestamp
                    self.frame_count += 1
                    timestamp = int((time.time() - self.start_time) * 90000)  # Unidade de 90kHz para pts
                    self.queue.put((frame, timestamp))
                else:
                    # Pequena pausa para não sobrecarregar a CPU quando não há frames
                    time.sleep(0.01)
            except Exception as e:
                print(f"Erro ao capturar frame: {e}")
                time.sleep(0.1)  # Pausa antes de tentar novamente
    
    def stop(self):
        self.running = False
        self.join(timeout=1.0)

class VideoStreamTrack(MediaStreamTrack):
    """Implementação aprimorada de MediaStreamTrack com buffering"""
    kind = "video"

    def __init__(self, rtsp_connection):
        super().__init__()
        self.rtsp_connection = rtsp_connection
        self.frame_grabber = FrameGrabber(rtsp_connection)
        self.frame_grabber.start()
        self._last_timestamp = None
        self.time_base = fractions.Fraction(1, 90000)  # Base de tempo padrão para vídeo
        
    async def recv(self):
        # Usa asyncio.to_thread para não bloquear o loop de eventos
        loop = asyncio.get_event_loop()
        
        # Espera até que haja um frame disponível
        while self.frame_grabber.queue.empty():
            await asyncio.sleep(0.01)
        
        # Obtém o próximo frame da fila
        frame, timestamp = self.frame_grabber.queue.get()
        
        # Converte para formato compatível com aiortc
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
    def __init__(self, reuse_connection=True):
        self.pc = None
        self.rtsp_connection = None
        self.video_track = None
        self.reuse_connection = reuse_connection  # Nova flag para reutilização

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
        
        # Adiciona a track de vídeo
        self.video_track = VideoStreamTrack(self.rtsp_connection)
        self.pc.addTrack(self.video_track)
        
        print(f"WebRTC conectado e configurado com RTSP: {rtsp_url}")

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
import cv2

class RTSPConnection:
    def __init__(self, rtsp_url):
        self.rtsp_url = rtsp_url
        self.cap = None

    def connect(self):
        self.cap = cv2.VideoCapture(self.rtsp_url)
        if not self.cap.isOpened():
            raise Exception(f"Não foi possível conectar ao RTSP: {self.rtsp_url}")
        print(f"Conectado ao RTSP: {self.rtsp_url}")

    def read_frame(self):
        if not self.cap.isOpened():
            raise Exception("Conexão RTSP não estabelecida")
        ret, frame = self.cap.read()
        if not ret:
            raise Exception("Falha ao capturar frame RTSP")
        return frame

    def close(self):
        if self.cap:
            self.cap.release()
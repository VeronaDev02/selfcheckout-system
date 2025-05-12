import os
import sys
import subprocess

# Configurar variáveis de ambiente
os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp|timeout;5000000'
os.environ['GST_DEBUG'] = '3'
os.environ['RTSP_TRANSPORT'] = 'tcp'

# Usar o comando 'ip route' para adicionar uma rota temporária para a câmera
try:
    print("Adicionando rota temporária para 192.168.101.250 via br0...")
    subprocess.run(["sudo", "ip", "route", "add", "192.168.101.250/32", "dev", "br0"], check=True)
    print("Rota adicionada com sucesso.")
except subprocess.CalledProcessError as e:
    print(f"Erro ao adicionar rota: {e}")
    # Continuar mesmo se a rota já existir

try:
    print("Iniciando main.py...")
    # Executar o script principal
    exec(open('main.py').read())
except Exception as e:
    print(f"Erro ao executar main.py: {e}")
finally:
    # Remover a rota temporária ao sair
    try:
        print("Removendo rota temporária...")
        subprocess.run(["sudo", "ip", "route", "del", "192.168.101.250/32"], check=False)
        print("Rota removida.")
    except Exception as e:
        print(f"Erro ao remover rota: {e}")

# Para verificar o status:
sudo systemctl status api

# Para parar o serviço:
sudo systemctl stop api

# Para iniciar o serviço:
sudo systemctl start api

# Para reiniciar o serviço:
sudo systemctl restart api

sudo nano /etc/systemd/system/api.service

sudo systemctl daemon-reload
sudo systemctl restart api
sudo systemctl status api
which python3.13 - ver onde

[Unit]
Description=API
After=network.target

[Service]
Type=simple
User=dev
WorkingDirectory=/home/dev/api
ExecStart=/usr/bin/python3.13 /home/dev/api/main.py
Environment="PYTHONUNBUFFERED=1"
Restart=on-failure

[Install]
WantedBy=multi-user.target
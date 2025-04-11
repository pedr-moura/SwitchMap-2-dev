from flask import Flask, jsonify, request
import socket
import logging
import json
import os
import time
import requests
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # Para desenvolvimento

# Configuração de logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Caminho do arquivo dados.json
DATA_FILE = r"A:\SwitchMap 1.0\backend\websocket\dados.json"
# URL do JSON remoto com hostnames confiáveis
TRUSTED_HOSTNAMES_URL = "https://api-security-swmap.vercel.app/APIhosts.json"

# Cache para hostnames confiáveis
trusted_hostnames_cache = None
last_fetch_time = 0
CACHE_DURATION = 300  # 5 minutos em segundos

def load_json_data():
    """Carrega os dados do arquivo dados.json com verificação de atualização."""
    try:
        if not os.path.exists(DATA_FILE):
            logger.error(f"Arquivo {DATA_FILE} não encontrado.")
            return None
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            logger.debug(f"Dados carregados de {DATA_FILE} com sucesso.")
            return data
    except json.JSONDecodeError as e:
        logger.error(f"Erro ao decodificar JSON em {DATA_FILE}: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Erro ao carregar {DATA_FILE}: {str(e)}")
        return None

def fetch_trusted_hostnames():
    """Busca os hostnames confiáveis do endpoint remoto com cache, ignorando validação SSL."""
    global trusted_hostnames_cache, last_fetch_time
    current_time = time.time()

    if trusted_hostnames_cache is not None and (current_time - last_fetch_time) < CACHE_DURATION:
        logger.debug("Usando hostnames confiáveis do cache.")
        return trusted_hostnames_cache

    try:
        response = requests.get(TRUSTED_HOSTNAMES_URL, timeout=5, verify=False)
        response.raise_for_status()
        data = response.json()
        hostnames = data.get("hostnames", [])
        if isinstance(hostnames, list):
            trusted_hostnames_cache = hostnames
            last_fetch_time = current_time
            logger.info(f"Hostnames confiáveis atualizados do endpoint remoto: {hostnames}")
            return hostnames
        else:
            logger.error("A chave 'hostnames' no JSON remoto não contém uma lista válida.")
            return trusted_hostnames_cache or []
    except requests.RequestException as e:
        logger.error(f"Erro ao buscar hostnames de {TRUSTED_HOSTNAMES_URL}: {str(e)}")
        return trusted_hostnames_cache or []
    except json.JSONDecodeError as e:
        logger.error(f"Erro ao decodificar JSON remoto: {str(e)}")
        return trusted_hostnames_cache or []

@app.route("/get-data", methods=["GET"])
def get_data():
    """Endpoint para fornecer dados.json com autenticação por hostname."""
    start_time = time.time()
    try:
        # Resolver hostname do cliente
        hostname_cliente = socket.gethostbyaddr(request.remote_addr)[0] if request.remote_addr else "Desconhecido"
        logger.debug(f"Hostname resolvido para {request.remote_addr}: {hostname_cliente}")
    except socket.herror:
        hostname_cliente = "Desconhecido"
        logger.debug(f"Não foi possível resolver hostname para {request.remote_addr}")

    # Carregar dados do arquivo local
    dados = load_json_data()
    if not dados:
        return jsonify({"erro": "Falha ao carregar dados"}), 500

    # Carregar hostnames confiáveis do endpoint remoto
    hostnames_confiaveis = fetch_trusted_hostnames()

    # Fallback para hostnames do arquivo local se o remoto falhar ou estiver vazio
    if not hostnames_confiaveis:
        hostnames_confiaveis = dados.get("trusted_hostnames", [])
        logger.warning("Usando hostnames confiáveis do arquivo local como fallback.")

    # Converter tudo para minúsculas para comparação case-insensitive
    hostname_cliente_lower = hostname_cliente.lower()
    hostnames_confiaveis_lower = [h.lower() for h in hostnames_confiaveis]
    logger.debug(f"Hostnames confiáveis (lower): {hostnames_confiaveis_lower}")
    logger.debug(f"Hostname cliente (lower): {hostname_cliente_lower}")

    # Verificar autenticação
    if hostname_cliente_lower not in hostnames_confiaveis_lower:
        logger.info(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - 🚫 ACESSO NEGADO para {hostname_cliente}")
        return jsonify({"erro": "Acesso não autorizado"}), 403

    # Adicionar timestamp para indicar a "frescor" dos dados
    dados["timestamp"] = time.strftime('%Y-%m-%d %H:%M:%S')
    dados["source"] = "local_file"

    # Log de sucesso e retorno dos dados
    logger.info(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - ✅ Dados consultados por {hostname_cliente}")
    total_time = time.time() - start_time
    logger.debug(f"Tempo total de /get-data: {total_time:.3f}s")
    return jsonify(dados), 200, {'Cache-Control': 'no-cache'}  # Evita cache no cliente

if __name__ == "__main__":
    # Inicia o servidor Flask
    app.run(host="0.0.0.0", port=5001, debug=True)
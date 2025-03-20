import urllib3
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_socketio import SocketIO, emit
import subprocess
import threading
import time
import socket
import json
import requests
import os

# Desativa os avisos de solicitação HTTPS não verificada
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# Configuração do Flask-Limiter
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

# ASCII Art para exibição no terminal
ascii_art = """
 ____          _ _       _     __  __             
/ ___|_      _(_) |_ ___| |__ |  \/  | __ _ _ __  
\___ \ \ /\ / / | __/ __| '_ \| |\/| |/ _` | '_ \ 
 ___) \ V  V /| | || (__| | | | |  | | (_| | |_) |
|____/ \_/\_/ |_|\__\___|_| |_|_|  |_|\__,_| .__/ 
                                           |_|    
Desenvolvido por Pedro Lucas Sousa Moura
"""
print(ascii_art)

# Caminho para os arquivos
CAMINHO_DADOS_JSON = os.path.join(os.getcwd(), "dados.json")
CAMINHO_RESULTADOS_JSON = r"c:\ENTUITY\resultados.json"
URL_JSON = "https://api-security-swmap.vercel.app/APIhosts.json"

# Lock para evitar race conditions
lock = threading.Lock()

def carregar_dados():
    """Carrega os dados do arquivo dados.json com lock."""
    with lock:
        try:
            with open(CAMINHO_DADOS_JSON, "r", encoding="utf-8") as arquivo:
                return json.load(arquivo)
        except FileNotFoundError:
            print(f"⚠️ Arquivo {CAMINHO_DADOS_JSON} não encontrado. Criando novo arquivo.")
            dados_iniciais = {"hosts": []}
            with open(CAMINHO_DADOS_JSON, "w", encoding="utf-8") as arquivo:
                json.dump(dados_iniciais, arquivo, indent=4, ensure_ascii=False)
            return dados_iniciais
        except json.JSONDecodeError:
            print(f"⚠️ Erro ao decodificar o arquivo {CAMINHO_DADOS_JSON}. Verifique o formato JSON.")
            return {"hosts": []}

# Carrega os dados iniciais
dados = carregar_dados()

def carregar_resultados():
    """Carrega os dados do arquivo resultados.json."""
    try:
        with open(CAMINHO_RESULTADOS_JSON, "r", encoding="utf-8") as arquivo:
            return json.load(arquivo)
    except FileNotFoundError:
        print(f"⚠️ Arquivo {CAMINHO_RESULTADOS_JSON} não encontrado.")
        return []
    except json.JSONDecodeError:
        print(f"⚠️ Erro ao decodificar o arquivo {CAMINHO_RESULTADOS_JSON}. Verifique o formato JSON.")
        return []

def obter_hostnames_confiaveis():
    """Obtém a lista de hostnames confiáveis a partir de um JSON hospedado na web."""
    try:
        response = requests.get(URL_JSON, timeout=5, verify=False)
        if response.status_code == 200:
            return response.json().get("hostnames", [])
        else:
            print(f"⚠️ Erro ao buscar hostnames confiáveis: {response.status_code}")
    except Exception as e:
        print(f"⚠️ Falha ao conectar na URL: {str(e)}")
    return []

def verificar_ping(ip):
    """Executa um ping para verificar se o IP está ativo."""
    try:
        resultado = subprocess.run(["ping", "-n", "1", ip], capture_output=True, text=True)
        return "#00d700" if "Resposta de" in resultado.stdout else "red"
    except Exception:
        return "red"

def atualizar_pings():
    """Atualiza o status dos hosts e suas conexões periodicamente."""
    while True:
        log_entries = []
        dados = carregar_dados()  # Carrega os dados mais recentes do arquivo

        for host in dados.get("hosts", []):
            status_host = verificar_ping(host["ip"])
            host["ativo"] = status_host
            log_entry = f"{time.strftime('%Y-%m-%d %H:%M:%S')} - IP {host['ip']} consultado, status: {status_host}"
            log_entries.append(log_entry)

            if "conexoes" in host:
                for conexao in host["conexoes"]:
                    status_conexao = verificar_ping(conexao["ip"])
                    conexao["ativo"] = status_conexao
                    log_entry = f"{time.strftime('%Y-%m-%d %H:%M:%S')} - Conexão IP {conexao['ip']} consultada, status: {status_conexao}"
                    log_entries.append(log_entry)

        # Salva as alterações no arquivo dados.json com lock
        with lock:
            with open(CAMINHO_DADOS_JSON, "w", encoding="utf-8") as arquivo:
                json.dump(dados, arquivo, indent=4, ensure_ascii=False)

        # Gera logs
        log_file_name = f"log/log_{time.strftime('%Y-%m-%d')}.txt"
        os.makedirs(os.path.dirname(log_file_name), exist_ok=True)
        with open(log_file_name, "a") as log_file:
            for entry in log_entries:
                log_file.write(entry + "\n")

        # Emite os dados atualizados via WebSocket
        socketio.emit('atualizar_dados', dados)

        time.sleep(30)  # Espera 30 segundos antes de verificar novamente

def atualizar_valores_dos_hosts():
    """Atualiza os valores dos hosts com base no arquivo resultados.json."""
    resultados = carregar_resultados()
    if not resultados:
        print("⚠️ Nenhum dado encontrado no arquivo resultados.json.")
        return

    dados = carregar_dados()  # Carrega os dados mais recentes
    for host in dados.get("hosts", []):
        ip_host = host.get("ip")
        for resultado in resultados:
            if resultado.get("IP") == ip_host:
                host["valores"] = resultado.get("Valores", [])
                break

    # Salva as alterações com lock
    with lock:
        with open(CAMINHO_DADOS_JSON, "w", encoding="utf-8") as arquivo:
            json.dump(dados, arquivo, indent=4, ensure_ascii=False)

@app.route("/editar-local", methods=["POST"])
def editar_local():
    """Rota para editar o campo 'local' de um host no arquivo dados.json."""
    try:
        dados_formulario = request.get_json()
        ip = dados_formulario.get("ip")
        novo_local = dados_formulario.get("local")

        if not ip or not novo_local:
            return jsonify({"erro": "IP e local são obrigatórios"}), 400

        dados = carregar_dados()
        host_encontrado = False
        for host in dados.get("hosts", []):
            if host.get("ip") == ip:
                host["local"] = novo_local
                host_encontrado = True
                break

        if not host_encontrado:
            return jsonify({"erro": "Host não encontrado"}), 404

        with lock:
            with open(CAMINHO_DADOS_JSON, "w", encoding="utf-8") as arquivo:
                json.dump(dados, arquivo, indent=4, ensure_ascii=False)

        return jsonify({"mensagem": "Local atualizado com sucesso!"}), 200
    except Exception as e:
        print(f"Erro ao editar local: {str(e)}")
        return jsonify({"erro": "Falha ao editar local"}), 500

@app.route("/", methods=["GET"])
def index():
    """Rota raiz para verificar se o servidor está ativo."""
    return jsonify({"mensagem": "Servidor ativo!"}), 200

@app.route("/status", methods=["GET"])
@limiter.limit("10 per minute")
def obter_status():
    """Retorna o status dos hosts apenas para hostnames autorizados."""
    try:
        try:
            hostname_cliente = socket.gethostbyaddr(request.remote_addr)[0] if request.remote_addr else "Desconhecido"
        except socket.herror:
            hostname_cliente = "Desconhecido"

        hostnames_confiaveis = obter_hostnames_confiaveis()

        if hostname_cliente not in hostnames_confiaveis:
            print(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - 🚫 ACESSO NEGADO para {hostname_cliente} ({request.remote_addr})")
            return jsonify({"erro": "Acesso não autorizado"}), 403

        dados = carregar_dados()
        atualizar_valores_dos_hosts()

        log_entry = f"{time.strftime('%Y-%m-%d %H:%M:%S')} - ✅ API consultada por {hostname_cliente} ({request.remote_addr})"
        print(log_entry)

        return jsonify(dados)
    except Exception as e:
        print(f"Erro ao obter hostname: {str(e)}")
        return jsonify({"erro": "Falha ao obter informações"}), 500

@app.route("/adicionar-host", methods=["POST"])
def adicionar_host():
    """Rota para adicionar um novo host ao arquivo dados.json."""
    try:
        dados_formulario = request.get_json()
        novo_host = {
            "ativo": dados_formulario.get("ativo", "green"),
            "conexoes": dados_formulario.get("conexoes", []),
            "ip": dados_formulario.get("ip"),
            "local": dados_formulario.get("local", ""),
            "nome": dados_formulario.get("nome"),
            "ship": dados_formulario.get("ship", ""),
            "tipo": dados_formulario.get("tipo", "sw")
        }

        if not novo_host["ip"]:
            return jsonify({"erro": "O campo 'ip' é obrigatório"}), 400
        if not novo_host["nome"]:
            return jsonify({"erro": "O campo 'nome' é obrigatório"}), 400

        dados = carregar_dados()
        for host in dados["hosts"]:
            if host["ip"] == novo_host["ip"]:
                return jsonify({"erro": "Já existe um host com este IP"}), 400

        dados["hosts"].append(novo_host)

        with lock:
            with open(CAMINHO_DADOS_JSON, "w", encoding="utf-8") as arquivo:
                json.dump(dados, arquivo, indent=4, ensure_ascii=False)

        return jsonify({"mensagem": "Host adicionado com sucesso!", "host": novo_host}), 201
    except Exception as e:
        print(f"Erro ao adicionar host: {str(e)}")
        return jsonify({"erro": "Falha ao adicionar host"}), 500

@app.route("/editar-host", methods=["PUT"])
def editar_host():
    """Rota para editar um host existente no arquivo dados.json."""
    try:
        dados_formulario = request.get_json()
        ip = dados_formulario.get("ip")
        novos_dados = {
            "ativo": dados_formulario.get("ativo"),
            "conexoes": dados_formulario.get("conexoes"),
            "local": dados_formulario.get("local"),
            "nome": dados_formulario.get("nome"),
            "ship": dados_formulario.get("ship"),
            "tipo": dados_formulario.get("tipo")
        }

        if not ip:
            return jsonify({"erro": "O campo 'ip' é obrigatório"}), 400

        dados = carregar_dados()
        host_encontrado = False
        for host in dados["hosts"]:
            if host["ip"] == ip:
                for chave, valor in novos_dados.items():
                    if valor is not None:  # Atualiza apenas os campos fornecidos
                        host[chave] = valor
                host_encontrado = True
                break

        if not host_encontrado:
            return jsonify({"erro": "Host não encontrado"}), 404

        with lock:
            with open(CAMINHO_DADOS_JSON, "w", encoding="utf-8") as arquivo:
                json.dump(dados, arquivo, indent=4, ensure_ascii=False)

        return jsonify({"mensagem": "Host atualizado com sucesso!", "host": host}), 200
    except Exception as e:
        print(f"Erro ao editar host: {str(e)}")
        return jsonify({"erro": "Falha ao editar host"}), 500

if __name__ == "__main__":
    print("Iniciando thread de atualização de pings...")
    threading.Thread(target=atualizar_pings, daemon=True).start()
    print("Iniciando servidor Flask na porta 5000...")
    try:
        socketio.run(app, host="0.0.0.0", port=5000, debug=False)
    except Exception as e:
        print(f"Erro ao iniciar o servidor: {str(e)}")
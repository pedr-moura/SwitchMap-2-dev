import json
import aiohttp
import os
import time
import logging
import asyncio

logger = logging.getLogger(__name__)

CAMINHO_RESULTADOS_JSON = r"c:\ENTUITY\resultados.json"
URL_JSON = "https://api-security-swmap.vercel.app/APIhosts.json"
HOSTNAMES_FILE = r"c:\ENTUITY\hostnames.json"  # Caminho para o arquivo de hostnames

def carregar_resultados():
    try:
        with open(CAMINHO_RESULTADOS_JSON, "r", encoding="utf-8") as arquivo:
            return json.load(arquivo)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

async def obter_hostnames_confiaveis():
    async with aiohttp.ClientSession() as session:
        try:
            logger.debug(f"Tentando buscar hostnames de {URL_JSON}")
            async with session.get(URL_JSON, timeout=aiohttp.ClientTimeout(total=5), ssl=False) as response:
                logger.debug(f"Resposta do servidor: {response.status}")
                if response.status == 200:
                    data = await response.json()
                    hostnames = data.get("hostnames", [])
                    logger.debug(f"Hostnames recebidos: {hostnames}")
                    return hostnames
                else:
                    logger.error(f"Falha na requisição: Status {response.status}")
                    return []
        except Exception as e:
            logger.error(f"Erro ao buscar hostnames: {type(e).__name__}: {str(e)}")
            return []

def atualizar_valores_dos_hosts(data_manager):
    resultados = carregar_resultados()
    if not resultados:
        return
    dados = data_manager.get_data()
    hosts_dict = {host["ip"]: host for host in dados.get("hosts", [])}
    for resultado in resultados:
        ip = resultado.get("IP")
        if ip in hosts_dict:
            hosts_dict[ip]["valores"] = resultado.get("Valores", [])
    dados["hosts"] = list(hosts_dict.values())
    data_manager.update_data(dados)

def load_hostnames():
    try:
        with open(HOSTNAMES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("hostnames", {})
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.error(f"Erro ao carregar hostnames: {str(e)}")
        return {}
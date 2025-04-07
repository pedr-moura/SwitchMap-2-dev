// Elementos do DOM
const toggleMap = document.getElementById('mudartipo');
const toggleSwView = document.getElementById('toggleShowSwitches');
const toggleDependencias = document.getElementById('toggleLinesButton');
const opcoesTitulo = document.getElementById('opcoes');
const cssSW = document.getElementById('css-sw');
const theme = document.getElementById('theme');
const menuContainer = document.getElementById('menu-container');
// const logoCliente = document.getElementById('logoCliente');
const pontosMapeados = {};

// Estado global
let server = "http://172.16.196.36:5000";
let showIconesMaps = 0;
let showDependencias = 0;
let mapaAtual;
let countChangeTheme = 0; // Começa no tema escuro
let dadosAtuais = { hosts: [] }; // Dados mais recentes
let isEditing = false; // Flag para indicar edição em andamento
let pendingWebSocketUpdate = null; // Armazena atualizações do WebSocket durante edição
let hosts = [];
let janela = 0; // Estado inicial do menu
let map;
let markersLayer;
let linesLayer;
let linesVisible = false;
const objetosVisiveis = {};
let pageLoadTime = performance.now(); // Marca o tempo de início do carregamento da página
let currentPage = 0;
const hostsPerPage = 50; // Número de hosts carregados por vez
let isLoading = false;
let allDisplayedHosts = []; // Array para armazenar todos os hosts filtrados atualmente
let hasMoreHosts = true; // Flag para controlar se existem mais hosts para carregar

// Declaração global das camadas de mapa
const mapaPadraoClaro = L.tileLayer('http://172.16.196.36:3000/tiles/light/{z}/{x}/{y}', { 
    attribution: '© OpenStreetMap © CartoDB' 
});
const mapaPadraoEscuro = L.tileLayer('https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', { 
    attribution: '© OpenStreetMap' 
});
const mapaSatelite = L.tileLayer('http://172.16.196.36:3000/tiles/satellite/{z}/{x}/{y}', { 
    attribution: 'Tiles © Esri' 
});

// Inicialização de elementos
// logoCliente.src = "https://i.ibb.co/3Ysj3mQ3/Captura-de-tela-2025-04-06-130602.png";
toggleDependencias.style.display = "none";
toggleMap.style.display = "none";
opcoesTitulo.style.display = "none";
ocultarSw();

// Telas
function exibirJanela(id) {
    console.log('Exibir janela:', id, 'janela:', janela);
    if (janela == 0) {
        document.getElementById(id).click();
    }
}

// Funções de UI
function exibirToggleMap() {
    toggleMap.style.display = "block";
    opcoesTitulo.style.display = "flex";
}

function ocultarSw() {
    cssSW.innerHTML = `<style>#icone-sw { display: none; }</style>`;
}

// Define uma única função para lidar com a troca de estado
function toggleDependenciasState() {
    showDependencias = showDependencias === 0 ? 1 : 0;
    linesVisible = showDependencias === 1; // Sincroniza as variáveis
    
    // Atualiza a visualização das linhas
    if (linesVisible) {
        linesLayer.addTo(map);
        toggleDependencias.style.border = '3px solid #0303ff';
    } else {
        if (map.hasLayer(linesLayer)) {
            map.removeLayer(linesLayer);
        }
        toggleDependencias.style.border = '1px solid var(--color-secondary)';
    }
    
    console.log('Estado alterado: showDependencias =', showDependencias, 'linesVisible =', linesVisible);
}

// Garantir que o elemento toggleDependencias existe antes de adicionar o evento
document.addEventListener('DOMContentLoaded', function() {
    const toggleDependencias = document.getElementById('toggleLinesButton');
    if (toggleDependencias) {
        // Remove qualquer listener anterior para evitar duplicação
        toggleDependencias.removeEventListener('click', toggleDependenciasState);
        // Adiciona o novo listener
        toggleDependencias.addEventListener('click', toggleDependenciasState);
        console.log('Evento de clique adicionado ao botão toggleDependencias');
    } else {
        console.error('Elemento toggleDependencias não encontrado');
    }
});

// Remover a função toggleLines separada para evitar confusão
// Qualquer chamada a toggleLines() deve ser substituída por toggleDependenciasState()

function toggleLines() {
    linesVisible = !linesVisible;
    if (linesVisible) {
        linesLayer.addTo(map);
        toggleDependencias.style.border = '3px solid #0303ff';
    } else {
        map.removeLayer(linesLayer);
        toggleDependencias.style.border = '1px solid var(--color-secondary)';
    }
}

function showSw() {
    if (showIconesMaps === 0) {
        toggleSwView.style.border = "3px solid rgb(3, 3, 255)";
        toggleDependencias.style.display = "block";
        cssSW.innerHTML = `
            <style>
                #icone-sw {
                    padding: 5px;
                    width: 20px;
                    background-color: rgb(240, 248, 255);
                    border-radius: 50px;
                }
                #icone-sw:hover {
                    opacity: 1;
                    background-color: rgb(222, 219, 219);
                }
            </style>`;
        showIconesMaps = 1;
    } else {
        toggleSwView.style.border = "1px solid var(--color-secondary)";
        toggleDependencias.style.display = "none";
        if (showDependencias === 1) toggleDependencias.click();
        ocultarSw();
        showIconesMaps = 0;
    }
}

function fecharPopups() {
    const buttons = document.getElementsByClassName('leaflet-popup-close-button');
    for (let button of buttons) button.click();
}


// Função para exibir popup de hosts offline
function showRedHostsPopup(dados = dadosAtuais) {
    if (!dados || !dados.hosts || !Array.isArray(dados.hosts)) {
        console.error('Dados inválidos em showRedHostsPopup:', dados);
        document.getElementById('redHostsList').innerHTML = 'Erro ao carregar dados.';
        return;
    }
    const redHosts = dados.hosts.filter(host => host.ativo === "red");
    const redHostsList = document.getElementById('redHostsList');
    redHostsList.innerHTML = redHosts.length === 0 ? 'Sem alertas.' : '';

    redHosts.forEach(host => {
        const buttonLocal = host.local ? `
            <svg width="15" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 16.5974L21.0072 13.4725C22.3309 12.8822 22.3309 11.1178 21.0072 10.5275L4.49746 3.16496C3.00163 2.49789 1.45007 3.97914 2.19099 5.36689L5.34302 11.2706C5.58818 11.7298 5.58817 12.2702 5.34302 12.7294L2.19099 18.6331C1.45006 20.0209 3.00163 21.5021 4.49746 20.835L9.24873 18.7162" stroke="var(--color-primary)" fill="var(--color-secondary)" stroke-width="1.5" stroke-linecap="round"/>
            </svg>` : '';
        const hostItem = document.createElement('div');
        hostItem.className = 'host-item';
        hostItem.innerHTML = `<span style="color:${host.ativo}; display: flex; align-items: center;" onclick="map.flyTo([${host.local}], 18, { duration: 0.5 })"><b>${host.nome}</b> (${host.ip}) ${buttonLocal}</span>`;
        redHostsList.appendChild(hostItem);
    });

    document.getElementById('redHostsPopup').style.display = 'block';
}

// Requisição de dados via HTTP
async function fetchDadosHTTP() {
    try {
        const response = await fetch(`${server}/status`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`Erro na requisição: ${response.status}`);
        const dados = await response.json();
        if (dados && dados.hosts) {
            console.log('Dados carregados via HTTP:', dados);
            dadosAtuais = dados;
            atualizarInterface(dados);
            return dados;
        }
        console.error('Dados inválidos:', dados);
        return null;
    } catch (error) {
        console.error('Erro ao carregar dados via HTTP:', error);
        return null;
    }
}

// Função para pesquisar por IP
// Otimizar a pesquisa
function pesquisarPorIP(hostsArray = dadosAtuais.hosts) {
    const ipBusca = document.getElementById('ipBusca').value.toLowerCase().trim();
    
    if (!ipBusca) return hostsArray;
    
    // Usar um índice para pesquisa mais rápida (pré-calculado)
    if (!window.hostsIndex) {
        // Implementar apenas uma vez ou quando os dados base mudarem
        window.hostsIndex = {};
        hostsArray.forEach((host, index) => {
            const lowerIp = host.ip.toLowerCase();
            const lowerNome = host.nome.toLowerCase();
            
            // Indexar prefixos para pesquisa mais rápida
            for (let i = 1; i <= lowerIp.length; i++) {
                const prefix = lowerIp.substring(0, i);
                if (!window.hostsIndex[prefix]) window.hostsIndex[prefix] = [];
                window.hostsIndex[prefix].push(index);
            }
            
            for (let i = 1; i <= lowerNome.length; i++) {
                const prefix = lowerNome.substring(0, i);
                if (!window.hostsIndex[prefix]) window.hostsIndex[prefix] = [];
                window.hostsIndex[prefix].push(index);
            }
        });
    }
    
    // Usar o índice para pesquisa
    const indices = window.hostsIndex[ipBusca] || [];
    const resultSet = new Set();
    
    indices.forEach(index => {
        if (index < hostsArray.length) {
            resultSet.add(hostsArray[index]);
        }
    });
    
    // Fallback para pesquisa normal se o índice não tiver resultados
    if (resultSet.size === 0) {
        return hostsArray.filter(host => 
            host.ip.toLowerCase().includes(ipBusca) || 
            host.nome.toLowerCase().includes(ipBusca)
        );
    }
    
    return Array.from(resultSet);
}

// Função para pré-carregar linhas
function preloadLines(dados) {
    const pontosMapeados = {};
    linesLayer.clearLayers();

    dados.hosts.forEach(ponto => {
        if (ponto.local) {
            const [lat, lng] = ponto.local.split(', ').map(Number);
            pontosMapeados[ponto.ip] = { lat, lng };
        }
    });

    dados.hosts.forEach(ponto => {
        if (ponto.ship) {
            ponto.ship.split(', ').forEach(ship => {
                if (pontosMapeados[ponto.ip] && pontosMapeados[ship]) {
                    const { lat: lat1, lng: lng1 } = pontosMapeados[ponto.ip];
                    const { lat: lat2, lng: lng2 } = pontosMapeados[ship];
                    L.polyline([[lat1, lng1], [lat2, lng2]], { color: ponto.ativo }).addTo(linesLayer);
                }
            });
        }
    });

    if (linesVisible) {
        linesLayer.addTo(map);
    }
}

// Atualização da interface
function atualizarInterface(dados) {
    dadosAtuais = dados;
    exibirFeedbackDados?.();
    
    const ipBusca = document.getElementById('ipBusca').value.toLowerCase().trim();
    let dadosFiltrados = { hosts: pesquisarPorIP(dados.hosts) };
    
    // Atualizar contadores gerais
    const countEquipamentos = document.getElementById('countEquipamentos');
    const countEquipamentosSemLocal = document.getElementById('countEquipamentosSemLocal');
    
    if (dadosFiltrados.hosts && Array.isArray(dadosFiltrados.hosts)) {
        countEquipamentos.innerHTML = dadosFiltrados.hosts.length;
        countEquipamentosSemLocal.innerHTML = dadosFiltrados.hosts.filter(host => !host.local).length;
    } else {
        console.error('Dados.hosts não é um array:', dadosFiltrados);
        countEquipamentos.innerHTML = '0';
        countEquipamentosSemLocal.innerHTML = '0';
    }
    
    // Agrupar por estado e unidade
    const estadosMap = {};
    dadosFiltrados.hosts.forEach(host => {
        const match = host.nome.match(/^BR-([A-Z]{2})-([A-Z]{3})-([A-Z]{3})/);
        if (match) {
            const estado = match[1];
            const unidade = `${match[2]}-${match[3]}`; // Ex.: "FAB-IMP"
            if (!estadosMap[estado]) {
                estadosMap[estado] = { total: 0, online: 0, offline: 0, unidades: {} };
            }
            if (!estadosMap[estado].unidades[unidade]) {
                estadosMap[estado].unidades[unidade] = { total: 0, online: 0, offline: 0 };
            }
            estadosMap[estado].total += 1;
            estadosMap[estado].unidades[unidade].total += 1;
            if (host.ativo === "#00d700" || host.ativo === "green") {
                estadosMap[estado].online += 1;
                estadosMap[estado].unidades[unidade].online += 1;
            } else if (host.ativo === "red") {
                estadosMap[estado].offline += 1;
                estadosMap[estado].unidades[unidade].offline += 1;
            }
        }
    });

    // Atualizar a lista de estados e unidades
    const estadosList = document.getElementById('estadosList');
    estadosList.innerHTML = ''; // Limpar conteúdo anterior
    Object.entries(estadosMap).forEach(([estado, stats]) => {
        const estadoItem = document.createElement('div');
        estadoItem.className = 'estado-item';
        estadoItem.innerHTML = `
            <div class="estado-header">
                <span class="estado-nome">${estado}</span>
                <span class="total">${stats.total}</span>
                <div class="estado-status">
                    <span class="online">⬤ ${stats.online}</span>
                    <span class="offline">⬤ ${stats.offline}</span>
                </div>
            </div>
            <div class="unidades-list">
                ${Object.entries(stats.unidades)
                    .map(([unidade, unidadeStats]) => `
                        <div class="unidade-item">
                            <span>${unidade}</span>
                            <div class="status">
                                <span class="online">⬤ ${unidadeStats.online}</span>
                                <span class="offline">⬤ ${unidadeStats.offline}</span>
                            </div>
                        </div>
                    `).join('')}
            </div>
        `;
        estadosList.appendChild(estadoItem);

        // Adicionar evento de clique para expandir/colapsar
        const header = estadoItem.querySelector('.estado-header');
        const unidadesList = estadoItem.querySelector('.unidades-list');
        header.addEventListener('click', () => {
            unidadesList.classList.toggle('expanded');
        });
    });

    // Atualizar número total de unidades (estados únicos)
    const countUnidades = document.getElementById('countUnidades');
    countUnidades.innerHTML = Object.keys(estadosMap).length;

    if (!map) {
        inicializarMapa();
    }
    
    atualizarMarcadores(dadosFiltrados.hosts);
    atualizarLinhas(dadosFiltrados.hosts);
    atualizarListas(dadosFiltrados);
}

function atualizarMarcadores(hosts) {
    // Manter um cache de marcadores existentes
    const marcadoresExistentes = {};
    
    // Registrar todos os marcadores atuais
    markersLayer.eachLayer(marker => {
        const options = marker.options;
        if (options.hostId) {
            marcadoresExistentes[options.hostId] = marker;
        }
    });
    
    // Atualizar ou criar marcadores
    hosts.forEach(ponto => {
        if (ponto.local) {
            const [lat, lng] = ponto.local.split(', ').map(Number);
            const hostId = ponto.ip;
            
            // Verificar se já existe um marcador para este host
            if (marcadoresExistentes[hostId]) {
                // Atualizar propriedades do marcador existente se necessário
                const marker = marcadoresExistentes[hostId];
                const maiorValorC = ponto.valores?.filter(v => v.includes('C')).map(v => parseFloat(v.replace('°C', ''))).reduce((a, b) => Math.max(a, b), null);
                const info = ponto.valores ? `<br><br><span style="font-size: 12px; color: gray;">🌡️ Temp: <b>${maiorValorC ? maiorValorC + '°C' : 'N/A'}</b> | 💻 CPU: <b>${ponto.valores[0]}%</b> | 📶 Lat: <b>${ponto.valores[2]}ms</b></span>` : '';
                
                // Atualizar apenas o conteúdo do popup e o ícone se o status mudou
                if (marker.options.status !== ponto.ativo) {
                    marker.setIcon(criarIcone(ponto));
                    marker.setPopupContent(`<b class="nomedosw" style="color: ${ponto.ativo}; ">${ponto.nome} <br> <span class="latitude" style="text-align: center; width: 100%; opacity: 0.5;">${ponto.local}</span><span style="color: var(--color-background);"> "${ponto.observacao}" </span> ${info}</b>`);
                    marker.options.status = ponto.ativo;
                }
                
                // Remover do objeto para sabermos quais ainda precisam ser processados
                delete marcadoresExistentes[hostId];
            } else {
                // Criar novo marcador
                const maiorValorC = ponto.valores?.filter(v => v.includes('C')).map(v => parseFloat(v.replace('°C', ''))).reduce((a, b) => Math.max(a, b), null);
                const info = ponto.valores ? `<br><br><span style="font-size: 12px; color: gray;">🌡️ Temp: <b>${maiorValorC ? maiorValorC + '°C' : 'N/A'}</b> | 💻 CPU: <b>${ponto.valores[0]}%</b> | 📶 Lat: <b>${ponto.valores[2]}ms</b></span>` : '';
                
                const marker = L.marker([lat, lng], { 
                    icon: criarIcone(ponto),
                    hostId: hostId,
                    status: ponto.ativo
                }).addTo(markersLayer)
                .bindPopup(`<b class="nomedosw" style="color: ${ponto.ativo}; ">${ponto.nome} <br> <span class="latitude" style="text-align: center; width: 100%; opacity: 0.5;">${ponto.local}</span><span style="color: var(--color-background);"> "${ponto.observacao}" </span> ${info}</b>`);
                
                pontosMapeados[ponto.ip] = { lat, lng, marker };
            }
        }
    });
    
    // Remover marcadores que não existem mais nos dados
    for (const hostId in marcadoresExistentes) {
        markersLayer.removeLayer(marcadoresExistentes[hostId]);
        delete pontosMapeados[hostId];
    }
}

function atualizarLinhas(hosts) {
    // Preparar as linhas independentemente do estado de visibilidade
    const linhasChave = {};
    const novosHosts = {};
    
    // Mapear todos os pontos primeiro
    hosts.forEach(ponto => {
        if (ponto.local) {
            const [lat, lng] = ponto.local.split(', ').map(Number);
            novosHosts[ponto.ip] = { lat, lng, ativo: ponto.ativo };
        }
    });
    
    // Limpar as linhas existentes
    linesLayer.clearLayers();
    
    // Criar novas linhas
    hosts.forEach(ponto => {
        if (ponto.ship && ponto.local) {
            ponto.ship.split(', ').forEach(ship => {
                if (novosHosts[ponto.ip] && novosHosts[ship]) {
                    const chave = ponto.ip < ship ? `${ponto.ip}-${ship}` : `${ship}-${ponto.ip}`;
                    
                    if (!linhasChave[chave]) {
                        const { lat: lat1, lng: lng1 } = novosHosts[ponto.ip];
                        const { lat: lat2, lng: lng2 } = novosHosts[ship];
                        L.polyline([[lat1, lng1], [lat2, lng2]], { color: ponto.ativo }).addTo(linesLayer);
                        linhasChave[chave] = true;
                    }
                }
            });
        }
    });
    
    // Adicionar ao mapa apenas se estiver visível
    if (linesVisible) {
        if (!map.hasLayer(linesLayer)) {
            linesLayer.addTo(map);
        }
    } else {
        if (map.hasLayer(linesLayer)) {
            map.removeLayer(linesLayer);
        }
    }
}

// Função auxiliar para criar ícones
function criarIcone(ponto) {
    const [lat, lng] = ponto.local.split(', ').map(Number);
    const zindex = ponto.ativo === 'red' ? 'z-index: 99999999999999999999;' : '';
    
    return L.divIcon({
        className: 'custom-marker',
        html: `<img src="https://i.ibb.co/21HsN0y1/sw.png" id="icone-sw" style="border: 2px solid ${ponto.ativo}; ${zindex} box-shadow: inset 0 0 0 1.5px blue; cursor: grab;" onclick="map.flyTo([${lat}, ${lng}], 18, { duration: 0.5 }); fillForm({ip: '${ponto.ip}', nome: '${ponto.nome}', local: '${ponto.local}', tipo: '${ponto.tipo}', ativo: '${ponto.ativo}'})"/>`,
        iconSize: [0, 0],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30]
    });
}

// Inicialização do mapa
function inicializarMapa() {
    map = L.map('map', { 
        maxZoom: 18, 
        minZoom: 4, 
        zoomControl: false, 
        doubleClickZoom: false, 
        attributionControl: false 
    }).setView(visaoDefault || [-15.7883, -47.9292], 4);

    map.on('contextmenu', e => {
        const { lat, lng } = e.latlng;
        L.popup()
            .setLatLng(e.latlng)
            .setContent(`<div onclick="copiarCoordenadas('${lat.toFixed(6)}', '${lng.toFixed(6)}')"><b>${lat.toFixed(6)}, ${lng.toFixed(6)}</b></div>`)
            .openOn(map);
    });

    exibirToggleMap();
    mapaAtual = mapaPadraoEscuro;
    mapaAtual.addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    linesLayer = L.layerGroup();

    document.getElementById('mapToggleImage').addEventListener('click', () => toggleMapView(mapaAtual, mapaSatelite));
    document.getElementById('ipBusca').addEventListener('input', () => {
        atualizarInterface(dadosAtuais); // Atualiza a interface com base no valor atual do input
    });
}

// Funções auxiliares do mapa
function toggleTheme(mapaAtualParam, mapaClaro, mapaEscuro) {
    const isSatelliteActive = map.hasLayer(mapaSatelite);
    const mapToggleImage = document.getElementById('mapToggleImage');

    if (mapaAtualParam === mapaClaro || countChangeTheme === 1) {
        mapaAtual = mapaEscuro;
        countChangeTheme = 2;
        theme.innerHTML = `<style>:root{--color-glass: #16191ec2;--color-background: #16191E;--color-secondary: #404851;--color-primary: #4A87C0;--color-text: #e2e2e2;}</style>`;
        if (isSatelliteActive) mapToggleImage.src = 'https://i.ibb.co/S4xWMD61/map.png';
    } else {
        mapaAtual = mapaClaro;
        countChangeTheme = 1;
        theme.innerHTML = `<style>:root{--color-glass: rgba(241, 246, 255, 0.76);--color-background: #c8c8c8;--color-secondary: rgb(149, 184, 236);--color-primary: rgb(11, 58, 102);--color-text: rgb(71, 69, 69);}</style>`;
        if (isSatelliteActive) mapToggleImage.src = 'https://i.ibb.co/YBD7CMr7/satc.png';
    }

    if (!isSatelliteActive) {
        map.removeLayer(mapaClaro);
        map.removeLayer(mapaEscuro);
        mapaAtual.addTo(map);
    }

    return mapaAtual;
}

function toggleMapView(mapaAtual, mapaSatelite) {
    const isSatelliteActive = map.hasLayer(mapaSatelite);
    const mapToggleImage = document.getElementById('mapToggleImage');

    if (isSatelliteActive) {
        map.removeLayer(mapaSatelite);
        mapaAtual.addTo(map);
        mapToggleImage.src = 'https://i.ibb.co/vv6Zs4vP/sat.png';
    } else {
        map.removeLayer(mapaAtual);
        mapaSatelite.addTo(map);
        mapToggleImage.src = mapaAtual === mapaPadraoEscuro ? 'https://i.ibb.co/S4xWMD61/map.png' : 'https://i.ibb.co/YBD7CMr7/satc.png';
    }
}



// Atualização das listas
function atualizarListas(dados) {
    const listaItensSL = document.getElementById('listaItensSL');
    listaItensSL.innerHTML = '';
    const itensSemLocal = dados.hosts.filter(ponto => !ponto.local);
    document.getElementById('countEquipamentosSemLocal').innerHTML = itensSemLocal.length;
    itensSemLocal.forEach(ponto => {
        const item = document.createElement('div');
        item.className = 'item-sem-local';
        item.innerHTML = `<b style="color: var(--color-primary);">${ponto.nome} <span style="color: ${ponto.ativo};">⁕</span></b><br><span>IP: ${ponto.ip}</span>`;
        listaItensSL.appendChild(item);
    });

    const listaItensOff = document.getElementById('listaItensOff');
    listaItensOff.innerHTML = '';
    const itensComStatusRed = dados.hosts.filter(ponto => ponto.ativo === 'red');
    document.getElementById('alertNum').innerHTML = itensComStatusRed.length;
    itensComStatusRed.forEach(ponto => {
        const item = document.createElement('div');
        item.className = 'item-status-red';
        item.innerHTML = `<b style="color: var(--color-primary);">${ponto.nome} <span style="color: ${ponto.ativo};">⁕</span></b><br><span>Local: ${ponto.local || 'N/A'}</span>`;
        listaItensOff.appendChild(item);
    });
}

// Configuração do WebSocket
function configurarWebSocket() {
    const socket = io(server, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => console.log('Conectado ao WebSocket!'));
    socket.on('atualizar_dados', dados => {
        if (!dados) return console.error('Dados inválidos via WebSocket');
        console.log('Dados via WebSocket:', dados);
        if (isEditing) {
            pendingWebSocketUpdate = dados;
        } else {
            dadosAtuais = dados;
            atualizarInterface(dados);
        }
    });
    socket.on('connect_error', error => console.error('Erro no WebSocket:', error));
    socket.on('disconnect', () => console.log('Desconectado do WebSocket'));
    return socket;
}

// Funções de carregamento de hosts
async function loadHosts() {
    if (dadosAtuais.hosts && dadosAtuais.hosts.length > 0) {
        hosts = dadosAtuais.hosts;
        initializeInfiniteScroll();
        return;
    }
    try {
        const response = await fetch(`${server}/status`);
        const data = await response.json();
        if (!data || !data.hosts) throw new Error('Dados inválidos');
        hosts = data.hosts;
        dadosAtuais = data;
        initializeInfiniteScroll();
    } catch (error) {
        console.error('Erro ao carregar hosts:', error);
        document.getElementById('hostList').innerHTML = 
            '<div class="error-message">Erro ao carregar hosts. Tente novamente mais tarde.</div>';
    }
}

function displayHosts(hosts, isNewSearch = true) {
    const hostList = document.getElementById('hostList');
    
    // Se for uma nova pesquisa, resetamos o estado
    if (isNewSearch) {
        hostList.innerHTML = '';
        currentPage = 0;
        allDisplayedHosts = [...hosts]; // Cópia do array de hosts
        hasMoreHosts = true;
    }
    
    // Se não houver hosts, mostra mensagem
    if (hosts.length === 0) {
        hostList.innerHTML = '<div class="no-hosts">Nenhum host encontrado.</div>';
        return;
    }
    
    // Calcula o intervalo de hosts para exibir
    const startIndex = currentPage * hostsPerPage;
    const endIndex = Math.min(startIndex + hostsPerPage, allDisplayedHosts.length);
    
    // Verifica se há mais hosts para carregar
    hasMoreHosts = endIndex < allDisplayedHosts.length;
    
    // Cria um fragmento para melhor performance
    const fragment = document.createDocumentFragment();
    
    // Adiciona os hosts do intervalo atual
    for (let i = startIndex; i < endIndex; i++) {
        const host = allDisplayedHosts[i];
        const hostItem = document.createElement('div');
        hostItem.className = 'host-item';
        hostItem.innerHTML = `<b style="color: ${host.ativo};">*</b> ${host.ip} - ${host.nome}`;
        hostItem.onclick = () => {
            fillForm(host);
            if (host.local) {
                const [lat, lng] = host.local.split(', ').map(Number);
                map.flyTo([lat, lng], 18, { duration: 0.5 });
                // Encontrar o marcador correspondente de forma mais eficiente
                if (pontosMapeados[host.ip] && pontosMapeados[host.ip].marker) {
                    pontosMapeados[host.ip].marker.openPopup();
                }
            }
        };
        fragment.appendChild(hostItem);
    }
    
    // Se for primeira página, substitui o conteúdo, senão adiciona ao final
    if (isNewSearch) {
        hostList.innerHTML = '';
    }
    
    hostList.appendChild(fragment);
    currentPage++;
    isLoading = false;
    
    // Adiciona indicador de carregamento se houver mais hosts
    if (hasMoreHosts) {
        const loadingIndicator = document.getElementById('loading-indicator');
        if (!loadingIndicator) {
            const indicator = document.createElement('div');
            indicator.id = 'loading-indicator';
            indicator.className = 'loading-indicator';
            indicator.textContent = 'Carregando mais...';
            hostList.appendChild(indicator);
        }
    } else {
        // Remove o indicador se não houver mais hosts
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
        
        // Adicionar indicador de fim da lista se houver muitos hosts
        if (allDisplayedHosts.length > hostsPerPage) {
            const endIndicator = document.createElement('div');
            endIndicator.className = 'end-indicator';
            endIndicator.textContent = `Fim da lista - ${allDisplayedHosts.length} hosts encontrados`;
            hostList.appendChild(endIndicator);
        }
    }
}
// Função para carregar mais hosts quando o scroll chegar ao fim
function loadMoreHosts() {
    if (!isLoading && hasMoreHosts) {
        isLoading = true;
        // Simulamos uma pequena latência para mostrar o indicador de carregamento
        setTimeout(() => {
            displayHosts(allDisplayedHosts, false);
        }, 200);
    }
}

// Configurar o evento de scroll para o containerHostList (ou o elemento que contém hostList)
function setupInfiniteScroll() {
    const containerHostList = document.getElementById('hostList').parentElement;
    
    containerHostList.addEventListener('scroll', () => {
        // Verifica se o scroll chegou perto do fim (últimos 150px)
        if (containerHostList.scrollHeight - containerHostList.scrollTop - containerHostList.clientHeight < 150) {
            loadMoreHosts();
        }
    });
    
    // Adicionar CSS para o indicador de carregamento
    const style = document.createElement('style');
    style.textContent = `
        .loading-indicator {
            text-align: center;
            padding: 10px;
            color: var(--color-primary);
            font-size: 14px;
        }
        .end-indicator {
            text-align: center;
            padding: 10px;
            color: var(--color-secondary);
            font-size: 12px;
            opacity: 0.8;
        }
        /* Adicionar estilo para dar feedback visual quando o host é clicado */
        .host-item {
            transition: background-color 0.3s ease;
        }
        .host-item:hover {
            background-color: rgba(var(--color-primary-rgb, 74, 135, 192), 0.1);
        }
        .host-item:active {
            background-color: rgba(var(--color-primary-rgb, 74, 135, 192), 0.2);
        }
    `;
    document.head.appendChild(style);
}


function filterHosts() {
    const searchText = document.getElementById('search').value.toLowerCase().trim();
    const showOnlyWithoutLocation = document.getElementById('showOnlyWithoutLocation').checked;
    
    // Definir um limite para busca em tempo real para conjuntos muito grandes
    const isLargeDataset = hosts.length > 1000;
    
    // Se for uma base de dados muito grande e a busca for menor que 3 caracteres, 
    // exigir pelo menos 3 caracteres para iniciar a busca
    if (isLargeDataset && searchText.length > 0 && searchText.length < 3) {
        document.getElementById('hostList').innerHTML = 
            '<div class="search-instruction">Digite pelo menos 3 caracteres para buscar em uma base grande.</div>';
        return;
    }
    
    // Se a busca estiver vazia e estiver mostrando apenas sem localização, 
    // usar um subconjunto para desempenho
    let filteredHosts;
    if (!searchText && showOnlyWithoutLocation) {
        filteredHosts = hosts.filter(host => !host.local || host.local.trim() === '');
    } else if (!searchText && !showOnlyWithoutLocation) {
        // Se não houver busca e não estiver filtrando por localização, 
        // mostrar apenas os primeiros X hosts para performance
        filteredHosts = hosts.slice(0, 200);
        if (hosts.length > 200) {
            // Adicionar um aviso de que é necessário buscar para ver mais
            setTimeout(() => {
                const hostList = document.getElementById('hostList');
                const endNote = document.createElement('div');
                endNote.className = 'end-indicator';
                endNote.innerHTML = `Mostrando os primeiros 200 de ${hosts.length} hosts.<br>Use a busca para filtrar.`;
                hostList.appendChild(endNote);
            }, 100);
        }
    } else {
        // Busca normal com filtros
        filteredHosts = hosts.filter(host => {
            const matchesSearch = host.nome.toLowerCase().includes(searchText) || 
                                 host.ip.toLowerCase().includes(searchText);
            const hasNoLocation = !host.local || host.local.trim() === '';
            return showOnlyWithoutLocation ? matchesSearch && hasNoLocation : matchesSearch;
        });
    }
    
    // Usar o sistema de scroll infinito para exibir os hosts
    displayHosts(filteredHosts, true);
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

function setupSearchFilter() {
    const debouncedFilterHosts = debounce(filterHosts, 300);
    
    document.getElementById('search').addEventListener('input', debouncedFilterHosts);
    document.getElementById('showOnlyWithoutLocation')?.addEventListener('change', filterHosts);
    
    // Adicionar evento de limpeza para o campo de busca
    const searchInput = document.getElementById('search');
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'clear-search';
    clearButton.innerHTML = '&times;';
    clearButton.style.display = 'none';
    clearButton.onclick = () => {
        searchInput.value = '';
        clearButton.style.display = 'none';
        filterHosts();
    };
    
    searchInput.parentNode.style.position = 'relative';
    searchInput.parentNode.appendChild(clearButton);
    
    // Mostrar/ocultar botão de limpar
    searchInput.addEventListener('input', () => {
        clearButton.style.display = searchInput.value ? 'block' : 'none';
    });
    
    // Estilo para o botão de limpar
    const style = document.createElement('style');
    style.textContent = `
        .clear-search {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: var(--color-secondary);
            font-size: 18px;
            cursor: pointer;
            padding: 0;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
        }
        .clear-search:hover {
            background-color: rgba(var(--color-secondary-rgb, 64, 72, 81), 0.1);
        }
    `;
    document.head.appendChild(style);
}

// Inicialização para scroll infinito
function initializeInfiniteScroll() {
    setupInfiniteScroll();
    setupSearchFilter();
    // Fazer a primeira carga de dados
    filterHosts();
}


function fillForm(host) {
    document.getElementById('ip').value = host.ip;
    document.getElementById('nome').value = host.nome;
    document.getElementById('local').value = host.local || '';
    document.getElementById('ativo').value = host.ativo === "#00d700" ? "green" : "red";
}

// Inicialização
async function carregarDados() {
    await fetchDadosHTTP();
    configurarWebSocket();
    await loadHosts();
}

async function atualizarDadosManualmente() {
    console.log('Atualização manual solicitada');
    const novosDados = await fetchDadosHTTP();
    if (novosDados) {
        console.log('Dados atualizados manualmente');
    }
}

function copiarCoordenadas(lat, lng) {
    navigator.clipboard.writeText(`${lat}, ${lng}`)
        .then(() => {
            exibirFeedbackCopia?.();
            fecharPopups();
        })
        .catch(err => console.error('Erro ao copiar coordenadas:', err));
}

// Configuração do menu de atalhos
menuContainer.innerHTML = `
    <div class="menu-list" onclick="map.flyTo([-15.7883, -47.9292], 4, { duration: 0.5 })"><b>Mapa geral</b></div>
    <div class="menu-list" onclick="map.flyTo(imperatriz, 17, { duration: 0.5 })">Fabrica Imperatriz</div>
    <div class="menu-list" onclick="map.flyTo(belem, 17, { duration: 0.5 })">Fabrica Belem</div>
    <div class="menu-list" onclick="map.flyTo(aracruz, 17, { duration: 0.5 })">Fabrica Aracruz</div>
    <div class="menu-list" onclick="map.flyTo(mucuri, 17, { duration: 0.5 })">Fabrica Mucuri</div>
`;

// Inicialização
carregarDados();

// Evento de toggle theme (removido do HTML, adicionado aqui se necessário)
document.getElementById('toggleThemeButton')?.addEventListener('click', () => {
    mapaAtual = toggleTheme(mapaAtual, mapaPadraoClaro, mapaPadraoEscuro);
});

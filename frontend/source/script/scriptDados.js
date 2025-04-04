// Elementos do DOM
const toggleMap = document.getElementById('mudartipo');
const toggleSwView = document.getElementById('toggleShowSwitches');
const toggleDependencias = document.getElementById('toggleLinesButton');
const opcoesTitulo = document.getElementById('opcoes');
const cssSW = document.getElementById('css-sw');
const theme = document.getElementById('theme');
const menuContainer = document.getElementById('menu-container');
const logoCliente = document.getElementById('logoCliente');

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

// Declaração global das camadas de mapa
const mapaPadraoClaro = L.tileLayer('http://172.16.196.36:3000/tiles/light/{z}/{x}/{y}', { 
    attribution: '© OpenStreetMap © CartoDB' 
});
const mapaPadraoEscuro = L.tileLayer('http://172.16.196.36:3000/tiles/dark/{z}/{x}/{y}', { 
    attribution: '© OpenStreetMap' 
});
const mapaSatelite = L.tileLayer('http://172.16.196.36:3000/tiles/satellite/{z}/{x}/{y}', { 
    attribution: 'Tiles © Esri' 
});

// Inicialização de elementos
logoCliente.src = "https://i.ibb.co/YBjYFc2W/SUZ-BIG-a2c344f0.png";
toggleDependencias.style.display = "none";
toggleMap.style.display = "none";
opcoesTitulo.style.display = "none";
ocultarSw();

// Telas
function exibirJanela(id) {
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

function toggleDependenciasState() {
    showDependencias = showDependencias === 0 ? 1 : 0;
    toggleLines(); // Chama a função de alternar linhas
}

toggleDependencias.addEventListener('click', toggleDependenciasState);

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
function pesquisarPorIP(hostsArray = dadosAtuais.hosts) {
    const ipBusca = document.getElementById('ipBusca').value.toLowerCase().trim();
    if (!ipBusca) return hostsArray; // Retorna todos os hosts se o campo estiver vazio
    return hostsArray.filter(host => 
        host.ip.toLowerCase().includes(ipBusca) || 
        host.nome.toLowerCase().includes(ipBusca)
    );
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
    let dadosFiltrados = { hosts: pesquisarPorIP(dados.hosts) }; // Sempre filtra com base no input atual

    const countEquipamentos = document.getElementById('countEquipamentos');
    const countUnidades = document.getElementById('countUnidades');
    if (dadosFiltrados.hosts && Array.isArray(dadosFiltrados.hosts)) {
        countEquipamentos.innerHTML = dadosFiltrados.hosts.length;
        const nomesUnicos = new Set(dadosFiltrados.hosts.map(host => host.nome.split('SW')[0]));
        countUnidades.innerHTML = nomesUnicos.size;
    } else {
        console.error('Dados.hosts não é um array:', dadosFiltrados);
        countEquipamentos.innerHTML = '0';
        countUnidades.innerHTML = '0';
    }

    if (!map) {
        inicializarMapa();
    } else {
        markersLayer.clearLayers();
    }

    const pontosMapeados = {};
    dadosFiltrados.hosts.forEach(ponto => {
        if (ponto.local) {
            const [lat, lng] = ponto.local.split(', ').map(Number);
            const zindex = ponto.ativo === 'red' ? 'z-index: 99999999999999999999;' : '';
            const maiorValorC = ponto.valores?.filter(v => v.includes('C')).map(v => parseFloat(v.replace('°C', ''))).reduce((a, b) => Math.max(a, b), null);

            const iconeCustomizado = L.divIcon({
                className: 'custom-marker',
                html: `<img src="https://i.ibb.co/21HsN0y1/sw.png" id="icone-sw" style="border: 2px solid ${ponto.ativo}; ${zindex} box-shadow: inset 0 0 0 1.5px blue; cursor: grab;" onclick="map.flyTo([${lat}, ${lng}], 18, { duration: 0.5 }); fillForm({ip: '${ponto.ip}', nome: '${ponto.nome}', local: '${ponto.local}', tipo: '${ponto.tipo}', ativo: '${ponto.ativo}'})"/>`,
                iconSize: [0, 0],
                iconAnchor: [15, 30],
                popupAnchor: [0, -30]
            });
            
            const info = ponto.valores ? `<br><br><span style="font-size: 12px; color: gray;">🌡️ Temp: <b>${maiorValorC ? maiorValorC + '°C' : 'N/A'}</b> | 💻 CPU: <b>${ponto.valores[0]}%</b> | 📶 Lat: <b>${ponto.valores[2]}ms</b></span>` : '';
            const marker = L.marker([lat, lng], { icon: iconeCustomizado }).addTo(markersLayer)
                .bindPopup(`<b class="nomedosw" style="color: ${ponto.ativo}; ">${ponto.nome} <br> <span class="latitude" style="text-align: center; width: 100%; opacity: 0.5;">${ponto.local}</span><span style="color: var(--color-background);"> ${ponto.observacao} </span> ${info}</b>`);
            pontosMapeados[ponto.ip] = { lat, lng, marker };
        }
    });

    preloadLines(dadosFiltrados);
    atualizarListas(dadosFiltrados);
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
        displayHosts(hosts);
        return;
    }
    try {
        const response = await fetch(`${server}/status`);
        const data = await response.json();
        if (!data || !data.hosts) throw new Error('Dados inválidos');
        hosts = data.hosts;
        dadosAtuais = data;
        displayHosts(hosts);
    } catch (error) {
        console.error('Erro ao carregar hosts:', error);
    }
}

function displayHosts(hosts) {
    const hostList = document.getElementById('hostList');
    hostList.innerHTML = hosts.length === 0 ? '<div class="no-hosts">Nenhum host encontrado.</div>' : '';

    hosts.forEach(host => {
        const hostItem = document.createElement('div');
        hostItem.className = 'host-item';
        hostItem.innerHTML = `<b style="color: ${host.ativo};">*</b> ${host.ip}`;
        hostItem.onclick = () => {
            fillForm(host);
            if (host.local) {
                const [lat, lng] = host.local.split(', ').map(Number);
                map.flyTo([lat, lng], 18, { duration: 0.5 });
            }
        };
        hostList.appendChild(hostItem);
    });
}

function filterHosts() {
    const searchText = document.getElementById('search').value.toLowerCase();
    const showOnlyWithoutLocation = document.getElementById('showOnlyWithoutLocation').checked;

    const filteredHosts = hosts.filter(host => {
        const matchesSearch = host.nome.toLowerCase().includes(searchText) || host.ip.toLowerCase().includes(searchText);
        const hasNoLocation = !host.local || host.local.trim() === '';
        return showOnlyWithoutLocation ? matchesSearch && hasNoLocation : matchesSearch;
    });

    displayHosts(filteredHosts);
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
`;

// Inicialização
carregarDados();

// Evento de toggle theme (removido do HTML, adicionado aqui se necessário)
document.getElementById('toggleThemeButton')?.addEventListener('click', () => {
    mapaAtual = toggleTheme(mapaAtual, mapaPadraoClaro, mapaPadraoEscuro);
});

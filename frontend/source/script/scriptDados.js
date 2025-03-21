// Elementos do DOM
const toggleMap = document.getElementById('mudartipo');
const toggleSwView = document.getElementById('toggleShowSwitches');
const toggleDependencias = document.getElementById('toggleLinesButton');
const opcoesTitulo = document.getElementById('opcoes');
const cssSW = document.getElementById('css-sw');
const theme = document.getElementById('theme');
const menuContainer = document.getElementById('menu-container');
const logoCliente = document.getElementById('logoCliente').src = "https://i.ibb.co/YBjYFc2W/SUZ-BIG-a2c344f0.png";

// Estado global
let server = "http://172.16.196.36:5000";
let showIconesMaps = 0;
let showDependencias = 0;
let mapaAtual;
let countChangeTheme = 0; // Começa no tema escuro
let dadosAtuais = { hosts: [] }; // Dados mais recentes
let isEditing = false; // Flag para indicar que uma edição está em andamento
let pendingWebSocketUpdate = null; // Armazena atualizações do WebSocket enquanto a edição está em andamento
let hosts = []; 

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
toggleDependencias.style.display = "none";
toggleMap.style.display = "none";
opcoesTitulo.style.display = "none";
ocultarSw();

function precarregarTilesRegioes(hosts) {
    const tileLayer = mapaAtual; // Usa o mapa atual (claro, escuro ou satélite)
    hosts.forEach(host => {
        if (host.local) {
            const [lat, lng] = host.local.split(', ').map(Number);
            const bounds = L.latLngBounds(
                [lat - 0.01, lng - 0.01], // Canto inferior esquerdo
                [lat + 0.01, lng + 0.01]  // Canto superior direito
            );
            // Força o Leaflet a carregar os tiles dessa área
            map.eachLayer(layer => {
                if (layer instanceof L.TileLayer) {
                    layer.getTileUrl({ latlng: { lat, lng }, z: 18 }); // Simula requisição para o nível de zoom desejado
                }
            });
        }
    });
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
        linesLayer.clearLayers();
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
        console.error('Dados inválidos passados para showRedHostsPopup:', dados);
        const redHostsList = document.getElementById('redHostsList');
        redHostsList.innerHTML = 'Erro ao carregar dados.';
        return;
    }
    const redHosts = dados.hosts.filter(host => host.ativo === "red");
    const redHostsList = document.getElementById('redHostsList');
    redHostsList.innerHTML = redHosts.length === 0 ? 'Sem alertas.' : '';

    redHosts.forEach(host => {
        const buttonLocal = host.local ? `<svg width="15" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M14 16.5974L21.0072 13.4725C22.3309 12.8822 22.3309 11.1178 21.0072 10.5275L4.49746 3.16496C3.00163 2.49789 1.45007 3.97914 2.19099 5.36689L5.34302 11.2706C5.58818 11.7298 5.58817 12.2702 5.34302 12.7294L2.19099 18.6331C1.45006 20.0209 3.00163 21.5021 4.49746 20.835L9.24873 18.7162" stroke="var(--color-primary)"  fill="var(--color-secondary)" stroke-width="1.5" stroke-linecap="round"/>
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

// Atualização da interface (ajustada)
function atualizarInterface(dados) {
    dadosAtuais = dados;
    // Remova ou comente limparInput se ele estiver limpando o campo #ipBusca
    // limparInput?.(); // <- Certifique-se de que isso não limpe o #ipBusca
    exibirFeedbackDados?.();

    const ipBusca = document.getElementById('ipBusca').value.toLowerCase();
    let dadosFiltrados = dados;
    if (ipBusca) {
        dadosFiltrados = { hosts: pesquisarPorIP(dados.hosts) };
    }

    const countEquipamentos = document.getElementById('countEquipamentos');
    const countUnidades = document.getElementById('countUnidades');
    if (dadosFiltrados.hosts && Array.isArray(dadosFiltrados.hosts)) {
        countEquipamentos.innerHTML = dadosFiltrados.hosts.length;
        const nomesUnicos = new Set(dadosFiltrados.hosts.map(host => host.nome.split('SW')[0]));
        countUnidades.innerHTML = nomesUnicos.size;
    } else {
        console.error('Dados.hosts não é um array:', dadosFiltrados);
        countEquipamentos.innerHTML = '0';
    }

    if (!map) {
        inicializarMapa();
    } else {
        markersLayer.clearLayers();
        linesLayer.clearLayers();
    }

    const pontosMapeados = {};
    dadosFiltrados.hosts.forEach(ponto => {
        if (ponto.local) {
            const [lat, lng] = ponto.local.split(', ').map(Number);
            const zindex = ponto.ativo === 'red' ? 'z-index: 99999999999999999999;' : '';
            const maiorValorC = ponto.valores?.filter(v => v.includes('C')).map(parseFloat).reduce((a, b) => Math.max(a, b), null);

            const iconeCustomizado = L.divIcon({
                className: 'custom-marker',
                html: `<img src="https://i.ibb.co/21HsN0y1/sw.png" id="icone-sw" style="border: 2px solid ${ponto.ativo}; ${zindex} box-shadow: inset 0 0 0 1.5px blue; cursor: grab;" onclick="map.flyTo([${lat}, ${lng}], 18, { duration: 0.5 }); fillForm({ip: '${ponto.ip}', nome: '${ponto.nome}', local: '${ponto.local}', tipo: '${ponto.tipo}', ativo: '${ponto.ativo}'})"/>`,
                iconSize: [0, 0],
                iconAnchor: [15, 30],
                popupAnchor: [0, -30]
            });
            
            const info = ponto.valores ? `<br><br><span style="font-size: 12px; color: gray;">🌡️ Temp: <b>${maiorValorC ? maiorValorC + '°C' : 'N/A'}</b> | 💻 CPU: <b>${ponto.valores[0]}%</b> | 📶 Lat: <b>${ponto.valores[2]}ms</b></span>` : '';
            const marker = L.marker([lat, lng], { icon: iconeCustomizado }).addTo(markersLayer)
                .bindPopup(`<b class="nomedosw" style="color: ${ponto.ativo};">${ponto.nome} <br> <span class="latitude">${ponto.local}</span> ${info}</b>`);
            pontosMapeados[ponto.ip] = { lat, lng, marker };
        }
    });

    dadosFiltrados.hosts.forEach(ponto => {
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

    atualizarListas(dadosFiltrados); // Usa os dados filtrados
}

// Inicialização do mapa
function inicializarMapa() {
    // Remove the 'map =' declaration here and just assign to the global 'map'
    map = L.map('map', { 
        maxZoom: 18, 
        minZoom: 4, 
        zoomControl: false, 
        doubleClickZoom: false, 
        attributionControl: false 
    }).setView(visaoDefault, 4);

    map.on('contextmenu', e => {
        const { lat, lng } = e.latlng;
        L.popup()
            .setLatLng(e.latlng)
            .setContent(`<div onclick="copiarCoordenadas('${lat.toFixed(6)}', '${lng.toFixed(6)}')"><b>${lat.toFixed(6)}, ${lng.toFixed(6)}</b></div>`)
            .openOn(map);
    });

    exibirToggleMap();
    mapaAtual = mapaPadraoEscuro; // Define o mapa inicial como escuro
    mapaAtual.addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    linesLayer = L.layerGroup();

    document.getElementById('toggleThemeButton').addEventListener('click', () => mapaAtual = toggleTheme(mapaAtual, mapaPadraoClaro, mapaPadraoEscuro));
    document.getElementById('mapToggleImage').addEventListener('click', () => toggleMapView(mapaAtual, mapaSatelite));
    // document.getElementById('ipBusca').addEventListener('input', () => pesquisarPorIP(dadosAtuais.hosts));
    document.getElementById('toggleLinesButton').addEventListener('click', toggleLines);
    // Evento de input 
    document.getElementById('ipBusca').addEventListener('input', () => {
        const ipBusca = document.getElementById('ipBusca').value.toLowerCase();
        if (ipBusca) {
            const hostsFiltrados = pesquisarPorIP(dadosAtuais.hosts);
            atualizarInterface({ hosts: hostsFiltrados });
        } else {
            atualizarDadosManualmente()
            atualizarInterface(dadosAtuais); // Restaura os dados completos quando o campo é limpo
        }
});
}



// Funções auxiliares do mapa ajustadas
function toggleTheme(mapaAtualParam, mapaClaro, mapaEscuro) {
    console.log('toggletheme usado');
    
    const isSatelliteActive = map.hasLayer(mapaSatelite);
    const mapToggleImage = document.getElementById('mapToggleImage');
    
    if (mapaAtualParam === mapaClaro || countChangeTheme === 1) {
        // Mudando para tema escuro
        mapaAtual = mapaEscuro; // Atualiza o mapa padrão para escuro
        countChangeTheme = 2;
        document.getElementById('toggleThemeButton').innerHTML = `<svg viewBox="0 0 24 24" fill="var(--color-text)" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="M3.39703 11.6315C3.39703 16.602 7.42647 20.6315 12.397 20.6315C15.6858 20.6315 18.5656 18.8664 20.1358 16.23C16.7285 17.3289 12.6922 16.7548 9.98282 14.0455C7.25201 11.3146 6.72603 7.28415 7.86703 3.89293C5.20697 5.47927 3.39703 8.38932 3.39703 11.6315ZM21.187 13.5851C22.0125 13.1021 23.255 13.6488 23 14.5706C21.7144 19.2187 17.4543 22.6315 12.397 22.6315C6.3219 22.6315 1.39703 17.7066 1.39703 11.6315C1.39703 6.58874 4.93533 2.25845 9.61528 0.999986C10.5393 0.751502 11.0645 1.99378 10.5641 2.80935C8.70026 5.84656 8.83194 10.0661 11.397 12.6312C13.9319 15.1662 18.1365 15.3702 21.187 13.5851Z"/></svg>`;
        theme.innerHTML = `<style>:root{--color-glass: #16191ec2;--color-background: #16191E;--color-secondary: #404851;--color-primary: #4A87C0;--color-text: #e2e2e2;}</style>`;
        if (isSatelliteActive) {
            mapToggleImage.src = 'https://i.ibb.co/S4xWMD61/map.png'; // Ícone escuro quando em satélite
        }
    } else {
        // Mudando para tema claro
        mapaAtual = mapaClaro; // Atualiza o mapa padrão para claro
        countChangeTheme = 1;
        document.getElementById('toggleThemeButton').innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.28451 10.3333C7.10026 10.8546 7 11.4156 7 12C7 14.7614 9.23858 17 12 17C14.7614 17 17 14.7614 17 12C17 9.23858 14.7614 7 12 7C11.4156 7 10.8546 7.10026 10.3333 7.28451" stroke-width="1.5" stroke-linecap="round"/><path d="M12 2V4" stroke-width="1.5" stroke-linecap="round"/><path d="M12 20V22" stroke-width="1.5" stroke-linecap="round"/><path d="M4 12L2 12" stroke-width="1.5" stroke-linecap="round"/><path d="M22 12L20 12" stroke-width="1.5" stroke-linecap="round"/><path d="M19.7778 4.22266L17.5558 6.25424" stroke-width="1.5" stroke-linecap="round"/><path d="M4.22217 4.22266L6.44418 6.25424" stroke-width="1.5" stroke-linecap="round"/><path d="M6.44434 17.5557L4.22211 19.7779" stroke-width="1.5" stroke-linecap="round"/><path d="M19.7778 19.7773L17.5558 17.5551" stroke-width="1.5" stroke-linecap="round"/></svg>`;
        theme.innerHTML = `<style>:root{--color-glass: rgba(241, 246, 255, 0.76);--color-background: #c8c8c8;--color-secondary: rgb(149, 184, 236);--color-primary: rgb(11, 58, 102);--color-text: rgb(71, 69, 69);}</style>`;
        if (isSatelliteActive) {
            mapToggleImage.src = 'https://i.ibb.co/YBD7CMr7/satc.png'; // Ícone claro quando em satélite
        }
    }

    // Só atualiza o mapa se não estiver em modo satélite
    if (!isSatelliteActive) {
        if (map.hasLayer(mapaClaro)) map.removeLayer(mapaClaro);
        if (map.hasLayer(mapaEscuro)) map.removeLayer(mapaEscuro);
        mapaAtual.addTo(map);
    }

    return mapaAtual;
}

mapaAtual = mapaPadraoEscuro; // Mapa padrão inicial

function toggleMapView(mapaAtual, mapaSatelite) {
    console.log('toggleMapView usado');
    const isSatelliteActive = map.hasLayer(mapaSatelite);
    const mapToggleImage = document.getElementById('mapToggleImage');

    if (isSatelliteActive) {
        map.removeLayer(mapaSatelite);
        if (map.hasLayer(mapaPadraoClaro)) map.removeLayer(mapaPadraoClaro);
        if (map.hasLayer(mapaPadraoEscuro)) map.removeLayer(mapaPadraoEscuro);
        mapaAtual.addTo(map); // Volta para o mapa padrão atual (claro ou escuro)
        mapToggleImage.src = 'https://i.ibb.co/vv6Zs4vP/sat.png'; // Ícone indicando satélite disponível
    } else {
        map.removeLayer(mapaAtual);
        mapaSatelite.addTo(map); // Muda para satélite
        mapToggleImage.src = mapaAtual === mapaPadraoEscuro ? 'https://i.ibb.co/S4xWMD61/map.png' : 'https://i.ibb.co/YBD7CMr7/satc.png'; // Ícone baseado no tema atual
    }
}

function toggleLines() {
    linesVisible = !linesVisible;
    const toggleLinesButton = document.getElementById('toggleLinesButton');
    if (linesVisible) {
        linesLayer.addTo(map);
        toggleLinesButton.style.border = '3px solid #0303ff';
    } else {
        map.removeLayer(linesLayer);
        toggleLinesButton.style.border = '1px solid var(--color-secondary)';
    }
}

// Atualização das listas de equipamentos
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

// Configuração do WebSocket (ajustada)
function configurarWebSocket() {
    const socket = io(`${server}`, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => console.log('Conectado ao WebSocket do servidor!'));
    socket.on('atualizar_dados', dados => {
        if (!dados) return console.error('Dados recebidos inválidos via WebSocket');
        console.log('Dados recebidos via WebSocket:', dados);
        
        if (isEditing) {
            // Se uma edição está em andamento, armazena os dados para processar depois
            pendingWebSocketUpdate = dados;
        } else {
            // Processa a atualização imediatamente
            dadosAtuais = dados;
            atualizarInterface(dados);
        }
    });
    socket.on('connect_error', error => console.error('Erro de conexão com o WebSocket:', error));
    socket.on('disconnect', () => console.log('Desconectado do WebSocket'));

    return socket;
}

// Função para carregar hosts
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
        dadosAtuais = data; // Sync with global state
        displayHosts(hosts);
    } catch (error) {
        console.error('Erro ao carregar hosts:', error);
    }
}

// Função para exibir hosts
function displayHosts(hosts) {
    const hostList = document.getElementById('hostList');
    hostList.innerHTML = '';

    if (hosts.length === 0) {
        hostList.innerHTML = '<div class="no-hosts">Nenhum host encontrado.</div>';
        return;
    }

    hosts.forEach(host => {
        const hostItem = document.createElement('div');
        hostItem.className = 'host-item';
        hostItem.innerHTML = `<b style="color: ${host.ativo};">*</b>${host.ip}`;
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

// Inicialização
async function carregarDados() {
    await carregarDadosIniciais();
    configurarWebSocket();
    await loadHosts(); // Carrega os hosts na inicialização
}

// Função para filtrar hosts (editarEquipamento)
function filterHosts() {
    const searchText = document.getElementById('search').value.toLowerCase();
    const showOnlyWithoutLocation = document.getElementById('showOnlyWithoutLocation').checked;

    const filteredHosts = hosts.filter(host => {
        const matchesSearch = host.nome.toLowerCase().includes(searchText) || host.ip.toLowerCase().includes(searchText);
        const hasNoLocation = !host.local || host.local.trim() === '';

        if (showOnlyWithoutLocation) {
            return matchesSearch && hasNoLocation;
        } else {
            return matchesSearch;
        }
    });

    displayHosts(filteredHosts);
}

// Preenche o formulário (editarEquipamento)
function fillForm(host) {
    document.getElementById('ip').value = host.ip;
    document.getElementById('nome').value = host.nome;
    document.getElementById('local').value = host.local;
    // document.getElementById('tipo').value = host.tipo;
    document.getElementById('ativo').value = host.ativo === "#00d700" ? "green" : "red";
}

// Envio do formulário de edição (ajustado)
document.getElementById('editarHostForm').addEventListener('submit', async function (event) {
    event.preventDefault();

    const ip = document.getElementById('ip').value;
    const nome = document.getElementById('nome').value;
    const local = document.getElementById('local').value;
    // const tipo = document.getElementById('tipo').value;
    const ativo = document.getElementById('ativo').value;

    const messageDiv = document.getElementById('message');
    messageDiv.textContent = '';
    messageDiv.classList.remove('success', 'error');

    if (!ip) {
        messageDiv.textContent = 'O campo "IP" é obrigatório.';
        messageDiv.classList.add('error');
        return;
    }

    isEditing = true; // Marca que uma edição está em andamento
    try {
        const response = await fetch(`${server}/editar-host`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ip, nome, local, tipo, ativo })
        });

        const data = await response.json();

        if (response.ok) {
            messageDiv.textContent = 'Host atualizado com sucesso!';
            messageDiv.classList.add('success');
            await atualizarDadosManualmente(); // Força atualização manual após edição
            loadHosts(); // Atualiza a lista de hosts no editarEquipamento
        } else {
            messageDiv.textContent = `Erro: ${data.erro || 'Falha ao atualizar host.'}`;
            messageDiv.classList.add('error');
        }
    } catch (error) {
        console.error('Erro:', error);
        messageDiv.textContent = 'Erro ao conectar ao servidor.';
        messageDiv.classList.add('error');
    } finally {
        isEditing = false; // Libera a flag de edição
        if (pendingWebSocketUpdate) {
            // Processa qualquer atualização do WebSocket que estava pendente
            dadosAtuais = pendingWebSocketUpdate;
            atualizarInterface(pendingWebSocketUpdate);
            loadHosts(); // Atualiza a lista de hosts após processar o pendente
            pendingWebSocketUpdate = null;
        }
    }
});

// Funções de carregamento e atualização
async function carregarDadosIniciais() {
    await fetchDadosHTTP();
    precarregarTilesRegioes(dadosAtuais.hosts);
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('Service Worker registrado!'))
            .catch(err => console.error('Erro ao registrar Service Worker:', err));
    });
}

async function atualizarDadosManualmente() {
    console.log('Atualização manual solicitada');
    const novosDados = await fetchDadosHTTP();
    if (novosDados) {
        // showRedHostsPopup(novosDados);
        console.log('Dados e popup atualizados manualmente');
    } else {
        console.log('Falha na atualização manual');
    }
}

// Função para copiar coordenadas
function copiarCoordenadas(lat, lng) {
    navigator.clipboard.writeText(`${lat}, ${lng}`)
        .then(() => {
            exibirFeedbackCopia?.();
            fecharPopups();
        })
        .catch(err => console.error('Erro ao copiar coordenadas:', err));
}

// Inicialização
carregarDados();

// Configuração do menu de atalhos
menuContainer.innerHTML = `
    <div class="menu-list" onclick="map.flyTo(visaoDefault, 4, { duration: 0.5 })"><b>Mapa geral</b></div>
    <div class="menu-list" onclick="map.flyTo(imperatriz, 17, { duration: 0.5 })">Fabrica Imperatriz</div>
    <div class="menu-list" onclick="map.flyTo(belem, 17, { duration: 0.5 })">Fabrica Belem</div>
    <div class="menu-list" onclick="map.flyTo(aracruz, 17, { duration: 0.5 })">Fabrica Aracruz</div>
`;

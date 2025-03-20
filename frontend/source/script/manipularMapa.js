// Função para filtrar hosts por IP
function pesquisarPorIP(hosts) {
    const ipBusca = document.getElementById('ipBusca').value.toLowerCase();
    if (!ipBusca) {
        return hosts; // Retorna todos os hosts se o campo estiver vazio
    }
    return hosts.filter(host => host.ip.toLowerCase().includes(ipBusca));
}

// Evento no input
document.getElementById('ipBusca').addEventListener('input', () => pesquisarPorIP(dadosAtuais.hosts));
function exibirNoMapaPorIP(ipBusca, dados) {
    const resultados = dados.filter(dado => dado.ip.includes(ipBusca));
    console.log(resultados); // Log de depuração

    markersLayer.clearLayers(); // Remove todos os marcadores existentes
    linesLayer.clearLayers(); // Remove todas as linhas existentes

    const pontosMapeados = {};

    resultados.forEach(resultado => {
        if (resultado.local) {
            const [lat, lng] = resultado.local.split(', ').map(Number);
            console.log(lat, lng); // Log de depuração

            // Lógica para encontrar o maior valor com "C" em resultado.valores
            let maiorValorC = null;
            if (resultado.valores) {
                const valoresComC = resultado.valores.filter(valor => valor.includes('C'));
                if (valoresComC.length > 0) {
                    const valoresNumericos = valoresComC.map(valor => parseFloat(valor));
                    maiorValorC = Math.max(...valoresNumericos);
                }
            }

            // Criando um ícone com uma div para estilização
            const iconeCustomizado = L.divIcon({
                className: 'custom-marker', // Classe CSS
                html: `<img src="https://i.ibb.co/21HsN0y1/sw.png" id="icone-sw" style="border: 2px solid ${resultado.ativo}; box-shadow: inset 0 0 0 1.5px blue; " />`, // Ícone dentro da div
                iconSize: [10, 30],
                iconAnchor: [15, 30], // Ajuste para alinhar corretamente
                popupAnchor: [0, -30]
            });

            let info = '';
            if (resultado.valores) {
                info = `<br><br>
<span style="font-size: 12px; color: gray;">
  🌡️ Temp: <b>${maiorValorC !== null ? maiorValorC + '°C' : 'N/A'}</b> | 
  💻 CPU: <b>${resultado.valores[0]}%</b> | 
  📶 Lat: <b>${resultado.valores[2]}ms</b>
</span>
`;
            }

            const marker = L.marker([lat, lng], { icon: iconeCustomizado }).addTo(markersLayer)
                .bindPopup(`<b class="nomedosw" style="color: ${resultado.ativo};">${resultado.nome} <br> <span class="latitude">${resultado.local}</span> ${info} </b>`);

            pontosMapeados[resultado.ip] = { lat, lng, marker };
        }
    });

    if (resultados.length > 0) {
        const [lat, lng] = resultados[0].local.split(', ').map(Number);
        map.setView([lat, lng], 16); // Centraliza o mapa nas coordenadas do primeiro resultado
    }

    // Desenhar linhas entre pontos conectados
    resultados.forEach(resultado => {
        if (resultado.ship) {
            const ships = resultado.ship.split(', ');
            ships.forEach(ship => {
                if (pontosMapeados[resultado.ip] && pontosMapeados[ship]) {
                    const ponto1 = pontosMapeados[resultado.ip];
                    const ponto2 = pontosMapeados[ship];

                    console.log(`Desenhando linha entre ${resultado.ip} e ${ship}`);
                    console.log(`Coordenadas: ${ponto1.lat}, ${ponto1.lng} -> ${ponto2.lat}, ${ponto2.lng}`);

                    const linha = L.polyline([[ponto1.lat, ponto1.lng], [ponto2.lat, ponto2.lng]], { color: `${resultado.ativo}` }).addTo(linesLayer);
                } else {
                    console.log(`Ponto não encontrado para ${resultado.ip} ou ${ship}`);
                }
            });
        }
    });

    exibirNaListaSemLocal(resultados);
}

function exibirNaListaSemLocal(resultados) {
    const listaSemLocalizacao = document.getElementById('sem-localizacao');
    listaSemLocalizacao.innerHTML = ''; // Limpa a lista antes de adicionar novos itens

    resultados.forEach(resultado => {
        if (!resultado.local) {
            const li = document.createElement('li');
            li.innerHTML = `${resultado.nome} - <span class="latitude">${resultado.ip}<span>`;
            listaSemLocalizacao.appendChild(li);
        }
    });
}

const toggleButton = document.getElementById('toggleButton');
const lista = document.getElementById('lista');


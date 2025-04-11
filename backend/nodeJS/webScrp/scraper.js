const puppeteer = require('puppeteer');
const fs = require('fs');
const http = require('http'); // Adiciona o módulo HTTP nativo

// Função para criar o servidor de monitoramento na porta 8080
function iniciarServidorMonitoramento() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('O script está ativo e rodando!\n');
  });

  server.listen(8080, () => {
    console.log('Servidor de monitoramento rodando na porta 8080');
  });
}

function carregarDados() {
  try {
    const data = fs.readFileSync('dados.json', 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Erro ao carregar o arquivo dados.json:', err);
    return [];
  }
}

// Carrega o JSON
const dados = carregarDados();

// Função para codificar a URL corretamente
function codificarURL(link) {
  try {
    return encodeURI(link);
  } catch (err) {
    console.error(`Erro ao codificar a URL ${link}:`, err);
    return link;
  }
}

// Função para carregar os resultados existentes do arquivo JSON
function carregarResultados() {
  try {
    const data = fs.readFileSync('resultados.json', 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

// Função para salvar os resultados no arquivo JSON
function salvarResultados(resultados) {
  fs.writeFileSync('resultados.json', JSON.stringify(resultados, null, 2));
  console.log('Resultados atualizados e salvos em resultados.json');
}

// Função para aguardar até que os valores reais sejam carregados
async function aguardarValoresReais(iframeContent, seletor) {
  return await iframeContent.waitForFunction(
    (seletor) => {
      const elementos = document.querySelectorAll(seletor);
      return Array.from(elementos).every(el => el.textContent.trim() !== "--");
    },
    { timeout: 60000 },
    seletor
  );
}

// Função para processar um link individualmente
async function processarLink(item, resultadosExistentes) {
  let browser;
  try {
    const urlCodificada = codificarURL(item.Link);
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(urlCodificada, { waitUntil: "networkidle2", timeout: 60000 });

    await page.waitForSelector('input[name="EntUserName"]', { timeout: 60000 });
    await page.type('input[name="EntUserName"]', 'suzano_user');
    await page.type('input[name="EntUserPassword"]', 'Vita@2019');
    await Promise.all([
      page.click('button.wgt.login-button'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 })
    ]);

    await new Promise(resolve => setTimeout(resolve, 30000));
    console.log('Aguardou 30 segundos após o login.');

    const iframes = await page.$$('iframe');
    let valoresSummary = Array(4).fill("-");
    let summaryIndex = 0;

    for (let i = 0; i < iframes.length; i++) {
      const iframe = iframes[i];
      const iframeContent = await iframe.contentFrame();
      if (iframeContent) {
        await iframeContent.waitForFunction(() => document.readyState === 'complete', { timeout: 60000 });
        await aguardarValoresReais(iframeContent, '.wgt.number.no-stretch');
        const labels = await iframeContent.$$('.wgt.number.no-stretch');
        for (const label of labels) {
          if (summaryIndex >= 4) break;
          const valor = await iframeContent.evaluate(el => el.textContent.trim(), label);
          if (valor) {
            valoresSummary[summaryIndex] = valor;
            summaryIndex++;
          }
        }
      }
    }

    console.log('Valores (%):', valoresSummary);

    const urlResources = urlCodificada
      .replace('dashboardId=systemDeviceSummary', 'dashboardId=systemDeviceResources')
      .replace('dashboardName=Summary', 'dashboardName=Resources');

    await page.goto(urlResources, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 15000));

    const iframesResources = await page.$$('iframe');
    let valoresResources = [];

    for (let i = 0; i < iframesResources.length; i++) {
      const iframe = iframesResources[i];
      const iframeContent = await iframe.contentFrame();
      if (iframeContent) {
        await iframeContent.waitForFunction(() => document.readyState === 'complete', { timeout: 60000 });
        const tabelas = await iframeContent.$$('tbody.draggable');
        for (const tabela of tabelas) {
          const linhas = await tabela.$$('tr.selectable-row');
          for (const linha of linhas) {
            const celula = await linha.$('td[data-th="Value"]');
            if (celula) {
              const valor = await iframeContent.evaluate(el => el.textContent.trim(), celula);
              if (valor && valor !== "--") {
                valoresResources.push(valor);
              }
            }
          }
        }
      }
    }

    console.log('Valores (Sensor):', valoresResources);

    const itemExistente = resultadosExistentes.find(existente => existente["Nome SW"] === item["Nome SW"] && existente.IP === item.IP);

    if (itemExistente) {
      for (let i = 0; i < 4; i++) {
        itemExistente.Valores[i] = valoresSummary[i];
      }
      for (let i = 0; i < valoresResources.length; i++) {
        const index = i + 4;
        itemExistente.Valores[index] = valoresResources[i];
      }
      const temperaturas = itemExistente.Valores.filter(v => typeof v === 'string' && v.includes(' C'));
      let maiorTemp = "-";
      let maiorValor = -Infinity;
      for (const temp of temperaturas) {
        const valor = parseFloat(temp.split(' ')[0]);
        if (!isNaN(valor) && valor > maiorValor) {
          maiorValor = valor;
          maiorTemp = temp;
        }
      }
      itemExistente.temp = maiorTemp;
    } else {
      const valoresEncontrados = [...valoresSummary, ...valoresResources];
      const temperaturas = valoresEncontrados.filter(v => typeof v === 'string' && v.includes(' C'));
      let maiorTemp = "-";
      let maiorValor = -Infinity;
      for (const temp of temperaturas) {
        const valor = parseFloat(temp.split(' ')[0]);
        if (!isNaN(valor) && valor > maiorValor) {
          maiorValor = valor;
          maiorTemp = temp;
        }
      }
      resultadosExistentes.push({
        "Nome SW": item["Nome SW"],
        "IP": item.IP,
        "Valores": valoresEncontrados,
        "temp": maiorTemp
      });
    }

    salvarResultados(resultadosExistentes);
    await page.close();
  } catch (error) {
    console.error(`Erro ao processar o link ${item.Link}:`, error);
    const itemExistente = resultadosExistentes.find(existente => existente["Nome SW"] === item["Nome SW"] && existente.IP === item.IP);
    if (itemExistente) {
      itemExistente.Erro = error.message;
    } else {
      resultadosExistentes.push({
        "Nome SW": item["Nome SW"],
        "IP": item.IP,
        "Valores": Array(4).fill("-"),
        "Erro": error.message
      });
    }
    salvarResultados(resultadosExistentes);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Função para processar os links em lotes de 5
async function processarLotes(dados, resultadosExistentes) {
  const tamanhoLote = 5;
  for (let i = 0; i < dados.length; i += tamanhoLote) {
    const lote = dados.slice(i, i + tamanhoLote);
    await Promise.all(lote.map(item => processarLink(item, resultadosExistentes)));
    console.log(`Lote ${i / tamanhoLote + 1} concluído.`);
  }
}

(async () => {
  // Inicia o servidor de monitoramento na porta 8080
  iniciarServidorMonitoramento();

  while (true) { // Loop infinito
    const resultadosExistentes = carregarResultados();
    await processarLotes(dados, resultadosExistentes);
    console.log('Iteração concluída. Verifique o arquivo resultados.json.');
    await new Promise(resolve => setTimeout(resolve, 60000)); // 60 segundos de intervalo
  }
})();
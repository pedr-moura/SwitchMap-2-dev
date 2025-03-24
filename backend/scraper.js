const puppeteer = require('puppeteer');
const fs = require('fs');

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
    // Codifica a URL para garantir que seja válida
    const urlCodificada = codificarURL(item.Link);
    // console.log(`Processando link: ${urlCodificada}`);

    // Inicia um navegador independente
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Acessa o link codificado
    await page.goto(urlCodificada, { waitUntil: "networkidle2", timeout: 60000 });
    // console.log('Página carregada com sucesso.');

    // Realiza o login (se necessário)
    await page.waitForSelector('input[name="EntUserName"]', { timeout: 60000 });
    await page.type('input[name="EntUserName"]', 'suzano_user');
    await page.type('input[name="EntUserPassword"]', 'Vita@2019');
    await Promise.all([
      page.click('button.wgt.login-button'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 })
    ]);
    // console.log('Login realizado com sucesso.');

    // Aguarda 15 segundos
    await new Promise(resolve => setTimeout(resolve, 30000));
    console.log('Aguardou 30 segundos após o login.');

    // Coleta os valores dos iframes na página inicial (Summary)
const iframes = await page.$$('iframe');
let valoresSummary = Array(4).fill("-"); // Inicializa os 4 primeiros valores com "-"
// console.log(`Número de iframes encontrados: ${iframes.length}`);

let summaryIndex = 0; // Contador para controlar a posição no array valoresSummary

for (let i = 0; i < iframes.length; i++) {
  const iframe = iframes[i];
  const iframeContent = await iframe.contentFrame();

  if (iframeContent) {
    await iframeContent.waitForFunction(() => document.readyState === 'complete', { timeout: 60000 });

    // Aguarda até que os valores reais sejam carregados
    await aguardarValoresReais(iframeContent, '.wgt.number.no-stretch');

    // Coleta os valores dos elementos .wgt.number.no-stretch
    const labels = await iframeContent.$$('.wgt.number.no-stretch');
    // console.log(`Número de elementos .wgt.number.no-stretch encontrados: ${labels.length}`);

    // Itera sobre os elementos encontrados e preenche os valores sequencialmente
    for (const label of labels) {
      if (summaryIndex >= 4) break; // Limita aos primeiros 4 valores

      const valor = await iframeContent.evaluate(el => el.textContent.trim(), label);
      // console.log(`Valor encontrado no iframe ${i + 1}: ${valor}`);
      
      if (valor) {
        valoresSummary[summaryIndex] = valor;
        summaryIndex++;
      }
    }
  }
}

console.log('Valores (%):', valoresSummary);

    // Navega para a página de Resources
    const urlResources = urlCodificada
      .replace('dashboardId=systemDeviceSummary', 'dashboardId=systemDeviceResources')
      .replace('dashboardName=Summary', 'dashboardName=Resources');

    await page.goto(urlResources, { waitUntil: "networkidle2", timeout: 60000 });
    // console.log('Navegou para a página de Resources.');

    // Aguarda 15 segundos para garantir que a página de Resources seja carregada
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Coleta os valores dos iframes na página de Resources
    const iframesResources = await page.$$('iframe');
    let valoresResources = [];
    // console.log(`Número de iframes encontrados na página de Resources: ${iframesResources.length}`);

    for (let i = 0; i < iframesResources.length; i++) {
      const iframe = iframesResources[i];
      const iframeContent = await iframe.contentFrame();

      if (iframeContent) {
        await iframeContent.waitForFunction(() => document.readyState === 'complete', { timeout: 60000 });

        // Coleta os valores das células td[data-th="Value"] dentro de tbody.draggable
        const tabelas = await iframeContent.$$('tbody.draggable');

        for (const tabela of tabelas) {
          const linhas = await tabela.$$('tr.selectable-row');

          for (const linha of linhas) {
            const celula = await linha.$('td[data-th="Value"]');
            if (celula) {
              const valor = await iframeContent.evaluate(el => el.textContent.trim(), celula);
              if (valor && valor !== "--") {
                // console.log(` ${valor}`);
                valoresResources.push(valor);
              }
            }
          }
        }
      }
    }

    console.log('Valores (Sensor):', valoresResources);

    // Verifica se o item já existe nos resultados
    const itemExistente = resultadosExistentes.find(existente => existente["Nome SW"] === item["Nome SW"] && existente.IP === item.IP);

    if (itemExistente) {
      // Atualiza os 4 primeiros índices com os valores de Summary
      for (let i = 0; i < 4; i++) {
          itemExistente.Valores[i] = valoresSummary[i];
      }
  
      // Adiciona os valores de Resources a partir do índice 4
      for (let i = 0; i < valoresResources.length; i++) {
          const index = i + 4;
          itemExistente.Valores[index] = valoresResources[i];
      }
  
      // Calcula o maior valor com "C"
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
  
      itemExistente.temp = maiorTemp; // Adiciona o campo "temp"
  } else {
      // Adiciona um novo item aos resultados
      const valoresEncontrados = [...valoresSummary, ...valoresResources];
      
      // Calcula o maior valor com "C"
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
          "temp": maiorTemp // Adiciona o campo "temp"
      });
  }

    // Salva os resultados no arquivo JSON após cada iteração
    salvarResultados(resultadosExistentes);

    // Fecha a página atual
    await page.close();
  } catch (error) {
    console.error(`Erro ao processar o link ${item.Link}:`, error);

    // Verifica se o item já existe nos resultados
    const itemExistente = resultadosExistentes.find(existente => existente["Nome SW"] === item["Nome SW"] && existente.IP === item.IP);

    if (itemExistente) {
      // Atualiza o item existente com o erro
      itemExistente.Erro = error.message;
    } else {
      // Adiciona um novo item com o erro
      resultadosExistentes.push({
        "Nome SW": item["Nome SW"],
        "IP": item.IP,
        "Valores": Array(4).fill("-"), // Inicializa com 4 valores "-"
        "Erro": error.message
      });
    }

    // Salva os resultados mesmo em caso de erro
    salvarResultados(resultadosExistentes);
  } finally {
    // Fecha o navegador
    if (browser) {
      await browser.close();
    }
  }
}

// Função para processar os links em lotes de 10
async function processarLotes(dados, resultadosExistentes) {
  const tamanhoLote = 5;
  for (let i = 0; i < dados.length; i += tamanhoLote) {
    const lote = dados.slice(i, i + tamanhoLote);

    // Processa cada link do lote em paralelo
    await Promise.all(lote.map(item => processarLink(item, resultadosExistentes)));

    console.log(`Lote ${i / tamanhoLote + 1} concluído.`);
  }
}

(async () => {
  while (true) { // Loop infinito
    const resultadosExistentes = carregarResultados();

    // Processa os dados em lotes de 10
    await processarLotes(dados, resultadosExistentes);

    console.log('Iteração concluída. Verifique o arquivo resultados.json.');

    // Aguarda um intervalo de tempo antes de iniciar a próxima iteração
    await new Promise(resolve => setTimeout(resolve, 60000)); // 60 segundos de intervalo
  }
})();
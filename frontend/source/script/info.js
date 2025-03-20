function obterDataHoraAtual() {
    const agora = new Date();
    const data = agora.toLocaleDateString();
    const hora = agora.toLocaleTimeString();
    return `${data} ${hora}`;
}

function exibirDataHora() {
    document.getElementById('dataHora').innerText = obterDataHoraAtual();
}

const feedbackDados = document.getElementById('popup')
feedbackDados.style.display = 'none'

function exibirFeedbackDados() {
    fecharFeedbackCopia()
    feedbackDados.style.display = 'block';
    setTimeout(() => {
        feedbackDados.style.display = 'none';
    }, 3000); // 3 segundos (3000 milissegundos)
}

function fecharFeedbackDados() {
    feedbackDados.style.display = 'none';
}

const feedbackDadosCopiar = document.getElementById('popupcopiar')
feedbackDadosCopiar.style.display = 'none'

function exibirFeedbackCopia() {
    fecharFeedbackDados() 
    feedbackDadosCopiar.style.display = 'block';
    feedbackDadosCopiar.style.zIndex = '99999999';
    setTimeout(() => {
        feedbackDadosCopiar.style.display = 'none';
    }, 3000); // 3 segundos (3000 milissegundos)
}

function fecharFeedbackCopia() {
    feedbackDadosCopiar.style.display = 'none';
}

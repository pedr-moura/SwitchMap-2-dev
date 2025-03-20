// editarEquipamento
// adicionarEquipamento
// homebox

let editarEquipamento = document.getElementById('editarEquipamento')
let adicionarEquipamento = document.getElementById('adicionarEquipamento')
let homebox = document.getElementById('homebox')

function exibirEditar() {
    editarEquipamento.style.display = 'block'
    adicionarEquipamento.style.display = 'none'
    homebox.style.display = 'none'
}
function exibirAdicionar() {
    editarEquipamento.style.display = 'none'
    adicionarEquipamento.style.display = 'block'
    homebox.style.display = 'none'
}
function exibirHome() {
    editarEquipamento.style.display = 'none'
    adicionarEquipamento.style.display = 'none'
    homebox.style.display = 'flex'
}

import eventlet
eventlet.monkey_patch()

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO
import logging
import os
import json
from datetime import datetime
from data_manager import DataManager  # Importar o DataManager

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("approve_logs.log", encoding="utf-8"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Inicialização do aplicativo Flask
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# Caminhos para os arquivos de dados
CAMINHO_DADOS_JSON = os.path.join(os.getcwd(), "dados.json")
CAMINHO_APROVACOES = os.path.join(os.getcwd(), "aprovacoes_pendentes.json")

# Instância do DataManager
data_manager = DataManager(CAMINHO_DADOS_JSON, socketio)

# Classe para gerenciar as aprovações (sem manipulação direta de dados.json)
class EditManager:
    def __init__(self, approvals_path):
        self.approvals_path = approvals_path

    def load_approvals(self):
        try:
            with open(self.approvals_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            return []

    def save_approvals(self, approvals):
        with open(self.approvals_path, 'w', encoding='utf-8') as f:
            json.dump(approvals, f, ensure_ascii=False, indent=4)

# Instância do EditManager
edit_manager = EditManager(CAMINHO_APROVACOES)

# Rota para submeter edição
@app.route('/submit-edit', methods=['POST'])
def submit_edit():
    try:
        edit_data = request.get_json()
        if not edit_data or 'changes' not in edit_data:
            return jsonify({'error': 'Dados inválidos'}), 400

        approval_request = {
            'id': f"edit_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            'timestamp': datetime.now().isoformat(),
            'changes': edit_data['changes'],
            'status': 'pending',
            'submitted_by': edit_data.get('user', 'anonymous')
        }

        approvals = edit_manager.load_approvals()
        approvals.append(approval_request)
        edit_manager.save_approvals(approvals)

        socketio.emit('new_edit_request', approval_request)
        logger.info(f"Nova solicitação de edição recebida: {approval_request['id']}")
        return jsonify({'message': 'Solicitação de edição submetida', 'request_id': approval_request['id']}), 200

    except Exception as e:
        logger.error(f"Erro ao processar edição: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Rota para editar host
@app.route('/editar-host', methods=['PUT'])
def editar_host():
    try:
        edit_data = request.get_json()
        required_fields = ['ip']
        if not edit_data or not all(field in edit_data for field in required_fields):
            return jsonify({'error': 'Dados inválidos ou campo "ip" ausente'}), 400

        approval_request = {
            'id': f"edit_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            'timestamp': datetime.now().isoformat(),
            'changes': {
                'ip': edit_data.get('ip'),
                'nome': edit_data.get('nome', ''),
                'local': edit_data.get('local', ''),
                'observacao': edit_data.get('observacao', ''),
                'tipo': edit_data.get('tipo', 'sw'),
                'ativo': edit_data.get('ativo', 'blue')
            },
            'status': 'pending',
            'submitted_by': 'anonymous'
        }

        approvals = edit_manager.load_approvals()
        approvals.append(approval_request)
        edit_manager.save_approvals(approvals)

        socketio.emit('new_edit_request', approval_request)
        logger.info(f"Nova solicitação de edição recebida em /editar-host: {approval_request['id']}")
        return jsonify({'message': 'Solicitação de edição submetida', 'request_id': approval_request['id']}), 200

    except Exception as e:
        logger.error(f"Erro ao processar edição em /editar-host: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Rota para listar edições pendentes
@app.route('/pending-edits', methods=['GET'])
def get_pending_edits():
    try:
        approvals = edit_manager.load_approvals()
        pending = [req for req in approvals if req['status'] == 'pending']
        return jsonify(pending), 200
    except Exception as e:
        logger.error(f"Erro ao listar edições pendentes: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Rota para aprovar edição (usando DataManager)
@app.route('/approve-edit/<id>', methods=['POST'])
def approve_edit_by_id(id):
    try:
        approvals = edit_manager.load_approvals()
        target_request = next((req for req in approvals if req['id'] == id), None)
        
        if not target_request:
            return jsonify({'error': 'Solicitação não encontrada'}), 404

        if target_request['status'] != 'pending':
            return jsonify({'error': 'Solicitação já processada'}), 400

        # Marcar a solicitação como aprovada
        target_request['status'] = 'approve'
        target_request['processed_at'] = datetime.now().isoformat()
        target_request['processed_by'] = 'anonymous'

        # Obter os dados atuais do DataManager
        current_data = data_manager.get_data()
        if 'hosts' not in current_data:
            current_data['hosts'] = []

        # Localizar o host pelo IP e atualizar apenas os campos alterados
        target_ip = target_request['changes']['ip']
        host_found = False
        for host in current_data['hosts']:
            if host.get('ip') == target_ip:
                for key, value in target_request['changes'].items():
                    if value is not None:  # Só atualiza se o valor não for None
                        host[key] = value
                host_found = True
                break

        # Se o host não existir, adicionar como novo
        if not host_found:
            current_data['hosts'].append(target_request['changes'])

        # Atualizar os dados via DataManager
        data_manager.update_data(current_data)

        # Salvar as aprovações
        edit_manager.save_approvals(approvals)
        socketio.emit('edit_status_update', target_request)
        
        logger.info(f"Edição aprovada: {id}")
        return jsonify({'message': 'Edição aprovada com sucesso'}), 200

    except Exception as e:
        logger.error(f"Erro ao aprovar edição: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Rota para rejeitar edição
@app.route('/reject-edit/<id>', methods=['DELETE'])
def reject_edit_by_id(id):
    try:
        approvals = edit_manager.load_approvals()
        target_request = next((req for req in approvals if req['id'] == id), None)
        
        if not target_request:
            return jsonify({'error': 'Solicitação não encontrada'}), 404

        if target_request['status'] != 'pending':
            return jsonify({'error': 'Solicitação já processada'}), 400

        target_request['status'] = 'reject'
        target_request['processed_at'] = datetime.now().isoformat()
        target_request['processed_by'] = 'anonymous'

        edit_manager.save_approvals(approvals)
        socketio.emit('edit_status_update', target_request)
        
        logger.info(f"Edição rejeitada: {id}")
        return jsonify({'message': 'Edição rejeitada com sucesso'}), 200

    except Exception as e:
        logger.error(f"Erro ao rejeitar edição: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Evento WebSocket para conexão
@socketio.on('connect')
def handle_connect():
    logger.info('Cliente WebSocket conectado')
    socketio.emit('connection_established', {'message': 'Conectado ao servidor de aprovações'})

if __name__ == "__main__":
    logger.info("Iniciando servidor de aprovações na porta 5002...")
    socketio.run(app, host="0.0.0.0", port=5002, use_reloader=False)
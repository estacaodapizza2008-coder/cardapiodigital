const express = require('express');
const router = express.Router();
const pedidosController = require('../controllers/pedidosController');
const autenticar = require('../middleware/autenticacao');
const { autorizarNiveis } = require('../middleware/autenticacao');
const verificarHorarioFuncionamento = require('../middleware/horarioFuncionamento');
const { limitarBuscaCliente, limitarStatusPedido } = require('../middleware/limitadores');

// Público: cliente cria o pedido (bloqueado fora do horário de funcionamento)
router.post('/', verificarHorarioFuncionamento, pedidosController.criarPedido);

// (Removida de propósito: a antiga rota "/cliente/:telefone" devolvia nome e
// endereço de qualquer telefone, sem confirmação. O checkout agora lembra os
// dados do cliente no próprio navegador dele - ver cliente.js.)

// Público: card "Acompanhar meu pedido" - nome + telefone juntos, com
// limitador apertado (expõe dado do pedido pra quem souber nome+telefone).
router.get('/rastrear', limitarBuscaCliente, pedidosController.rastrearPedido);

// Público: polling leve do status (só pendente/preparo/saiu_entrega/entregue,
// sem dado pessoal), usado pela mesma tela pra atualizar sozinha.
router.get('/:id/status', limitarStatusPedido, pedidosController.statusPublico);

// Admin: cria pedido manualmente pelo painel
router.post('/admin', autenticar, autorizarNiveis('admin'), pedidosController.criarPedidoAdmin);

// Histórico por dia - só admin (informação de faturamento). Precisa vir
// ANTES de '/:id', senão o Express entende "historico" como um :id.
router.get('/historico/dias', autenticar, autorizarNiveis('admin'), pedidosController.listarDiasHistorico);
router.get('/historico/:dia', autenticar, autorizarNiveis('admin'), pedidosController.listarPedidosPorDia);

// Protegido: usado pelo admin/cozinha (lista só o dia operacional em curso)
router.get('/', autenticar, pedidosController.listarPedidos);
router.get('/:id', autenticar, pedidosController.buscarPedido);
router.patch('/:id/status', autenticar, pedidosController.atualizarStatus);
router.post('/:id/reimprimir', autenticar, pedidosController.reimprimir);
router.delete('/:id', autenticar, autorizarNiveis('admin'), pedidosController.excluirPedido);

module.exports = router;

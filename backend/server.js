require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const configurarSocket = require('./socket/socketHandler');
const { limitarLogin, limitarCriacaoPedido, limitarGeral, limitarCadastro } = require('./middleware/limitadores');
const autenticar = require('./middleware/autenticacao');
const { autorizarNiveis } = require('./middleware/autenticacao');

const authRoutes = require('./routes/auth');
const pedidosRoutes = require('./routes/pedidos');
const produtosRoutes = require('./routes/produtos');
const configRoutes = require('./routes/config');
const precosRoutes = require('./routes/precos');
const imagensRoutes = require('./routes/imagens');
const cuponsRoutes = require('./routes/cupons');
const promocoesRoutes = require('./routes/promocoes');
const secoesRoutes = require('./routes/secoes');

// ---------- Verificações de segurança na inicialização ----------
// No Render a variável RENDER vem como "true" sozinha; NODE_ENV cobre outros
// provedores. Em produção, configuração insegura IMPEDE o servidor de subir
// (no Render, um deploy que falha ao iniciar não derruba a versão que já está
// no ar - ele só mostra o erro nos Logs). Em desenvolvimento, só avisa.
const emProducao = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

function configuracaoInsegura(mensagem) {
    if (emProducao) {
        console.error(`ERRO DE CONFIGURAÇÃO: ${mensagem}`);
        console.error('O servidor não vai iniciar assim. Corrija a variável em Environment no painel do Render e faça o deploy de novo.');
        process.exit(1);
    }
    console.warn(`AVISO: ${mensagem} (só é aceito em desenvolvimento; em produção o servidor não inicia).`);
}

// Quem souber o JWT_SECRET consegue criar um token de admin sozinho, então
// ele precisa ser longo e imprevisível (use 32+ caracteres aleatórios).
const SEGREDO_DE_EXEMPLO = 'troque_esta_chave_por_algo_seguro';
const segredoJwt = process.env.JWT_SECRET || '';
if (segredoJwt.length < 32 || segredoJwt === SEGREDO_DE_EXEMPLO) {
    configuracaoInsegura('JWT_SECRET ausente, com menos de 32 caracteres ou igual ao valor de exemplo.');
}

// Em produção, defina FRONTEND_ORIGINS com a(s) URL(s) real(is) do site
// (separadas por vírgula), ex: https://minhapizzaria.com,https://www.minhapizzaria.com
// Sem essa variável liberamos qualquer origem ('*') - só aceito em
// desenvolvimento: em produção isso permitiria que QUALQUER site na internet
// chamasse a API em nome de um visitante, então o servidor não inicia.
const origensPermitidas = (process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
const configCors = {
    origin: origensPermitidas.length > 0 ? origensPermitidas : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
if (origensPermitidas.length === 0) {
    configuracaoInsegura('FRONTEND_ORIGINS não definida - o CORS ficaria liberado para qualquer site.');
}

const app = express();
app.use(cors(configCors));
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(compression());
app.use(limitarGeral);

// Tamanho do corpo das requisições:
// - padrão de 100 KB pra API inteira (pedido, login, cupom... nunca passam disso);
// - 8 MB só nas rotas de imagem/som (chegam em base64 dentro do JSON), e SÓ
//   pra quem está logado como admin: a conferência do login roda ANTES de ler
//   o corpo, então um desconhecido não consegue mandar 8 MB pra essas rotas.
// Esse parser grande precisa vir antes do padrão: se um corpo já foi lido, o
// parser seguinte simplesmente o ignora.
const jsonGrande = express.json({ limit: '8mb' });
function corpoGrandeSoAdmin(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    autenticar(req, res, (erroAuth) => {
        if (erroAuth) return next(erroAuth);
        autorizarNiveis('admin')(req, res, (erroNivel) => {
            if (erroNivel) return next(erroNivel);
            jsonGrande(req, res, next);
        });
    });
}
app.use(['/api/imagens-tamanho', '/api/config', '/api/produtos'], corpoGrandeSoAdmin);
app.use(express.json({ limit: '100kb' }));

const server = http.createServer(app);
const io = new Server(server, { cors: configCors });

// Deixa o "io" acessível dentro dos controllers via req.app.get('io')
app.set('io', io);

configurarSocket(io);

app.use('/api/auth/login', limitarLogin);
app.use('/api/auth/cadastrar', limitarCadastro);
app.use('/api/pedidos', (req, res, next) => {
    if (req.method === 'POST' && req.path === '/') return limitarCriacaoPedido(req, res, next);
    next();
});

app.use('/api/auth', authRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/produtos', produtosRoutes);
app.use('/api/config', configRoutes);
app.use('/api/precos-pizza', precosRoutes);
app.use('/api/imagens-tamanho', imagensRoutes);
app.use('/api/cupons', cuponsRoutes);
app.use('/api/promocoes', promocoesRoutes);
app.use('/api/secoes-cardapio', secoesRoutes);

app.get('/api/status', (req, res) => {
    res.json({ status: 'online' });
});

// Erros que chegam até aqui (corpo grande demais, JSON malformado...) viram
// resposta em JSON, sem vazar detalhes internos do servidor.
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ erro: 'Conteúdo grande demais.' });
    }
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ erro: 'Requisição inválida.' });
    }
    console.error('Erro não tratado:', err && err.message);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
});

// Rede de segurança: se alguma rota deixar escapar um erro assíncrono, o
// servidor registra no log e continua no ar, em vez de cair pra todo mundo
// (o que, no Render, derruba o site por 30-60 segundos até reiniciar).
process.on('unhandledRejection', (motivo) => {
    console.error('Promessa rejeitada sem tratamento:', motivo);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');
const { ALGORITMO_JWT } = require('../middleware/autenticacao');
require('dotenv').config();

// Hash "fake" só pra gastar o mesmo tempo de bcrypt.compare quando o email
// nem existe. Sem isso, a resposta de "email não encontrado" volta bem mais
// rápido que a de "senha errada" (que faz o compare de verdade) - alguém
// medindo o tempo de resposta conseguiria descobrir quais emails têm conta
// cadastrada, mesmo sem nunca ver a mensagem de erro mudar.
const HASH_FALSO = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Q0Q8Q0Q8Q0Q8Q0Q8Q0Q8Q0Q8Q0Q8O';

exports.login = async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'Email e senha são obrigatórios.' });

    try {
        const usuario = await Usuario.buscarPorEmail(email);

        const senhaCorreta = await bcrypt.compare(senha, usuario ? usuario.senha_hash : HASH_FALSO);
        if (!usuario || !senhaCorreta) return res.status(401).json({ erro: 'Credenciais inválidas.' });

        const token = jwt.sign(
            { id: usuario.id, nome: usuario.nome, nivel: usuario.nivel },
            process.env.JWT_SECRET,
            { expiresIn: '8h', algorithm: ALGORITMO_JWT[0] }
        );

        res.json({ token, nome: usuario.nome, nivel: usuario.nivel });
    } catch (err) {
        console.error('Erro no login:', err.message);
        res.status(500).json({ erro: 'Erro ao fazer login.' });
    }
};

// Cadastra um novo usuário (admin/cozinha).
//
// Regras de segurança:
// - PRIMEIRO usuário (banco sem nenhum): só com o código de instalação
//   (variável SETUP_TOKEN no servidor, enviado no header "x-setup-token").
//   Antes essa porta ficava aberta pra qualquer um enquanto não existisse
//   admin - quem chegasse primeiro (ex: banco novo ou recriado) virava dono
//   do sistema. O primeiro usuário é sempre admin.
// - Depois disso, só quem está logado como admin cadastra outros, e o nível
//   precisa ser "admin" ou "cozinha".
// - Senha com pelo menos 10 caracteres (máximo 72: o bcrypt ignora o que passa disso).
const NIVEIS_VALIDOS = ['admin', 'cozinha'];
const SENHA_MINIMA = 10;
const SENHA_MAXIMA = 72;
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Compara sem revelar, pelo tempo de resposta, quantos caracteres batem.
function tokensIguais(a, b) {
    const hash = (v) => crypto.createHash('sha256').update(String(v)).digest();
    return crypto.timingSafeEqual(hash(a), hash(b));
}

exports.cadastrar = async (req, res) => {
    const { nome, email, senha, nivel } = req.body;
    if (typeof nome !== 'string' || typeof email !== 'string' || typeof senha !== 'string' ||
        !nome.trim() || !email.trim() || !senha) {
        return res.status(400).json({ erro: 'Dados incompletos.' });
    }
    if (nome.length > 100) return res.status(400).json({ erro: 'Nome muito longo (máximo 100 letras).' });
    if (email.length > 150 || !FORMATO_EMAIL.test(email)) return res.status(400).json({ erro: 'E-mail inválido.' });
    if (senha.length < SENHA_MINIMA || senha.length > SENHA_MAXIMA) {
        return res.status(400).json({ erro: `A senha precisa ter de ${SENHA_MINIMA} a ${SENHA_MAXIMA} caracteres.` });
    }

    try {
        const totalUsuarios = Number(await Usuario.contar());
        let nivelFinal;

        if (totalUsuarios === 0) {
            const esperado = process.env.SETUP_TOKEN || '';
            if (esperado.length < 16) {
                return res.status(403).json({ erro: 'Cadastro inicial desativado: defina SETUP_TOKEN (16+ caracteres) no servidor.' });
            }
            const enviado = req.headers['x-setup-token'];
            if (typeof enviado !== 'string' || !tokensIguais(enviado, esperado)) {
                return res.status(403).json({ erro: 'Código de instalação inválido.' });
            }
            nivelFinal = 'admin';
        } else {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ erro: 'Já existe um administrador cadastrado. Faça login como admin para cadastrar novos usuários.' });
            }
            try {
                const payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET, { algorithms: ALGORITMO_JWT });
                if (payload.nivel !== 'admin') {
                    return res.status(403).json({ erro: 'Só administradores podem cadastrar novos usuários.' });
                }
            } catch (err) {
                return res.status(401).json({ erro: 'Token inválido ou expirado.' });
            }
            if (!NIVEIS_VALIDOS.includes(nivel)) {
                return res.status(400).json({ erro: 'Nível inválido. Use "admin" ou "cozinha".' });
            }
            nivelFinal = nivel;
        }

        const senha_hash = await bcrypt.hash(senha, 10);
        const id = await Usuario.criar({ nome: nome.trim(), email: email.trim(), senha_hash, nivel: nivelFinal });
        res.status(201).json({ mensagem: 'Usuário criado com sucesso.', id });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ erro: 'Esse e-mail já está em uso.' });
        }
        console.error('Erro ao criar usuário:', err.message);
        res.status(500).json({ erro: 'Erro ao criar usuário.' });
    }
};

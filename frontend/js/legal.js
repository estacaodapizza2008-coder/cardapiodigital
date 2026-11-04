// Aviso de privacidade/cookies (informativo). O site não usa cookies nem
// rastreadores - o aviso só informa isso e aponta para as políticas.
// A única coisa gravada aqui é a marca "já li o aviso", no armazenamento local.
(function () {
    const CHAVE = 'pizzaria_aviso_privacidade_ok';
    try { if (localStorage.getItem(CHAVE) === '1') return; } catch (e) { /* segue e mostra o aviso */ }

    // Descobre o caminho das páginas legais a partir de onde este script foi carregado
    const base = document.currentScript.src.replace(/js\/legal\.js(\?.*)?$/, '');

    const caixa = document.createElement('div');
    caixa.className = 'aviso-privacidade';
    caixa.setAttribute('role', 'dialog');
    caixa.setAttribute('aria-label', 'Aviso de privacidade');
    caixa.innerHTML =
        '<p>🍕 Este site <strong>não usa cookies de rastreamento nem de publicidade</strong>. ' +
        'Ao fazer um pedido, guardamos seu nome, telefone e endereço apenas para preparar e entregar. ' +
        'Saiba mais na <a href="' + base + 'legal/privacidade.html">Política de Privacidade</a>, ' +
        'nos <a href="' + base + 'legal/termos.html">Termos de Uso</a> e na ' +
        '<a href="' + base + 'legal/cookies.html">Política de Cookies</a>.</p>' +
        '<button type="button">Entendi</button>';

    // Sobe o aviso acima da navegação inferior do app do cliente, se houver
    const nav = document.querySelector('.nav-inferior');
    if (nav) caixa.style.bottom = (nav.offsetHeight + 12) + 'px';

    caixa.querySelector('button').addEventListener('click', function () {
        try { localStorage.setItem(CHAVE, '1'); } catch (e) { /* sem armazenamento: só fecha */ }
        caixa.remove();
    });
    document.body.appendChild(caixa);
})();

/* Colinha do Pedro Neto · 70022
 * Tudo roda no aparelho da pessoa. Os números digitados não são enviados a lugar nenhum.
 * Dados dos candidatos: TSE · DivulgaCandContas (colinha-candidatos.json, gerado por colinha-coletar-tse.mjs).
 */
(() => {
  'use strict';

  // ---------- Configuração ----------
  // Domínio, e-mail e Instagram ficam em colinha-config.js (vale também para a política de privacidade).
  const EXTERNO = window.COLINHA_CONFIG || {};
  const linkInstagram = v => {
    v = String(v || '').trim();
    if (!v) return '';
    return /^https?:\/\//i.test(v) ? v : `https://www.instagram.com/${v.replace(/^@/, '')}/`;
  };
  const CONFIG = {
    SITE: EXTERNO.SITE != null ? String(EXTERNO.SITE) : 'pedronetogrupos.com/colinha',
    INSTAGRAM: linkInstagram(EXTERNO.INSTAGRAM),
    UF: 'RJ',
    ANO: 2026,
    ELEICAO: '20322002026',               // id da "Eleição Geral Federal 2026" no DivulgaCandContas
    DADOS_URL: 'colinha-candidatos.json',
    API_AO_VIVO: '',                      // opcional: endpoint próprio que devolve a lista do TSE já compactada
    DESTAQUE: {
      cargo: '7',
      numero: '70022',
      nome: 'Pedro Neto',
      partido: 'AVANTE',
      id: '190002538606',
      foto: 'colinha-pedro-neto.jpg',
      cnpj: '68.430.427/0001-63',
    },
  };

  const TSE = 'https://divulgacandcontas.tse.jus.br/divulga/rest';
  const PREVIA = !!window.__PREVIA__;
  const NOME_ARQUIVO = 'colinha-pedro-neto-70022.png';

  // Ordem da urna em 2026
  const CARGOS = [
    { id: 'df', cod: '6', rotulo: 'Deputado federal',  colinha: 'Deputado Federal', digitos: 4 },
    { id: 'de', cod: '7', rotulo: 'Deputado estadual', colinha: 'Deputado Estadual', digitos: 5, fixo: true },
    { id: 's1', cod: '5', rotulo: 'Senador · 1º voto', colinha: 'Senador · 1º voto', digitos: 3 },
    { id: 's2', cod: '5', rotulo: 'Senador · 2º voto', colinha: 'Senador · 2º voto', digitos: 3 },
    { id: 'gv', cod: '3', rotulo: 'Governador',        colinha: 'Governador',        digitos: 2 },
    { id: 'pr', cod: '1', rotulo: 'Presidente',        colinha: 'Presidente',        digitos: 2 },
  ];
  const EDITAVEIS = CARGOS.filter(c => !c.fixo);

  const COR = {
    amarelo: '#f8c838', verde: '#174d31', marinho: '#2b2f74',
    confirma: '#3a9b4e', confirmaSombra: '#256b37', braille: '#1d5a2f',
    rodape: '#1d7a3a', branco: '#ffffff',
  };

  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  const estado = {
    dados: null,
    aoVivo: {},
    valores: {},
    achados: {},
    pendentes: {},
    seq: {},
    blob: null,
    url: null,
    downloads: (window.claude && typeof window.claude.use === 'function')
      ? window.claude.use('downloads').catch(() => null)
      : Promise.resolve(null),
  };

  // ---------- Nomes (TSE manda em caixa alta) ----------
  const MINUSCULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du']);
  const GRAFIA = { 'FLAVIO BOLSONARO': 'Flávio Bolsonaro' };
  function nomeBonito(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (GRAFIA[s.toUpperCase()]) return GRAFIA[s.toUpperCase()];
    return s.toLowerCase().split(' ').map((w, i) =>
      i > 0 && MINUSCULAS.has(w) ? w : w.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-')
    ).join(' ');
  }
  function pesoSituacao(sit) {
    sit = String(sit || '');
    if (/ren[uú]ncia|cancelad|falecid|cassad|n[aã]o conhecid/i.test(sit)) return 3;
    if (/^indeferido/i.test(sit)) return 2;
    if (sit && !/^deferido/i.test(sit)) return 1;
    return 0;
  }
  // Lista crua do DivulgaCandContas -> { numero: [nome, partido, id, situacao?] }
  function compactar(lista) {
    const m = {};
    for (const c of lista || []) {
      const num = String(c.numero);
      const sit = c.descricaoSituacao || '';
      const atual = m[num];
      if (atual && pesoSituacao(atual[3]) <= pesoSituacao(sit)) continue;
      const e = [nomeBonito(c.nomeUrna), (c.partido && c.partido.sigla) || '', String(c.id)];
      if (sit && sit !== 'Deferido') e.push(sit);
      m[num] = e;
    }
    return m;
  }

  // ---------- Busca de candidato ----------
  function formatar(arr, cod, numero) {
    const uf = cod === '1' ? 'BR' : CONFIG.UF;
    return {
      numero, nome: arr[0], partido: arr[1], id: arr[2],
      situacao: arr[3] || 'Deferido',
      foto: arr[2] ? `${TSE}/arquivo/img/${CONFIG.ELEICAO}/${arr[2]}/${uf}` : null,
    };
  }

  function listaAoVivo(cod) {
    if (!estado.aoVivo[cod]) {
      estado.aoVivo[cod] = (async () => {
        if (CONFIG.API_AO_VIVO) {
          try {
            const r = await fetch(CONFIG.API_AO_VIVO + cod, { headers: { accept: 'application/json' } });
            if (r.ok) { const j = await r.json(); if (j && j.candidatos) return j.candidatos; }
          } catch (_) { /* segue para a próxima fonte */ }
        }
        try {
          const uf = cod === '1' ? 'BR' : CONFIG.UF;
          const r = await fetch(`${TSE}/v1/candidatura/listar/${CONFIG.ANO}/${uf}/${CONFIG.ELEICAO}/${cod}/candidatos`);
          if (r.ok) return compactar((await r.json()).candidatos);
        } catch (_) { /* sem acesso direto ao TSE (CORS) */ }
        return null;
      })();
    }
    return estado.aoVivo[cod];
  }

  async function buscar(cod, numero) {
    const base = estado.dados && estado.dados.cargos && estado.dados.cargos[cod];
    if (base && base[numero]) return formatar(base[numero], cod, numero);
    if (PREVIA) return null;
    const vivo = await listaAoVivo(cod);
    return vivo && vivo[numero] ? formatar(vivo[numero], cod, numero) : null;
  }

  // ---------- Formulário ----------
  function iniciais(nome) {
    const p = String(nome).split(' ').filter(w => w.length > 2 || /^[A-ZÀ-Ú]/.test(w));
    return ((p[0] || '').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }
  function fotoHTML(src, nome) {
    return `<span class="res-foto" aria-hidden="true">${esc(iniciais(nome))}${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>`;
  }
  function ligarFallbackFotos(el) {
    el.querySelectorAll('.res-foto img').forEach(img => {
      if (img.complete && img.naturalWidth === 0) img.remove();
      else img.addEventListener('error', () => img.remove(), { once: true });
    });
  }
  function candidatoHTML(c) {
    const problema = pesoSituacao(c.situacao) > 0;
    return `${fotoHTML(c.foto, c.nome)}
      <span class="res-txt">
        <span class="res-nome">${esc(c.nome)}</span>
        <span class="res-partido">${esc(c.partido)} · ${esc(c.numero)}</span>
        ${problema ? `<span class="tag alerta" title="Situação da candidatura no TSE">${esc(c.situacao)}</span>` : ''}
      </span>`;
  }

  function braillePontos() {
    // Decorativo, lembra o relevo da tecla CONFIRMA da urna
    return ['111 1 1111', '   1  1 1 '];
  }
  function brailleSVG(cor) {
    const rows = braillePontos(); const cols = rows[0].length; const p = 10;
    let dots = '';
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '1') dots += `<circle cx="${x * p + 5}" cy="${y * 8 + 4}" r="3"/>`; }));
    return `<svg viewBox="0 0 ${cols * p} 16" fill="${cor}" aria-hidden="true">${dots}</svg>`;
  }

  function montarLinhas() {
    const D = CONFIG.DESTAQUE;
    const cont = $('#linhas');
    cont.innerHTML = '';
    for (const c of CARGOS) {
      const el = document.createElement('div');
      el.className = 'linha' + (c.fixo ? ' fixa' : '');
      el.id = 'linha-' + c.id;
      if (c.fixo) {
        el.innerHTML = `
          <div class="linha-topo"><span class="rotulo">${esc(c.rotulo)}</span><span class="tag">Já está na sua colinha</span></div>
          <div class="caixas-linha"><div class="caixas fixas" role="img" aria-label="Número ${esc(D.numero)}">${[...D.numero].map(d => `<span class="cx">${d}</span>`).join('')}</div></div>
          <div class="resultado">${fotoHTML(D.foto, D.nome)}<span class="res-txt"><span class="res-nome">${esc(D.nome)}</span><span class="res-partido">${esc(D.partido)} · ${esc(D.numero)}</span></span></div>`;
      } else {
        el.innerHTML = `
          <div class="linha-topo"><label for="num-${c.id}">${esc(c.rotulo)}</label><span class="dig">${c.digitos} dígitos</span></div>
          <div class="caixas-linha">
            <div class="caixas">
              <input id="num-${c.id}" name="${c.id}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${c.digitos}" autocomplete="off" enterkeyhint="next" aria-describedby="res-${c.id}">
              ${'<span class="cx" aria-hidden="true"></span>'.repeat(c.digitos)}
            </div>
            <button type="button" class="limpar" id="limpar-${c.id}" aria-label="Apagar ${esc(c.rotulo)}" hidden>×</button>
          </div>
          <div class="resultado" id="res-${c.id}" aria-live="polite"></div>`;
      }
      cont.appendChild(el);
      ligarFallbackFotos(el);
    }
    for (const c of EDITAVEIS) {
      const input = $('#num-' + c.id);
      input.addEventListener('input', () => aoDigitar(c, true));
      input.addEventListener('focus', () => { pintar(c); fimDoCampo(input); });
      input.addEventListener('click', () => fimDoCampo(input));
      input.addEventListener('blur', () => pintar(c));
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); proximo(c); }
      });
      $('#limpar-' + c.id).addEventListener('click', () => { input.value = ''; aoDigitar(c, false); input.focus(); });
      atualizar(c);
    }
    $('.bc-braille').innerHTML = brailleSVG(COR.braille);
  }

  function fimDoCampo(input) {
    const n = input.value.length;
    try { input.setSelectionRange(n, n); } catch (_) { /* alguns teclados não permitem */ }
  }
  function proximo(c) {
    const i = EDITAVEIS.indexOf(c);
    const prox = EDITAVEIS[i + 1];
    if (prox) $('#num-' + prox.id).focus();
    else $('#num-' + c.id).blur();
  }

  function pintar(c) {
    const input = $('#num-' + c.id);
    const v = input.value;
    const focado = document.activeElement === input;
    const caixas = input.parentElement.querySelectorAll('.cx');
    caixas.forEach((cx, i) => {
      cx.textContent = v[i] || '';
      cx.classList.toggle('atual', focado && i === Math.min(v.length, c.digitos - 1));
    });
    $('#limpar-' + c.id).hidden = !v;
  }

  function aoDigitar(c, avancar) {
    const input = $('#num-' + c.id);
    const v = input.value.replace(/\D/g, '').slice(0, c.digitos);
    if (input.value !== v) input.value = v;
    estado.valores[c.id] = v;
    pintar(c);
    esconderMsgForm();
    const p = atualizar(c);
    if (c.cod === '5') atualizar(CARGOS.find(o => o.cod === '5' && o.id !== c.id));
    if (avancar && v.length === c.digitos) {
      p.then(() => { if (document.activeElement === input && input.value.length === c.digitos) proximo(c); });
    }
  }

  function senadorRepetido(c) {
    if (c.cod !== '5') return false;
    const outro = c.id === 's1' ? 's2' : 's1';
    const v = estado.valores[c.id];
    return !!v && v.length === c.digitos && v === estado.valores[outro];
  }

  function atualizar(c) {
    const v = estado.valores[c.id] || '';
    const res = $('#res-' + c.id);
    const linha = $('#linha-' + c.id);
    const token = (estado.seq[c.id] = (estado.seq[c.id] || 0) + 1);
    linha.classList.remove('erro');
    estado.achados[c.id] = null;

    if (!v) {
      res.innerHTML = '<span class="res-dica">Opcional. Se ficar vazio, sai em branco para você anotar à mão.</span>';
      return (estado.pendentes[c.id] = Promise.resolve());
    }
    if (v.length < c.digitos) {
      const f = c.digitos - v.length;
      res.innerHTML = `<span class="res-dica">Falta${f > 1 ? 'm' : ''} ${f} dígito${f > 1 ? 's' : ''}.</span>`;
      return (estado.pendentes[c.id] = Promise.resolve());
    }
    if (senadorRepetido(c) && c.id === 's2') {
      linha.classList.add('erro');
      res.innerHTML = '<span class="res-erro">Você já escolheu esse número no 1º voto. A urna não aceita o mesmo candidato duas vezes para senador.</span>';
      return (estado.pendentes[c.id] = Promise.resolve());
    }
    res.innerHTML = '<span class="res-dica">Consultando a base do TSE…</span>';
    const p = buscar(c.cod, v).then(cand => {
      if (token !== estado.seq[c.id]) return;
      if (cand) {
        estado.achados[c.id] = cand;
        res.innerHTML = candidatoHTML(cand);
        ligarFallbackFotos(res);
      } else {
        linha.classList.add('erro');
        res.innerHTML = '<span class="res-erro">Número não encontrado entre os candidatos do TSE para este cargo. Confira antes de votar.</span>';
      }
    }).catch(() => {
      if (token !== estado.seq[c.id]) return;
      res.innerHTML = '<span class="res-dica">Não deu para consultar agora. O número vai na colinha mesmo assim.</span>';
    });
    return (estado.pendentes[c.id] = p);
  }

  // ---------- Mensagens ----------
  function msgForm(texto) {
    let el = $('#form-msg');
    if (!el) {
      el = document.createElement('p');
      el.id = 'form-msg'; el.className = 'form-msg'; el.setAttribute('role', 'alert');
      $('#btn-gerar').insertAdjacentElement('afterend', el);
    }
    el.textContent = texto; el.hidden = false;
  }
  function esconderMsgForm() { const el = $('#form-msg'); if (el) el.hidden = true; }
  let msgTimer = 0;
  function msgModal(texto) {
    const el = $('#modal-msg');
    el.textContent = texto;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { el.textContent = ''; }, 5000);
  }

  // ---------- Colinha (canvas 5 x 9 cm) ----------
  const W = 1000, H = 1800;

  function rr(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }
  function tri(x, pts) {
    x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
    x.closePath(); x.fill();
  }
  function fonte(x, peso, tam, familia) { x.font = `${peso} ${tam}px ${familia}`; }
  function caber(x, texto, peso, tam, familia, larguraMax, minimo = 18) {
    let t = tam;
    fonte(x, peso, t, familia);
    while (t > minimo && x.measureText(texto).width > larguraMax) { t -= 1; fonte(x, peso, t, familia); }
    return t;
  }
  function espacado(x, texto, px, py, espaco) {
    let cx = px;
    for (const ch of texto) { x.fillText(ch, cx, py); cx += x.measureText(ch).width + espaco; }
  }
  function larguraEspacada(x, texto, espaco) {
    let w = 0; for (const ch of texto) w += x.measureText(ch).width + espaco; return w - espaco;
  }

  function desenharMao(x, px, py, escala, angulo) {
    // Mão apontando para cima; a ponta do dedo fica em (0,0)
    const formas = [
      [-13, 0, 26, 88, 13],   // indicador
      [-18, 58, 76, 66, 24],  // punho
      [11, 50, 22, 36, 11],   // médio dobrado
      [31, 56, 22, 32, 11],   // anelar
      [49, 64, 18, 28, 9],    // mindinho
      [-42, 76, 36, 24, 12],  // polegar
    ];
    x.save();
    x.translate(px, py); x.rotate(angulo); x.scale(escala, escala);
    x.lineJoin = 'round';
    x.strokeStyle = COR.marinho; x.lineWidth = 10;
    formas.forEach(f => { rr(x, ...f); x.stroke(); });
    x.fillStyle = COR.branco;
    formas.forEach(f => { rr(x, ...f); x.fill(); });
    x.strokeStyle = COR.marinho; x.lineWidth = 4; x.lineCap = 'round';
    x.beginPath();
    x.moveTo(11, 66); x.lineTo(11, 90);
    x.moveTo(31, 68); x.lineTo(31, 90);
    x.moveTo(49, 74); x.lineTo(49, 92);
    x.moveTo(-8, 94); x.lineTo(10, 97);
    x.stroke();
    x.fillStyle = COR.marinho;
    rr(x, -20, 122, 80, 20, 7); x.fill();
    x.restore();
  }

  function desenharBotao(x, bx, by, bw, bh, comMao) {
    x.fillStyle = COR.confirmaSombra; rr(x, bx, by + 9, bw, bh, 18); x.fill();
    x.fillStyle = COR.confirma; rr(x, bx, by, bw, bh, 18); x.fill();
    x.fillStyle = COR.branco; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    caber(x, 'CONFIRMA', 700, 40, 'Poppins', bw - 30);
    x.fillText('CONFIRMA', bx + bw / 2, by + 50);
    x.textAlign = 'left';
    const rows = braillePontos(); const passo = 17;
    const larg = (rows[0].length - 1) * passo;
    const x0 = bx + bw / 2 - larg / 2;
    x.fillStyle = COR.braille;
    rows.forEach((r, j) => [...r].forEach((ch, i) => {
      if (ch !== '1') return;
      x.beginPath(); x.arc(x0 + i * passo, by + 72 + j * 15, 5.2, 0, Math.PI * 2); x.fill();
    }));
    if (comMao) desenharMao(x, bx + 64, by + 64, 0.68, Math.PI * 0.33);
  }

  function desenharFoto(x, img, px, py, tam) {
    x.save();
    x.shadowColor = 'rgba(0,0,0,.18)'; x.shadowBlur = 16; x.shadowOffsetY = 6;
    x.fillStyle = COR.branco; rr(x, px, py, tam, tam, 30); x.fill();
    x.restore();
    if (!img) return;
    const m = 12;
    x.save();
    rr(x, px + m, py + m, tam - 2 * m, tam - 2 * m, 20); x.clip();
    const s = Math.max((tam - 2 * m) / img.width, (tam - 2 * m) / img.height);
    const w = img.width * s, h = img.height * s;
    x.drawImage(img, px + tam / 2 - w / 2, py + tam / 2 - h / 2, w, h);
    x.restore();
  }

  function desenharColinha(escolhas, foto) {
    const D = CONFIG.DESTAQUE;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    x.textBaseline = 'alphabetic';

    // Fundo e cantos
    x.fillStyle = COR.amarelo; x.fillRect(0, 0, W, H);
    x.fillStyle = COR.verde;
    tri(x, [[690, 0], [W, 0], [W, 330]]);
    tri(x, [[0, 1510], [0, H], [300, H]]);

    // Cabeçalho do candidato
    x.fillStyle = COR.marinho;
    fonte(x, 700, 30, 'Poppins');
    espacado(x, 'DEPUTADO ESTADUAL', 64, 126, 6);
    const nome = D.nome.toUpperCase();
    caber(x, nome, 800, 100, 'Poppins', 620);
    x.fillText(nome, 58, 222);
    x.fillStyle = COR.verde;
    caber(x, D.numero, 800, 204, 'Poppins', 630);
    x.fillText(D.numero, 50, 402);

    desenharFoto(x, foto, 712, 76, 238);
    x.fillStyle = COR.marinho;
    fonte(x, 800, 30, 'Poppins');
    const lp = larguraEspacada(x, D.partido, 5);
    espacado(x, D.partido, 831 - lp / 2, 368, 5);

    // Faixa
    x.fillStyle = COR.verde;
    rr(x, 56, 440, 890, 96, 8); x.fill();
    tri(x, [[56, 520], [56, 572], [104, 530]]);
    x.fillStyle = COR.branco;
    caber(x, 'Você votará na seguinte ordem:', 800, 54, 'Poppins', 846);
    x.fillText('Você votará na seguinte ordem:', 80, 507);

    // Linhas
    // Linha do destaque ganha um respiro extra para a mãozinha não encostar no próximo nome
    const y0 = 578, passo = 171, folga = 26, cx = 104, gap = 14;
    let extra = 0;
    escolhas.forEach((e, i) => {
      const y = y0 + i * passo + extra;
      if (e.destaque) extra += folga;
      const c = e.cargo;

      if (e.destaque) {
        x.fillStyle = COR.marinho;
        const t = `${c.colinha} ${D.nome}`;
        caber(x, t, 700, 42, 'Poppins', 880);
        x.fillText(t, 60, y + 38);
      } else {
        x.fillStyle = COR.verde;
        fonte(x, 800, 42, 'Nunito');
        x.fillText(c.colinha, 60, y + 38);
        const lw = x.measureText(c.colinha).width;
        if (e.nome) {
          x.textAlign = 'right';
          caber(x, e.nome, 700, 40, 'Poppins', 946 - (60 + lw + 28), 22);
          x.fillText(e.nome, 946, y + 38);
          x.textAlign = 'left';
        }
      }

      for (let k = 0; k < c.digitos; k++) {
        const bx = 60 + k * (cx + gap), by = y + 54;
        if (e.destaque) {
          x.fillStyle = COR.marinho; rr(x, bx, by, cx, 104, 22); x.fill();
          x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 3; rr(x, bx + 5, by + 5, cx - 10, 94, 18); x.stroke();
        } else {
          x.fillStyle = COR.branco; rr(x, bx, by, cx, 104, 22); x.fill();
        }
        const d = e.numero[k];
        if (d) {
          x.fillStyle = e.destaque ? COR.branco : COR.verde;
          x.textAlign = 'center'; x.textBaseline = 'middle';
          fonte(x, 800, 80, 'Poppins');
          x.fillText(d, bx + cx / 2, by + 56);
          x.textAlign = 'left'; x.textBaseline = 'alphabetic';
        }
      }
      desenharBotao(x, 700, y + 50, 246, 108, e.destaque);
    });

    // Rodapé
    x.strokeStyle = COR.verde; x.lineWidth = 5;
    x.beginPath(); x.moveTo(236, 1640); x.lineTo(946, 1640); x.stroke();
    x.fillStyle = COR.rodape; x.textAlign = 'center';
    const centro = 591, larg = 700;
    const l1 = `ELEIÇÃO 2026 · ${D.nome.toUpperCase()} · DEPUTADO ESTADUAL ${D.numero} · ${D.partido}`;
    caber(x, l1, 700, 24, 'Poppins', larg, 14);
    x.fillText(l1, centro, 1684);
    if (D.cnpj) {
      caber(x, `CNPJ CANDIDATO: ${D.cnpj}`, 700, 24, 'Poppins', larg, 14);
      x.fillText(`CNPJ CANDIDATO: ${D.cnpj}`, centro, 1718);
    }
    if (CONFIG.SITE) {
      x.fillStyle = COR.verde;
      caber(x, `Faça a sua: ${CONFIG.SITE}`, 800, 28, 'Poppins', larg, 14);
      x.fillText(`Faça a sua: ${CONFIG.SITE}`, centro, 1764);
    }
    x.textAlign = 'left';
    return cv;
  }

  function carregarImagem(src) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = src;
    });
  }
  async function fontesProntas() {
    if (!document.fonts || !document.fonts.load) return;
    try {
      await Promise.all([
        '800 80px Poppins', '700 40px Poppins', '600 30px Poppins',
        '800 42px Nunito', '700 20px Nunito',
      ].map(f => document.fonts.load(f)));
      await document.fonts.ready;
    } catch (_) { /* usa a fonte de reserva */ }
  }

  function montarEscolhas() {
    const D = CONFIG.DESTAQUE;
    return CARGOS.map(c => {
      if (c.fixo) return { cargo: c, numero: D.numero, nome: D.nome, destaque: true };
      const v = estado.valores[c.id] || '';
      const a = estado.achados[c.id];
      return { cargo: c, numero: v.length === c.digitos ? v : '', nome: v.length === c.digitos && a ? a.nome : '', destaque: false };
    });
  }

  let fotoDestaque = null;
  async function gerar() {
    await fontesProntas();
    if (!fotoDestaque) fotoDestaque = await carregarImagem(CONFIG.DESTAQUE.foto);
    const cv = desenharColinha(montarEscolhas(), fotoDestaque);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    if (estado.url) URL.revokeObjectURL(estado.url);
    estado.blob = blob;
    estado.url = URL.createObjectURL(blob);
    $('#img-colinha').src = estado.url;
    $('#img-impressao').src = estado.url;
  }

  // ---------- Modal e ações ----------
  let focoAntes = null;
  function abrirModal() {
    focoAntes = document.activeElement;
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
    const m = $('#modal-msg');
    m.textContent = m.dataset.dica ? 'Toque e segure a imagem para salvar no celular.' : '';
    $('.modal-x').focus();
  }
  function fecharModal() {
    $('#modal').hidden = true;
    document.body.style.overflow = '';
    if (focoAntes && focoAntes.focus) focoAntes.focus();
  }

  function linkAtual() {
    const cod = EDITAVEIS.map(c => estado.valores[c.id] || '').join('-');
    const base = location.origin + location.pathname;
    return /\d/.test(cod) ? `${base}#c=${cod}` : base;
  }
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch (_) { /* fallback abaixo */ }
    const t = document.createElement('textarea');
    t.value = texto; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    t.remove();
    return ok;
  }

  async function compartilhar() {
    const texto = `Minha colinha para 4 de outubro. Pedro Neto 70022 para Deputado Estadual. Faça a sua: ${linkAtual()}`;
    if (estado.blob && navigator.canShare) {
      const arq = new File([estado.blob], NOME_ARQUIVO, { type: 'image/png' });
      if (navigator.canShare({ files: [arq] })) {
        try { await navigator.share({ files: [arq], text: texto }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
    }
    if (navigator.share) {
      try { await navigator.share({ title: 'Minha colinha', text: texto, url: linkAtual() }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const ok = await copiar(texto);
    msgModal(ok ? 'Texto e link copiados. Cole no WhatsApp.' : 'Não foi possível compartilhar daqui. Use o botão Baixar.');
  }

  async function baixar() {
    if (!estado.blob) return;
    const dl = await estado.downloads;
    if (dl) {
      try { await dl.save({ filename: NOME_ARQUIVO, data: estado.blob }); msgModal('Colinha salva.'); }
      catch (e) { if (!e || e.code !== 'declined') msgModal('Não deu para salvar aqui. Toque e segure a imagem para salvar.'); }
      return;
    }
    const a = document.createElement('a');
    a.href = estado.url; a.download = NOME_ARQUIVO;
    document.body.appendChild(a); a.click(); a.remove();
    msgModal('Colinha baixada.');
  }

  // ---------- Início ----------
  function validar() {
    for (const c of EDITAVEIS) {
      const v = estado.valores[c.id] || '';
      if (v && v.length < c.digitos) {
        msgForm(`Complete o número de ${c.rotulo.toLowerCase()} ou apague para deixar em branco.`);
        $('#num-' + c.id).focus();
        return false;
      }
      if (senadorRepetido(c) && c.id === 's2') {
        msgForm('Os dois votos para senador precisam ser em candidatos diferentes.');
        $('#num-s2').focus();
        return false;
      }
    }
    return true;
  }

  async function aoGerar(e) {
    if (e) e.preventDefault();
    if (!validar()) return;
    const btn = $('#btn-gerar');
    btn.disabled = true;
    try {
      await Promise.all(Object.values(estado.pendentes));
      await gerar();
      abrirModal();
    } catch (err) {
      msgForm('Não foi possível gerar a colinha. Tente de novo.');
    } finally {
      btn.disabled = false;
    }
  }

  function lerLink() {
    const m = /^#c=([\d-]*)$/.exec(location.hash || '');
    if (!m) return false;
    const partes = m[1].split('-');
    let algum = false;
    EDITAVEIS.forEach((c, i) => {
      const v = (partes[i] || '').replace(/\D/g, '').slice(0, c.digitos);
      if (v) { $('#num-' + c.id).value = v; aoDigitar(c, false); algum = true; }
    });
    return algum;
  }

  function dataBR(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  }

  async function carregarDados() {
    if (window.__DADOS__) return window.__DADOS__;
    try {
      const r = await fetch(CONFIG.DADOS_URL, { cache: 'no-cache' });
      if (r.ok) return await r.json();
    } catch (_) { /* segue sem base local */ }
    return null;
  }

  async function iniciar() {
    if (CONFIG.INSTAGRAM) {
      const a = $('#link-insta');
      const handle = CONFIG.INSTAGRAM.replace(/\/+$/, '').split('/').pop();
      a.href = CONFIG.INSTAGRAM; a.textContent = '@' + handle; a.hidden = false;
    }
    if (PREVIA) {
      $('#btn-imprimir').hidden = true;
      $('#btn-link').hidden = true;
      $('#btn-compartilhar').hidden = true;
      $('#btn-baixar').classList.add('acao-principal');
      $('#btn-editar').classList.add('acao-larga');
      estado.downloads.then(dl => {
        if (!dl) { $('#btn-baixar').hidden = true; $('#modal-msg').dataset.dica = '1'; }
      });
    }

    montarLinhas();
    $('#form').addEventListener('submit', aoGerar);
    $('#btn-compartilhar').addEventListener('click', compartilhar);
    $('#btn-baixar').addEventListener('click', baixar);
    $('#btn-imprimir').addEventListener('click', () => window.print());
    $('#btn-link').addEventListener('click', async () => {
      const ok = await copiar(linkAtual());
      msgModal(ok ? 'Link copiado.' : linkAtual());
    });
    document.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fecharModal));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) fecharModal(); });

    estado.dados = await carregarDados();
    if (estado.dados && estado.dados.coletado_em) {
      $('#base-data').textContent = `Base atualizada em ${dataBR(estado.dados.coletado_em)}.`;
    }
    // Reconsulta o que já foi digitado antes da base chegar
    EDITAVEIS.forEach(c => { if (estado.valores[c.id]) atualizar(c); });

    if (lerLink()) {
      await Promise.all(Object.values(estado.pendentes));
      aoGerar();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();

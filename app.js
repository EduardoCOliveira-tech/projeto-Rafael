import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } 
       from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, limit, Timestamp, doc, updateDoc, deleteDoc, increment, getDoc, writeBatch, enableIndexedDbPersistence, startAfter } 
       from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// ============================================================
// 1. CONFIGURAÇÃO
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyBx34219zAWq6qtvs7qO3-SMSVRHJ5dX8M",
  authDomain: "projeto-rafael-f9eef.firebaseapp.com",
  projectId: "projeto-rafael-f9eef",
  storageBucket: "projeto-rafael-f9eef.firebasestorage.app",
  messagingSenderId: "1058117376976",
  appId: "1:1058117376976:web:78a6891a5ec9904d7637d5",
  measurementId: "G-NWXV5KCE2V"
};

let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    // ATIVAR CACHE OFFLINE (Deixa o carregamento instantâneo)
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.log('Múltiplas abas abertas. Persistência habilitada apenas em uma.');
        } else if (err.code == 'unimplemented') {
            console.log('Navegador não suporta persistência.');
        }
    });
} catch (e) {
    console.error("Erro Firebase:", e);
}

// ============================================================
// 2. GLOBAIS
// ============================================================
let chartInstance = null;
let dailyChartInstance = null; 
let chartGastoStatus = null;
let chartGastoMetodo = null;
let chartGastoEvolucao = null;
let chartRelatorio = null;

let produtosCache = [];
let clientesCache = [];
let categoriasCache = [];
let bancosCache = [];
let metodosCache = ["Dinheiro", "Pix", "Débito", "Crédito", "Fiado"];
let gastosCache = [];
let historicoCache = [];
let devedoresCache = [];

let carrinho = [];
let pagamentosVenda = [];
let filtroCategoriaEstoque = "TODOS";
let ordenacaoAtual = { coluna: null, direcao: 'asc' };

let isFiltroRapido = false;       // Controla se o usuário clicou nos botões de dia/semana/mês
let histPaginaAtual = 1;          // Página atual
let histStackDocs = [];           // Pilha para guardar onde começa/termina cada página (para poder voltar)
let histUltimoDoc = null;         // Último documento carregado na busca atual

const COLECAO_VENDAS = 'loja_vendas';
const COLECAO_PRODUTOS = 'loja_produtos';
const COLECAO_CATEGORIAS = 'loja_categorias_config';
const COLECAO_CLIENTES = 'loja_clientes';
const COLECAO_GASTOS = 'loja_gastos';
const COLECAO_BANCOS = 'loja_bancos';
const COLECAO_METODOS = 'loja_metodos_pagamento';

// ============================================================
// 3. UTILITÁRIOS (UI)
// ============================================================
window.mostrarLoading = (show) => {
    const el = document.getElementById('loading-indicator');
    if(el) show ? el.classList.remove('hidden') : el.classList.add('hidden');
};

window.mostrarAlerta = (titulo, msg, tipo = 'info') => {
    const modal = document.getElementById('modal-alert');
    if(!modal) return alert(msg);
    document.getElementById('alert-title').innerText = titulo;
    document.getElementById('alert-msg').innerText = msg;
    const icon = document.getElementById('alert-icon');
    if(icon) {
        icon.className = 'fas custom-icon ' + (tipo === 'success' ? 'icon-success fa-check-circle' : tipo === 'error' ? 'icon-error fa-times-circle' : 'icon-info fa-info-circle');
    }
    modal.classList.remove('hidden');
};

window.mostrarConfirmacao = (titulo, msg, callback) => {
    const modal = document.getElementById('modal-confirm');
    if(!modal) { if(confirm(msg)) callback(); return; }
    document.getElementById('confirm-title').innerText = titulo;
    document.getElementById('confirm-msg').innerText = msg;
    modal.classList.remove('hidden');
    const btnSim = document.getElementById('btn-confirm-action');
    const novoBtn = btnSim.cloneNode(true);
    btnSim.parentNode.replaceChild(novoBtn, btnSim);
    novoBtn.onclick = () => { modal.classList.add('hidden'); callback(); };
};

window.mostrarPrompt = (titulo, msg) => {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-prompt');
        if(!modal) return resolve(prompt(msg));
        const input = document.getElementById('prompt-input');
        const btn = document.getElementById('btn-confirm-prompt');
        document.getElementById('prompt-title').innerText = titulo;
        document.getElementById('prompt-msg').innerText = msg;
        input.value = '';
        modal.classList.remove('hidden');
        input.focus();
        const novoBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(novoBtn, btn);
        const fechar = () => { modal.classList.add('hidden'); };
        novoBtn.onclick = () => { if(input.value.trim()){ fechar(); resolve(input.value.trim()); } };
        modal.querySelector('button:first-child').onclick = () => { fechar(); resolve(null); };
    });
};

window.alert = (msg) => window.mostrarAlerta("Aviso", msg, 'info');

window.ordenarTabela = (tipo, coluna) => {
    if (ordenacaoAtual.coluna === coluna) {
        ordenacaoAtual.direcao = ordenacaoAtual.direcao === 'asc' ? 'desc' : 'asc';
    } else {
        ordenacaoAtual.coluna = coluna;
        ordenacaoAtual.direcao = 'asc';
    }
    const sortFn = (a, b) => {
        let valA = a[coluna]; let valB = b[coluna];
        if (valA == null) valA = ""; if (valB == null) valB = "";
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return ordenacaoAtual.direcao === 'asc' ? -1 : 1;
        if (valA > valB) return ordenacaoAtual.direcao === 'asc' ? 1 : -1;
        return 0;
    };
    if (tipo === 'estoque') { produtosCache.sort(sortFn); renderizarTabelaEstoque(); }
    else if (tipo === 'gastos') { gastosCache.sort(sortFn); renderizarTabelaGastos(); }
    else if (tipo === 'historico') { historicoCache.sort(sortFn); renderizarTabelaHistorico(); }
    else if (tipo === 'clientes') { clientesCache.sort(sortFn); renderizarTabelaClientes(); }
    else if (tipo === 'devedores') { devedoresCache.sort(sortFn); renderizarTabelaDevedores(); }
};

function configurarCheckboxes(m,c,b,cnt){
    const master=document.getElementById(m);
    const checks=document.querySelectorAll('.'+c);
    const bar=document.getElementById(b);
    if(!master)return;
    master.onclick=()=>{checks.forEach(k=>k.checked=master.checked);up();};
    checks.forEach(k=>k.onclick=()=>{if(!k.checked)master.checked=false;up();});
    function up(){const n=document.querySelectorAll('.'+c+':checked').length;if(n>0)bar.classList.remove('hidden');else bar.classList.add('hidden');}
}

// ============================================================
// 4. FUNÇÕES PRINCIPAIS
// ============================================================

// --- ESTOQUE (OTIMIZADO) ---
async function carregarEstoque() {
    const snap = await getDocs(query(collection(db, COLECAO_PRODUTOS), orderBy("nome")));
    produtosCache = [];
    
    const dv = document.getElementById('list-produtos-venda');
    const dbusca = document.getElementById('list-busca-estoque');
    const dsug = document.getElementById('list-sugestoes-produtos');
    
    if(dv) dv.innerHTML = ''; 
    if(dbusca) dbusca.innerHTML = ''; 
    if(dsug) dsug.innerHTML = '';

    let optionsHtml = '';

    snap.forEach(d => {
        const p = d.data();
        produtosCache.push({ id: d.id, ...p });
        optionsHtml += `<option value="${p.nome}">`;
    });

    if(dv) dv.innerHTML = optionsHtml;
    if(dbusca) dbusca.innerHTML = optionsHtml;
    if(dsug) dsug.innerHTML = optionsHtml;

    renderizarTabelaEstoque();
}
window.carregarEstoque = carregarEstoque;

function renderizarTabelaEstoque() {
    const tb = document.querySelector('#tabela-estoque tbody');
    if(!tb) return;
    
    let sumCusto = 0; 
    let sumRevenda = 0;
    const lista = filtroCategoriaEstoque === "TODOS" ? produtosCache : produtosCache.filter(p => p.categoria === filtroCategoriaEstoque);

    let htmlBuffer = '';
    
    lista.forEach(p => {
        const totC = (p.custo||0)*(p.qtd||0);
        const totR = (p.venda||0)*(p.qtd||0);
        sumCusto += totC; sumRevenda += totR;
        
        htmlBuffer += `<tr>
            <td style="text-align:center"><input type="checkbox" class="stock-checkbox" value="${p.id}"></td>
            <td>${p.nome}</td>
            <td><span class="badge" style="background:#e0e7ff; color:#3730a3">${p.categoria||'GER'}</span></td>
            <td>R$ ${p.custo.toFixed(2)}</td>
            <td>R$ ${p.venda.toFixed(2)}</td>
            <td style="font-weight:bold; color:${p.qtd<=5?'red':'inherit'}">${p.qtd}</td>
            <td style="color:#64748b">R$ ${totC.toFixed(2)}</td>
            <td style="color:#10b981; font-weight:bold">R$ ${totR.toFixed(2)}</td>
            <td>
                <button onclick="window.abrirEditarProduto('${p.id}')" class="btn-icon btn-edit"><i class="fas fa-edit"></i></button>
                <button onclick="window.excluirProduto('${p.id}')" class="btn-icon btn-delete"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });

    tb.innerHTML = htmlBuffer;

    const elSumCusto = document.getElementById('sum-total-custo');
    const elSumRev = document.getElementById('sum-total-revenda');
    if(elSumCusto) elSumCusto.innerText = `R$ ${sumCusto.toFixed(2)}`;
    if(elSumRev) elSumRev.innerText = `R$ ${sumRevenda.toFixed(2)}`;
    configurarCheckboxes('select-all-stock', 'stock-checkbox', 'bulk-actions-estoque', null);
}

window.aplicarFiltroCategoria = () => { filtroCategoriaEstoque = document.getElementById('filtro-categoria-estoque').value; renderizarTabelaEstoque(); };
window.verificarEstoqueBaixo = (forcarAbrir = false) => {
    const lista = produtosCache.filter(p => p.qtd <= 5);
    const divLista = document.getElementById('low-stock-list');
    if(divLista) {
        divLista.innerHTML = '';
        if (lista.length > 0) {
            let html = '';
            lista.forEach(p => { html += `<div class="stock-warning-item"><span>${p.nome}</span><span style="font-weight:bold; color:red">${p.qtd} un.</span></div>`; });
            divLista.innerHTML = html;
            if (forcarAbrir || sessionStorage.getItem('estoqueBaixoVisto') !== 'true') { document.getElementById('modal-low-stock').classList.remove('hidden'); sessionStorage.setItem('estoqueBaixoVisto', 'true'); }
        } else { if(forcarAbrir) window.mostrarAlerta("Tudo Certo", "Nenhum produto com estoque baixo.", "success"); }
    }
};

// --- GASTOS (OTIMIZADO) ---
async function carregarGastos() {
    const mesInput = document.getElementById('mes-gastos').value; 
    const [ano, mes] = mesInput.split('-');
    const inicio = new Date(ano, mes - 1, 1);
    const fim = new Date(ano, mes, 0, 23, 59, 59);
    const q = query(collection(db, COLECAO_GASTOS), where("dataEntrada", ">=", Timestamp.fromDate(inicio)), where("dataEntrada", "<=", Timestamp.fromDate(fim)), orderBy("dataEntrada", "desc"));
    const snap = await getDocs(q);
    gastosCache = [];
    snap.forEach(d => { gastosCache.push({id: d.id, ...d.data()}); });
    renderizarTabelaGastos();
}
window.carregarGastos = carregarGastos;

function renderizarTabelaGastos() {
    const tbody = document.querySelector('#tabela-gastos tbody');
    if(!tbody) return;
    
    let totalMes = 0;
    const statusCount = { pago: 0, pendente: 0 };
    const metodoCount = {};
    const evolucaoDia = {};
    let htmlBuffer = '';

    gastosCache.forEach(g => {
        totalMes += g.valor;
        const dataF = new Date(g.dataEntrada.seconds * 1000).toLocaleDateString('pt-BR');
        const vencF = g.vencimento ? new Date(g.vencimento).toLocaleDateString('pt-BR') : '-';
        const badge = g.status === 'pago' ? 'badge-success' : 'badge-danger';
        
        if(g.status === 'pago') statusCount.pago += g.valor; else statusCount.pendente += g.valor;
        if(g.status === 'pago' && g.metodo) metodoCount[g.metodo] = (metodoCount[g.metodo] || 0) + g.valor;
        const dia = new Date(g.dataEntrada.seconds * 1000).getDate();
        evolucaoDia[dia] = (evolucaoDia[dia] || 0) + g.valor;

        htmlBuffer += `<tr><td style="text-align:center"><input type="checkbox" class="gasto-checkbox" value="${g.id}"></td><td>${dataF}</td><td>${g.nome}</td><td>${g.banco||'-'}</td><td>${g.metodo||'-'}</td><td>${vencF}</td><td>R$ ${g.valor.toFixed(2)}</td><td><span class="badge ${badge}">${g.status.toUpperCase()}</span></td><td><button onclick="window.abrirEditarGasto('${g.id}')" class="btn-icon btn-edit"><i class="fas fa-edit"></i></button><button onclick="window.excluirGasto('${g.id}')" class="btn-icon btn-delete"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    
    tbody.innerHTML = htmlBuffer;
    document.getElementById('kpi-gastos').innerText = `R$ ${totalMes.toFixed(2)}`;
    configurarCheckboxes('select-all-gastos', 'gasto-checkbox', 'bulk-actions-gastos', null);
    renderGastosCharts(statusCount, metodoCount, evolucaoDia);
}

// --- CLIENTES (OTIMIZADO) ---
async function carregarClientes() {
    const snap = await getDocs(query(collection(db, COLECAO_CLIENTES), orderBy("nome")));
    clientesCache = [];
    const datalist = document.getElementById('list-clientes-venda');
    
    let optionsHtml = '<option value="Consumidor Final">';
    snap.forEach(d => { 
        const c = d.data(); 
        clientesCache.push({ id: d.id, ...c });
        optionsHtml += `<option value="${c.nome}">`;
    });
    
    if(datalist) datalist.innerHTML = optionsHtml;
    renderizarTabelaClientes();
}
window.carregarClientes = carregarClientes;

function renderizarTabelaClientes() {
    const tbody = document.querySelector('#tabela-clientes tbody');
    if(!tbody) return;
    let htmlBuffer = '';
    clientesCache.forEach(c => {
        htmlBuffer += `<tr><td style="text-align:center"><input type="checkbox" class="cli-checkbox" value="${c.id}"></td><td>${c.nome}</td><td>${c.tel||'-'}</td><td>${c.cpf||'-'}</td><td><button onclick="window.abrirEditarCliente('${c.id}')" class="btn-icon btn-edit"><i class="fas fa-edit"></i></button><button onclick="window.excluirCliente('${c.id}')" class="btn-icon btn-delete"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    tbody.innerHTML = htmlBuffer;
    configurarCheckboxes('select-all-cli', 'cli-checkbox', 'bulk-actions-clientes', null);
}

// --- DEVEDORES (OTIMIZADO) ---
async function carregarDevedores() {
    const s = await getDocs(query(collection(db,COLECAO_VENDAS),where("pago","==",false)));
    const dvMap = {};
    s.forEach(d => { const v=d.data(); if(!dvMap[v.cliente]) dvMap[v.cliente]=0; dvMap[v.cliente]+=v.total; });
    devedoresCache = Object.keys(dvMap).map(nome => ({ nome: nome, total: dvMap[nome] })).filter(d => d.total > 0.01);
    renderizarTabelaDevedores();
}
window.carregarDevedores = carregarDevedores;

function renderizarTabelaDevedores() {
    const tbody = document.querySelector('#tabela-devedores tbody');
    if(!tbody) return;
    let htmlBuffer = '';
    devedoresCache.forEach(d => {
        htmlBuffer += `<tr><td style="text-align:center"><input type="checkbox" class="dev-checkbox" value="${d.nome}"></td><td>${d.nome}</td><td style="color:var(--danger)">R$ ${d.total.toFixed(2)}</td><td><button onclick="window.verDetalhesDevedor('${d.nome}')" class="btn-primary" style="font-size:0.8rem;margin-right:5px">Ver</button><button onclick="window.abrirModalAbatimento('${d.nome}')" class="btn-success" style="font-size:0.8rem;padding:6px 14px"><i class="fas fa-hand-holding-usd"></i> Pagar</button></td></tr>`;
    });
    tbody.innerHTML = htmlBuffer;
    configurarCheckboxes('select-all-dev','dev-checkbox','bulk-actions-devedores',null);
}

// --- HISTÓRICO (OTIMIZADO) ---
async function carregarHistorico() {
    const i = new Date(document.getElementById('data-inicio').value + 'T00:00:00');
    const f = new Date(document.getElementById('data-fim').value + 'T23:59:59');
    
    let q;

    // --- LÓGICA DE PAGINAÇÃO ---
    if (isFiltroRapido) {
        // Se for filtro rápido, traz "tudo" (limite 1000 para segurança) e esconde paginação
        document.getElementById('paginacao-historico').classList.add('hidden');
        q = query(collection(db, COLECAO_VENDAS), 
            where("data", ">=", Timestamp.fromDate(i)), 
            where("data", "<=", Timestamp.fromDate(f)), 
            orderBy("data", "desc"), 
            limit(1000)
        );
    } else {
        // Se for navegação normal, aplica paginação de 50
        document.getElementById('paginacao-historico').classList.remove('hidden');
        
        let queryConstraints = [
            collection(db, COLECAO_VENDAS),
            where("data", ">=", Timestamp.fromDate(i)),
            where("data", "<=", Timestamp.fromDate(f)),
            orderBy("data", "desc"),
            limit(50)
        ];

        // Se não for a página 1, precisamos dizer ao Firebase para começar DEPOIS do último da página anterior
        if (histPaginaAtual > 1 && histStackDocs[histPaginaAtual - 2]) {
            queryConstraints.push(startAfter(histStackDocs[histPaginaAtual - 2]));
        }

        q = query(...queryConstraints);
    }

    const s = await getDocs(q);
    historicoCache = [];
    
    // Salva o último documento dessa leva para usar como cursor da próxima página
    if (!isFiltroRapido && s.docs.length > 0) {
        histUltimoDoc = s.docs[s.docs.length - 1];
        histStackDocs[histPaginaAtual - 1] = histUltimoDoc;
    }

    s.forEach(d => { historicoCache.push({ id: d.id, ...d.data() }); });
    
    renderizarTabelaHistorico();
    
    // Atualiza o estado dos botões de paginação
    if (!isFiltroRapido) {
        document.getElementById('info-paginacao').innerText = `Pág. ${histPaginaAtual}`;
        document.getElementById('btn-ant-hist').disabled = (histPaginaAtual === 1);
        
        // Se veio menos de 50 itens, significa que acabou a lista, desabilita o botão Próxima
        document.getElementById('btn-prox-hist').disabled = (s.docs.length < 50);
    }
}
window.carregarHistorico = carregarHistorico;

function renderizarTabelaHistorico() {
    const tbody = document.querySelector('#tabela-historico tbody');
    if(!tbody) return;
    let htmlBuffer = '';
    historicoCache.forEach(v => {
        // Adicionamos o 'options' para incluir a hora
        const dataObj = v.data && v.data.seconds ? new Date(v.data.seconds * 1000) : null;
        const dataF = dataObj ? dataObj.toLocaleDateString('pt-BR') + ' ' + dataObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '-';
        let pg = v.metodo === 'aver' ? 'Fiado' : v.metodo;
        let b = v.pago ? 'badge-success' : 'badge-warning';
        let st = v.pago ? 'PAGO' : 'PENDENTE';
        let rowStyle = '';
        if(v.total < 0 && !v.pago) { b = 'badge-success'; st = 'PAGTO DÍVIDA'; rowStyle = 'style="background:#f0fdf4"'; }
        
        htmlBuffer += `<tr ${rowStyle}><td style="text-align:center"><input type="checkbox" class="sale-checkbox" value="${v.id}"></td><td>${dataF}</td><td>${v.cliente}</td><td>${v.produtoNome}</td><td>${v.qtd||1}</td><td style="${v.total<0?'color:green;font-weight:bold':''}">${v.total<0?'R$ '+Math.abs(v.total).toFixed(2)+' (Abatido)':'R$ '+v.total.toFixed(2)}</td><td>${pg}</td><td><span class="badge ${b}">${st}</span></td><td><button onclick="window.abrirEdicao('${v.id}','${v.total}','${v.metodo}')" class="btn-icon btn-edit"><i class="fas fa-edit"></i></button></td></tr>`;
    });
    tbody.innerHTML = htmlBuffer;
    configurarCheckboxes('select-all','sale-checkbox','bulk-actions',null);
}

// --- DASHBOARD (ATUALIZADO - TOTAL DIÁRIO) ---
async function carregarDashboard() {
    const i = new Date(document.getElementById('data-inicio').value + 'T00:00:00'); 
    const f = new Date(document.getElementById('data-fim').value + 'T23:59:59');
    
    const qV = query(collection(db, COLECAO_VENDAS), where("data", ">=", Timestamp.fromDate(i)), where("data", "<=", Timestamp.fromDate(f)));
    const qG = query(collection(db, COLECAO_GASTOS), where("dataEntrada", ">=", Timestamp.fromDate(i)), where("dataEntrada", "<=", Timestamp.fromDate(f)));
    const qFiadoTotal = query(collection(db, COLECAO_VENDAS), where("pago", "==", false));
    
    const [sv, sg, sf] = await Promise.all([getDocs(qV), getDocs(qG), getDocs(qFiadoTotal)]);
    
    let fat = 0, custo = 0, gastos = 0;
    
    // Objeto para agregar o total por dia
    const mapVendasDia = {}; 

    sv.forEach(d => { 
        const v = d.data(); 
        if(v.produtoNome !== "PAGAMENTO DÍVIDA"){ 
            fat += v.total; 
            custo += v.custo || 0; 
            
            // Agrega valor no dia
            const dia = v.data.toDate().toLocaleDateString('pt-BR').slice(0, 5); // dd/mm
            mapVendasDia[dia] = (mapVendasDia[dia] || 0) + v.total;
        } 
    });
    
    sg.forEach(d => gastos += d.data().valor);
    
    let fiadoGeral = 0; 
    sf.forEach(d => { fiadoGeral += d.data().total; });
    
    // Atualiza KPIs
    document.getElementById('kpi-faturamento').innerText = `R$ ${fat.toFixed(2)}`; 
    document.getElementById('kpi-fiado').innerText = `R$ ${fiadoGeral.toFixed(2)}`; 
    document.getElementById('kpi-gastos').innerText = `R$ ${gastos.toFixed(2)}`; 
    document.getElementById('kpi-lucro').innerText = `R$ ${(fat-custo-gastos).toFixed(2)}`;
    
    // Chama renderização do novo gráfico simples
    renderDailySalesChart(mapVendasDia);
}
window.carregarDashboard = carregarDashboard;

// Nova Função para Gráfico de Vendas Totais por Dia
function renderDailySalesChart(dadosMap) {
    const ctx = document.getElementById('dailySalesChart'); 
    if(!ctx) return;
    
    if(chartInstance) chartInstance.destroy();

    // Ordena as datas (eixo X)
    const labelsDias = Object.keys(dadosMap).sort((a, b) => {
        const [d1, m1] = a.split('/').map(Number);
        const [d2, m2] = b.split('/').map(Number);
        return (m1 - m2) || (d1 - d2);
    });

    const dataValues = labelsDias.map(dia => dadosMap[dia]);

    chartInstance = new Chart(ctx.getContext('2d'), { 
        type: 'bar', 
        data: { 
            labels: labelsDias, 
            datasets: [{
                label: 'Total Vendido',
                data: dataValues,
                backgroundColor: '#4F46E5',
                borderRadius: 4
            }]
        }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            }
        } 
    }); 
}

function renderGastosCharts(statusData, metodoData, evolucaoData) {
    const ctx1 = document.getElementById('chartGastoStatus');
    if(ctx1) { if(chartGastoStatus) chartGastoStatus.destroy(); chartGastoStatus = new Chart(ctx1.getContext('2d'), { type: 'doughnut', data: { labels: ['Pago', 'Pendente'], datasets: [{ data: [statusData.pago, statusData.pendente], backgroundColor: ['#10B981', '#EF4444'] }] }, options: { responsive: true, maintainAspectRatio: false } }); }
    const ctx2 = document.getElementById('chartGastoMetodo');
    if(ctx2) { if(chartGastoMetodo) chartGastoMetodo.destroy(); chartGastoMetodo = new Chart(ctx2.getContext('2d'), { type: 'bar', data: { labels: Object.keys(metodoData), datasets: [{ label: 'Total por Método', data: Object.values(metodoData), backgroundColor: '#6366f1' }] }, options: { responsive: true, maintainAspectRatio: false } }); }
    const ctx3 = document.getElementById('chartGastoEvolucao');
    if(ctx3) { if(chartGastoEvolucao) chartGastoEvolucao.destroy(); const dias = Object.keys(evolucaoData).sort((a,b) => a-b); const valores = dias.map(d => evolucaoData[d]); chartGastoEvolucao = new Chart(ctx3.getContext('2d'), { type: 'line', data: { labels: dias, datasets: [{ label: 'Gastos no Mês', data: valores, borderColor: '#F59E0B', tension: 0.3, fill: true, backgroundColor: 'rgba(245, 158, 11, 0.1)' }] }, options: { responsive: true, maintainAspectRatio: false } }); }
}

async function carregarCategorias() {
    const selForm = document.getElementById('prod-categoria');
    const selFiltro = document.getElementById('filtro-categoria-estoque');
    if(selForm) selForm.innerHTML = '<option value="">Selecione...</option>';
    if(selFiltro) selFiltro.innerHTML = '<option value="TODOS">TODAS AS CATEGORIAS</option>';
    categoriasCache = []; const nomes = new Set();
    const snap = await getDocs(query(collection(db, COLECAO_CATEGORIAS), orderBy("nome")));
    snap.forEach(d => { const cat = d.data(); if (!nomes.has(cat.nome)) { nomes.add(cat.nome); categoriasCache.push({ nome: cat.nome, margem: cat.margem || 0 }); if(selForm) { const o = document.createElement('option'); o.value = cat.nome; o.text = cat.nome; selForm.appendChild(o); } if(selFiltro) { const o = document.createElement('option'); o.value = cat.nome; o.text = cat.nome; selFiltro.appendChild(o); } } });
    if(selFiltro) selFiltro.value = filtroCategoriaEstoque;
}

async function carregarBancos() {
    const selects = [document.getElementById('gasto-banco'), document.getElementById('edit-gasto-banco')];
    const ul = document.getElementById('lista-bancos');
    if(ul) ul.innerHTML = '';
    selects.forEach(s => { if(s) s.innerHTML = '<option value="">Selecione...</option>'; });
    bancosCache = [];
    const snap = await getDocs(collection(db, COLECAO_BANCOS));
    snap.forEach(d => { const b = d.data(); bancosCache.push(b.nome); selects.forEach(s => { if(s) { const opt = document.createElement('option'); opt.value = b.nome; opt.text = b.nome; s.appendChild(opt); } }); if(ul) ul.innerHTML += `<li>${b.nome} <button onclick="window.removerBanco('${d.id}')" style="color:red;border:none;background:none;cursor:pointer;margin-left:10px">X</button></li>`; });
}
window.carregarBancos = carregarBancos;

// ============================================================
// 5. INICIALIZAÇÃO E EVENTOS
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    // 1. Login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const msg = document.getElementById('login-msg');
            msg.innerText = "Conectando...";
            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                console.error("Erro login:", error);
                let txt = "Erro ao entrar.";
                if(error.code === 'auth/wrong-password') txt = "Senha incorreta.";
                if(error.code === 'auth/user-not-found') txt = "Usuário não encontrado.";
                msg.innerText = txt;
            }
        });
    }

    // 2. Datas Padrão
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    const elInicio = document.getElementById('data-inicio');
    const elFim = document.getElementById('data-fim');
    if(elInicio) elInicio.valueAsDate = inicio;
    if(elFim) elFim.valueAsDate = fim;
    const elMes = document.getElementById('mes-gastos');
    if(elMes) elMes.value = hoje.toISOString().slice(0, 7);
    const elVendaDt = document.getElementById('venda-data');
    if(elVendaDt) elVendaDt.valueAsDate = hoje;

    // 3. Abas
    const menuItems = document.querySelectorAll('.menu li');
    if(menuItems.length > 0) {
        menuItems.forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.menu li').forEach(li => li.classList.remove('active'));
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                item.classList.add('active');
                const target = item.getAttribute('data-target');
                const targetEl = document.getElementById(target);
                if(targetEl) targetEl.classList.add('active');
                const filtroGeral = document.getElementById('filtro-periodo-geral');
                const filtroGastos = document.getElementById('filtro-mes-gastos');
                if(filtroGeral && filtroGastos) {
                    if (target === 'gastos') {
                        filtroGeral.classList.add('hidden');
                        filtroGastos.classList.remove('hidden');
                        window.carregarGastos();
                    } else if (target === 'dashboard' || target === 'historico') {
                        filtroGeral.classList.remove('hidden');
                        filtroGastos.classList.add('hidden');
                        if(target === 'dashboard') window.carregarDashboard();
                        if(target === 'historico') window.carregarHistorico();
                    } else {
                        filtroGeral.classList.add('hidden');
                        filtroGastos.classList.add('hidden');
                    }
                }
                if(target === 'devedores') window.carregarDevedores();
                if(target === 'estoque') window.carregarEstoque();
                if(target === 'clientes') window.carregarClientes();
            });
        });
    }

    // 4. Sidebar e Tema
    const btnSidebar = document.getElementById('sidebar-toggle');
    if (btnSidebar) btnSidebar.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('collapsed'));
    const btnTheme = document.getElementById('theme-toggle');
    if(btnTheme) {
        if (localStorage.getItem('theme') === 'dark') { document.body.classList.add('dark-mode'); btnTheme.querySelector('i').classList.replace('fa-moon', 'fa-sun'); }
        btnTheme.onclick = (e) => { e.preventDefault(); document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); btnTheme.querySelector('i').classList.replace(document.body.classList.contains('dark-mode') ? 'fa-moon' : 'fa-sun', document.body.classList.contains('dark-mode') ? 'fa-sun' : 'fa-moon'); updateChartsTheme(); };
    }

    // 5. Botões Estáticos
    const btnAddCat = document.getElementById('btn-add-cat');
    if (btnAddCat) {
        btnAddCat.addEventListener('click', async () => {
            const nova = await window.mostrarPrompt("Nova Categoria", "Digite o nome da categoria:");
            if (nova) {
                const sel = document.getElementById('prod-categoria');
                let existe = false;
                for (let i = 0; i < sel.options.length; i++) if (sel.options[i].value === nova.toUpperCase()) existe = true;
                if (!existe) {
                    window.mostrarLoading(true);
                    try { await addDoc(collection(db, COLECAO_CATEGORIAS), { nome: nova.toUpperCase(), margem: 30 }); await carregarCategorias(); window.mostrarAlerta("Sucesso", "Categoria adicionada!", "success"); } catch (e) { console.error(e); } finally { window.mostrarLoading(false); }
                } else { window.mostrarAlerta("Erro", "Já existe!", "error"); }
            }
        });
    }
    const btnDelCat = document.getElementById('btn-del-cat');
    if (btnDelCat) {
        btnDelCat.addEventListener('click', async () => {
            const sel = document.getElementById('prod-categoria');
            const nomeCategoria = sel.value;
            if (!nomeCategoria) return window.mostrarAlerta("Aviso", "Selecione uma categoria.", "warning");
            window.mostrarConfirmacao("Excluir Categoria", `Isso removerá a categoria "${nomeCategoria}".`, async () => {
                window.mostrarLoading(true);
                try { const q = query(collection(db, COLECAO_CATEGORIAS), where("nome", "==", nomeCategoria)); const snap = await getDocs(q); const deletePromises = []; snap.forEach((d) => deletePromises.push(deleteDoc(doc(db, COLECAO_CATEGORIAS, d.id)))); await Promise.all(deletePromises); await carregarCategorias(); window.mostrarAlerta("Sucesso", "Removida!", "success"); } catch (e) { console.error(e); } finally { window.mostrarLoading(false); }
            });
        });
    }

    // 1. EVENTO DE AUTOPREENCHIMENTO (Ao digitar o nome do produto)
    document.getElementById('prod-nome')?.addEventListener('input', function() {
        const nomeDigitado = this.value.trim().toLowerCase();
        
        // Procura no cache (ignora maiúsculas/minúsculas)
        const produtoEncontrado = produtosCache.find(p => p.nome.toLowerCase() === nomeDigitado);
        
        if (produtoEncontrado) {
            // Preenche os campos se achou o produto
            document.getElementById('prod-categoria').value = produtoEncontrado.categoria || '';
            document.getElementById('prod-custo').value = produtoEncontrado.custo;
            document.getElementById('prod-venda').value = produtoEncontrado.venda;
            
            // Calcula e mostra a margem (visual)
            if(produtoEncontrado.custo > 0) {
                const margem = ((produtoEncontrado.venda - produtoEncontrado.custo) / produtoEncontrado.custo) * 100;
                const campoMargem = document.getElementById('prod-margem');
                if(campoMargem) campoMargem.value = margem.toFixed(0);
            }
        }
    });

    // 2. EVENTO DE SALVAR (SOMA AO ESTOQUE OU CRIA NOVO)
    document.getElementById('form-produto')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nomeInput = document.getElementById('prod-nome').value.trim();
        const categoria = document.getElementById('prod-categoria').value;
        const custo = parseFloat(document.getElementById('prod-custo').value);
        const venda = parseFloat(document.getElementById('prod-venda').value);
        
        // Tratamento da quantidade (troca vírgula por ponto)
        const qtdInput = document.getElementById('prod-qtd').value.replace(',', '.');
        const qtd = parseFloat(qtdInput);
        
        const margem = parseFloat(document.getElementById('prod-margem').value) || 0;
        
        if (!nomeInput || isNaN(custo) || isNaN(venda) || isNaN(qtd)) {
            return window.mostrarAlerta("Erro", "Preencha os campos corretamente.", "error");
        }

        window.mostrarLoading(true);
        try {
            // Atualiza margem da categoria se foi alterada
            if(margem > 0) { 
                const qCat = query(collection(db, COLECAO_CATEGORIAS), where("nome", "==", categoria)); 
                const snapCat = await getDocs(qCat); 
                if(!snapCat.empty) await updateDoc(doc(db, COLECAO_CATEGORIAS, snapCat.docs[0].id), { margem: margem }); 
            }

            // BUSCA INTELIGENTE: Verifica se já existe (ignorando maiúsculas/minúsculas)
            const produtoExistente = produtosCache.find(p => p.nome.toLowerCase() === nomeInput.toLowerCase());

            if (produtoExistente) {
                // --- CENÁRIO: PRODUTO JÁ EXISTE (SOMA AO ESTOQUE) ---
                const produtoRef = doc(db, COLECAO_PRODUTOS, produtoExistente.id);
                
                await updateDoc(produtoRef, { 
                    // 'increment(qtd)' garante a soma correta direto no banco
                    qtd: increment(qtd), 
                    custo: custo, 
                    venda: venda, 
                    categoria: categoria 
                });
                
                window.mostrarAlerta("Sucesso", `Estoque de "${nomeInput}" somado (+${qtd})!`, "success"); 
            } else { 
                // --- CENÁRIO: PRODUTO NOVO (CRIA) ---
                await addDoc(collection(db, COLECAO_PRODUTOS), { 
                    nome: nomeInput, // Salva o nome como digitado (respeitando maiúsculas do input)
                    categoria, 
                    custo, 
                    venda, 
                    qtd, 
                    ativo: true, 
                    criadoEm: Timestamp.now() 
                }); 
                window.mostrarAlerta("Sucesso", "Novo produto cadastrado!", "success"); 
            }

            document.getElementById('form-produto').reset(); 
            await window.carregarEstoque(); // Recarrega a tabela e o cache
            window.verificarEstoqueBaixo(false);
            
        } catch (e) { 
            console.error(e); 
            window.mostrarAlerta("Erro", "Falha ao processar produto: " + e.message, "error");
        } finally { 
            window.mostrarLoading(false); 
        }
    });

    document.getElementById('form-cliente')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        window.mostrarLoading(true);
        await addDoc(collection(db, COLECAO_CLIENTES), { nome: document.getElementById('cli-nome').value.toUpperCase(), tel: document.getElementById('cli-tel').value, cpf: document.getElementById('cli-cpf').value, endereco: document.getElementById('cli-endereco').value });
        window.mostrarLoading(false);
        document.getElementById('form-cliente').reset();
        window.carregarClientes();
        window.mostrarAlerta("Sucesso", "Cliente Salvo!", "success");
    });

    document.getElementById('form-gasto')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = document.getElementById('gasto-nome').value;
        const valor = parseFloat(document.getElementById('gasto-valor').value);
        const dtEntrada = new Date(document.getElementById('gasto-data-entrada').value + 'T12:00:00');
        const dtVenc = document.getElementById('gasto-data-vencimento').value;
        const status = document.getElementById('gasto-status').value;
        let metodo = null; let banco = null;
        if(status === 'pago') { metodo = document.getElementById('gasto-metodo').value; banco = document.getElementById('gasto-banco').value; if(!banco) return window.mostrarAlerta("Erro", "Selecione o banco!", "error"); }
        window.mostrarLoading(true);
        await addDoc(collection(db, COLECAO_GASTOS), { nome, valor, status, metodo, banco, dataEntrada: Timestamp.fromDate(dtEntrada), vencimento: dtVenc });
        window.mostrarLoading(false);
        window.mostrarAlerta("Sucesso", "Gasto registrado!", "success");
        document.getElementById('form-gasto').reset();
        window.toggleCamposPagamento('gasto-status', 'container-pagamento-novo');
        window.carregarGastos();
    });
});

// NOVO: Preenchimento automático ao selecionar um produto existente no Estoque
document.getElementById('prod-nome')?.addEventListener('input', function() {
    const nomeDigitado = this.value.trim().toLowerCase();
     
    // Busca no cache local (insensível a maiúsculas/minúsculas)
    const produtoEncontrado = produtosCache.find(p => p.nome.toLowerCase() === nomeDigitado);
        
    if (produtoEncontrado) {
        // Preenche os campos automaticamente
        document.getElementById('prod-categoria').value = produtoEncontrado.categoria || '';
        document.getElementById('prod-custo').value = produtoEncontrado.custo;
        document.getElementById('prod-venda').value = produtoEncontrado.venda;
        
        // Calcula a margem visualmente (opcional, já que a função calcular não estava no código enviado)
        if(produtoEncontrado.custo > 0) {
            const margem = ((produtoEncontrado.venda - produtoEncontrado.custo) / produtoEncontrado.custo) * 100;
            const campoMargem = document.getElementById('prod-margem');
            if(campoMargem) campoMargem.value = margem.toFixed(0);
        }
    }
});

// ============================================================
// 6. OBSERVAÇÃO DE ESTADO
// ============================================================
document.getElementById('btn-logout')?.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        document.getElementById('user-email-display').innerText = user.email;
        iniciarApp();
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
    }
});

function iniciarApp() {
    Promise.all([
        window.carregarMetodosPagamento(),
        carregarCategorias(),
        carregarEstoque().then(() => window.verificarEstoqueBaixo(false)),
        carregarClientes(),
        window.carregarDashboard(),
        window.carregarGastos(),
        window.carregarBancos()
    ]).catch(console.error);
}

// ============================================================
// 7. FUNÇÕES EXPORTADAS
// ============================================================
window.carregarMetodosPagamento = async () => {
    const selects = [document.getElementById('venda-metodo'), document.getElementById('gasto-metodo'), document.getElementById('abatimento-metodo'), document.getElementById('edit-metodo'), document.getElementById('edit-gasto-metodo')];
    const ul = document.getElementById('lista-metodos');
    if(ul) ul.innerHTML = '';
    metodosCache = ["Dinheiro", "Pix", "Débito", "Crédito", "Fiado (A Ver)"];
    try {
        const snap = await getDocs(collection(db, COLECAO_METODOS));
        snap.forEach(d => { const m = d.data(); metodosCache.push(m.nome); if(ul) ul.innerHTML += `<li>${m.nome} <button onclick="window.removerMetodo('${d.id}')" style="color:red;border:none;background:none;cursor:pointer;margin-left:10px">X</button></li>`; });
    } catch(e) { console.error("Erro métodos", e); }
    selects.forEach(s => { if(s) { const val = s.value; s.innerHTML = ''; metodosCache.forEach(m => { const v = m.toLowerCase().includes('fiado') ? 'aver' : m.toLowerCase().replace(/\s/g, '_'); const opt = document.createElement('option'); opt.value = v; opt.text = m; s.appendChild(opt); }); if(val) s.value = val; } });
};
window.abrirModalMetodos = () => document.getElementById('modal-metodos').classList.remove('hidden');
window.adicionarMetodoPagamento = async () => { const n = document.getElementById('novo-metodo-nome').value.trim(); if(n) { await addDoc(collection(db, COLECAO_METODOS), { nome: n }); document.getElementById('novo-metodo-nome').value = ''; window.carregarMetodosPagamento(); } };
window.removerMetodo = async (id) => { if(confirm("Excluir?")) { await deleteDoc(doc(db, COLECAO_METODOS, id)); window.carregarMetodosPagamento(); } };

window.adicionarAoCarrinho = () => {
    const nome = document.getElementById('venda-produto').value;
    const qtd = parseFloat(document.getElementById('venda-qtd').value.replace(',', '.'));
    const unit = parseFloat(document.getElementById('venda-valor-unit').value);
    const prod = produtosCache.find(p => p.nome === nome);
    if (!prod) return window.mostrarAlerta("Erro", "Produto inválido.", "error");
    if (isNaN(qtd) || qtd <= 0) return window.mostrarAlerta("Erro", "Qtd inválida.", "error");
    carrinho.push({ id: prod.id, nome: prod.nome, qtd: qtd, unit: unit, custo: prod.custo, total: qtd * unit });
    renderizarCarrinho();
    document.getElementById('venda-produto').value = '';
    document.getElementById('venda-qtd').value = '1';
    document.getElementById('venda-valor-unit').value = '';
    document.getElementById('venda-produto').focus();
};

function renderizarCarrinho() {
    const tbody = document.querySelector('#tabela-carrinho tbody'); if(!tbody) return; 
    let html = ''; let totalGeral = 0;
    carrinho.forEach((item, index) => { 
        totalGeral += item.total; 
        html += `<tr><td>${item.nome}</td><td>${item.qtd}</td><td>R$ ${item.unit.toFixed(2)}</td><td>R$ ${item.total.toFixed(2)}</td><td><button onclick="window.removerDoCarrinho(${index})" style="color:red;border:none;background:none;cursor:pointer"><i class="fas fa-trash"></i></button></td></tr>`; 
    });
    tbody.innerHTML = html;
    const totalEl = document.getElementById('venda-total-carrinho'); if(totalEl) totalEl.innerText = `R$ ${totalGeral.toFixed(2)}`;

    if(window.atualizarInfoPagamento) window.atualizarInfoPagamento();
}
window.removerDoCarrinho = (index) => { carrinho.splice(index, 1); renderizarCarrinho(); };
document.getElementById('venda-produto')?.addEventListener('input', function() { const p = produtosCache.find(x => x.nome === this.value); if(p) document.getElementById('venda-valor-unit').value = p.venda.toFixed(2); });

// --- FUNÇÕES DE PAGAMENTO MÚLTIPLO ---

window.atualizarInfoPagamento = () => {
    const totalCarrinho = carrinho.reduce((acc, item) => acc + item.total, 0);
    const totalPago = pagamentosVenda.reduce((acc, pg) => acc + pg.valor, 0);
    const restante = totalCarrinho - totalPago;

    // Atualiza a lista visual
    const ul = document.getElementById('lista-pagamentos-venda');
    if (ul) {
        ul.innerHTML = '';
        pagamentosVenda.forEach((pg, index) => {
            ul.innerHTML += `
                <li style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:2px 0;">
                    <span>${pg.metodo}: R$ ${pg.valor.toFixed(2)}</span>
                    <button onclick="window.removerPagamentoParcial(${index})" style="color:red; border:none; background:none; cursor:pointer;">&times;</button>
                </li>`;
        });
    }

    // Atualiza label de restante
    const elRestante = document.getElementById('label-restante');
    const inputParcial = document.getElementById('valor-pagamento-parcial');
    
    if (elRestante) {
        if (restante > 0.01) {
            elRestante.innerText = `Falta: R$ ${restante.toFixed(2)}`;
            elRestante.style.color = '#ef4444'; // Vermelho
            if(inputParcial) inputParcial.value = restante.toFixed(2); // Sugere o valor restante
        } else if (restante < -0.01) {
            elRestante.innerText = `Troco: R$ ${Math.abs(restante).toFixed(2)}`;
            elRestante.style.color = '#10b981'; // Verde
            if(inputParcial) inputParcial.value = '';
        } else {
            elRestante.innerText = 'Total Coberto ✅';
            elRestante.style.color = '#10b981';
            if(inputParcial) inputParcial.value = '';
        }
    }
};

window.adicionarPagamentoParcial = () => {
    const select = document.getElementById('venda-metodo');
    const inputVal = document.getElementById('valor-pagamento-parcial');
    
    const metodo = select.options[select.selectedIndex].text; // Pega o texto (ex: Pix) em vez do value (ex: pix) para ficar bonito
    const metodoValue = select.value;
    let valor = parseFloat(inputVal.value);

    // Se o usuário não digitou valor, tenta pegar o total do carrinho (comportamento padrão antigo)
    if (isNaN(valor) || valor <= 0) {
        const totalCarrinho = carrinho.reduce((acc, item) => acc + item.total, 0);
        const totalPago = pagamentosVenda.reduce((acc, pg) => acc + pg.valor, 0);
        valor = totalCarrinho - totalPago;
    }

    if (valor <= 0) return window.mostrarAlerta("Aviso", "Valor inválido ou total já pago.");

    pagamentosVenda.push({ metodo: metodo, metodoValue: metodoValue, valor: valor });
    window.atualizarInfoPagamento();
};

window.removerPagamentoParcial = (index) => {
    pagamentosVenda.splice(index, 1);
    window.atualizarInfoPagamento();
};

window.finalizarVendaCarrinho = async () => {
    if(carrinho.length === 0) return window.mostrarAlerta("Erro", "Carrinho vazio!", "error");
    
    const totalCarrinho = carrinho.reduce((acc, item) => acc + item.total, 0);
    let pagamentosFinais = [...pagamentosVenda];
    let metodoString = "";

    // LÓGICA DE PAGAMENTO
    if (pagamentosFinais.length === 0) {
        // Modo Simples: Usuário não adicionou parciais, usa o select para o valor total
        const metodoSelect = document.getElementById('venda-metodo');
        const metodoNome = metodoSelect.options[metodoSelect.selectedIndex].text;
        const metodoVal = metodoSelect.value;
        
        pagamentosFinais.push({ metodo: metodoNome, metodoValue: metodoVal, valor: totalCarrinho });
        metodoString = metodoVal; // Mantém compatibilidade (ex: "pix")
    } else {
        // Modo Múltiplo: Valida se o total bate
        const totalPago = pagamentosFinais.reduce((acc, pg) => acc + pg.valor, 0);
        
        // Aceita uma margem de erro de 0.05 centavos
        if (Math.abs(totalPago - totalCarrinho) > 0.05) {
            return window.mostrarAlerta("Erro", `Pagamento diverge do total! Pago: ${totalPago.toFixed(2)} | Total: ${totalCarrinho.toFixed(2)}`, "error");
        }
        
        // Cria uma string combinada, ex: "Dinheiro + Pix"
        metodoString = pagamentosFinais.map(p => p.metodo).join(" + ");
    }

    const cliente = document.getElementById('venda-cliente').value;
    const dataVenda = document.getElementById('venda-data').value;
    
    // Verifica Fiado
    const temFiado = pagamentosFinais.some(p => p.metodoValue === 'aver');
    if(temFiado && (!cliente || cliente === 'Consumidor Final')) 
        return window.mostrarAlerta("Erro", "Fiado exige cliente identificado!", "error");

    // Pergunta impressão
    const desejaImprimir = confirm("Venda registrada! Deseja imprimir a Nota de Venda?");
    
    window.mostrarLoading(true);
    const batch = writeBatch(db); 
    
    // --- ALTERAÇÃO AQUI: Captura o horário atual e mistura com a data do input ---
    let dataBase = new Date(dataVenda + 'T00:00:00');
    const agora = new Date();
    dataBase.setHours(agora.getHours());
    dataBase.setMinutes(agora.getMinutes());
    dataBase.setSeconds(agora.getSeconds());
    
    const dataFinal = dataBase;
    // -----------------------------------------------------------------------------

    const itensParaImpressao = [...carrinho]; 
    const idVendaGeral = doc(collection(db, COLECAO_VENDAS)).id;

    try {
        for (const item of carrinho) {
            const vendaRef = doc(collection(db, COLECAO_VENDAS));
            
            // Define status de pagamento deste item
            // Lógica: Se tem "aver" (fiado) na lista de pagamentos, consideramos não pago inicialmente
            const isFiado = pagamentosFinais.some(p => p.metodoValue === 'aver');

            batch.set(vendaRef, { 
                idVendaAgrupada: idVendaGeral,
                produtoId: item.id, 
                produtoNome: item.nome, 
                qtd: item.qtd, 
                total: item.total, 
                custo: (item.custo||0)*item.qtd, 
                metodo: metodoString, // String combinada
                detalhesPagamento: pagamentosFinais, // Array detalhado
                cliente: cliente, 
                pago: !isFiado, 
                data: Timestamp.fromDate(dataFinal) 
            });
            
            const prodRef = doc(db, COLECAO_PRODUTOS, item.id);
            batch.update(prodRef, { qtd: increment(-item.qtd) });
        }
        await batch.commit();
        
        window.mostrarLoading(false); 
        window.mostrarAlerta("Sucesso", "Venda Finalizada!", "success");

        if (desejaImprimir) {
            window.imprimirNota({ id: idVendaGeral, cliente: cliente, data: dataFinal, metodo: metodoString }, itensParaImpressao);
        }

        // Reseta tudo
        carrinho = []; 
        pagamentosVenda = []; 
        window.atualizarInfoPagamento(); 
        renderizarCarrinho(); 
        carregarEstoque();
    } catch (e) { 
        console.error(e); 
        window.mostrarLoading(false); 
        window.mostrarAlerta("Erro", "Falha ao finalizar.", "error"); 
    }
};

window.exportarDadosBackup = async () => {
    window.mostrarLoading(true);
    try {
        const d = { produtos: [], clientes: [], vendas: [], categorias: [], gastos: [], bancos: [], metodos: [] };
        const [sp, sc, sct, sv, sg, sb, sm] = await Promise.all([
            getDocs(collection(db, COLECAO_PRODUTOS)),
            getDocs(collection(db, COLECAO_CLIENTES)),
            getDocs(collection(db, COLECAO_CATEGORIAS)),
            getDocs(collection(db, COLECAO_VENDAS)),
            getDocs(collection(db, COLECAO_GASTOS)),
            getDocs(collection(db, COLECAO_BANCOS)),
            getDocs(collection(db, COLECAO_METODOS))
        ]);
        sp.forEach(x => d.produtos.push(x.data()));
        sc.forEach(x => d.clientes.push(x.data()));
        sct.forEach(x => d.categorias.push(x.data()));
        sv.forEach(x => { let v = x.data(); if(v.data && v.data.seconds) v.data = v.data.toDate().toISOString(); d.vendas.push(v); });
        sg.forEach(x => { let g = x.data(); if(g.dataEntrada && g.dataEntrada.seconds) g.dataEntrada = g.dataEntrada.toDate().toISOString(); d.gastos.push(g); });
        sb.forEach(x => d.bancos.push(x.data()));
        sm.forEach(x => d.metodos.push(x.data()));
        
        const b = new Blob([JSON.stringify(d)], { type: "application/json" });
        const u = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = u;
        a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (e) { window.mostrarAlerta("Erro", "Falha no backup.", "error"); } finally { window.mostrarLoading(false); }
};

window.importarDadosBackup = async (i) => {
    if(!i.files[0]) return;
    window.mostrarConfirmacao("Importar?", "Isso mesclará os dados.", async () => {
        const f = i.files[0];
        const r = new FileReader();
        r.onload = async (e) => {
            window.mostrarLoading(true);
            try {
                const d = JSON.parse(e.target.result);
                let batch = writeBatch(db);
                let count = 0;
                const commitBatch = async () => { await batch.commit(); batch = writeBatch(db); count = 0; };
                
                if(d.produtos) for(const x of d.produtos) { if(x.criadoEm) x.criadoEm = Timestamp.fromDate(new Date(x.criadoEm)); batch.set(doc(collection(db,COLECAO_PRODUTOS)),x); count++; if(count>=400) await commitBatch(); }
                if(d.clientes) for(const x of d.clientes) { batch.set(doc(collection(db,COLECAO_CLIENTES)),x); count++; if(count>=400) await commitBatch(); }
                if(d.vendas) for(const x of d.vendas) { if(x.data) x.data = Timestamp.fromDate(new Date(x.data)); batch.set(doc(collection(db,COLECAO_VENDAS)),x); count++; if(count>=400) await commitBatch(); }
                if(d.categorias) for(const x of d.categorias) { batch.set(doc(collection(db,COLECAO_CATEGORIAS)),x); count++; if(count>=400) await commitBatch(); }
                if(d.gastos) for(const x of d.gastos) { if(x.dataEntrada) x.dataEntrada = Timestamp.fromDate(new Date(x.dataEntrada)); batch.set(doc(collection(db,COLECAO_GASTOS)),x); count++; if(count>=400) await commitBatch(); }
                if(d.bancos) for(const x of d.bancos) { batch.set(doc(collection(db,COLECAO_BANCOS)),x); count++; if(count>=400) await commitBatch(); }
                if(d.metodos) for(const x of d.metodos) { batch.set(doc(collection(db,COLECAO_METODOS)),x); count++; if(count>=400) await commitBatch(); }
                if(count > 0) await batch.commit();
                window.mostrarAlerta("Sucesso", "Importação concluída!", "success");
                setTimeout(() => location.reload(), 1500);
            } catch (er) { console.error(er); window.mostrarAlerta("Erro", "Falha ao importar.", "error"); } finally { window.mostrarLoading(false); }
        };
        r.readAsText(f);
    });
};

window.abrirRelatorioMensal = () => { document.getElementById('modal-relatorio').classList.remove('hidden'); window.gerarGraficoRelatorio(); };
window.gerarGraficoRelatorio = async () => {
    const limite = parseInt(document.getElementById('relatorio-filtro').value);
    const i = new Date(document.getElementById('data-inicio').value + 'T00:00:00');
    const f = new Date(document.getElementById('data-fim').value + 'T23:59:59');
    const q = query(collection(db, COLECAO_VENDAS), where("data", ">=", Timestamp.fromDate(i)), where("data", "<=", Timestamp.fromDate(f)));
    const snap = await getDocs(q);
    const produtosVendidos = {};
    snap.forEach(d => { const v = d.data(); if(v.produtoNome !== "PAGAMENTO DÍVIDA") { produtosVendidos[v.produtoNome] = (produtosVendidos[v.produtoNome] || 0) + v.qtd; } });
    const arrayVendas = Object.keys(produtosVendidos).map(nome => { return { nome: nome, qtd: produtosVendidos[nome] }; });
    arrayVendas.sort((a, b) => b.qtd - a.qtd); 
    const topVendas = arrayVendas.slice(0, limite);
    const labels = topVendas.map(i => i.nome); const data = topVendas.map(i => i.qtd);
    const bgColors = labels.map(() => `hsl(${Math.random() * 360}, 70%, 60%)`);
    const ctx = document.getElementById('chartRelatorio'); if(chartRelatorio) chartRelatorio.destroy();
    chartRelatorio = new Chart(ctx.getContext('2d'), { type: 'pie', data: { labels: labels, datasets: [{ data: data, backgroundColor: bgColors }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10 } } } } });
};

window.fecharModalEdicao = () => document.getElementById('modal-editar').classList.add('hidden');
window.abrirModalAbatimento = (n) => { document.getElementById('abatimento-cliente').value = n; document.getElementById('abatimento-cliente-nome').innerText = n; document.getElementById('abatimento-valor').value = ''; document.getElementById('modal-abatimento').classList.remove('hidden'); document.getElementById('abatimento-valor').focus(); };
window.verDetalhesDevedor = async (n) => { const m = document.getElementById('modal-devedor'); const tb = document.querySelector('#tabela-detalhes-devedor tbody'); tb.innerHTML = '<tr><td>...</td></tr>'; m.classList.remove('hidden'); document.getElementById('titulo-devedor').innerText = `Extrato: ${n}`; const s = await getDocs(query(collection(db, COLECAO_VENDAS), where("cliente", "==", n), where("pago", "==", false))); let vs = []; s.forEach(d => vs.push(d.data())); vs.sort((a, b) => b.data.seconds - a.data.seconds); let html = ''; let t = 0; vs.forEach(v => { t += v.total; const pg = v.total < 0; html += `<tr style="${pg ? 'background:#f0fdf4' : ''}"><td>${v.data?.toDate ? v.data.toDate().toLocaleDateString('pt-BR') : '-'}</td><td>${v.produtoNome}</td><td style="${pg ? 'color:green' : ''}">R$ ${Math.abs(v.total).toFixed(2)}</td></tr>`; }); tb.innerHTML = html; document.getElementById('total-divida-modal').innerText = `R$ ${t.toFixed(2)}`; };
window.salvarAbatimento = async () => { const n = document.getElementById('abatimento-cliente').value; const v = parseFloat(document.getElementById('abatimento-valor').value); const m = document.getElementById('abatimento-metodo').value; if (!v || v <= 0) return window.mostrarAlerta("Erro", "Valor inválido.", "error"); window.mostrarLoading(true); try { await addDoc(collection(db, COLECAO_VENDAS), { cliente: n, produtoNome: "PAGAMENTO DÍVIDA", total: -v, metodo: m, pago: false, qtd: 1, data: Timestamp.now() }); const q = query(collection(db, COLECAO_VENDAS), where("cliente", "==", n), where("pago", "==", false)); const snap = await getDocs(q); let saldo = 0; const list = []; snap.forEach(d => { saldo += d.data().total; list.push(d.ref); }); if (saldo <= 0.01) { const b = writeBatch(db); list.forEach(r => b.update(r, { pago: true })); await b.commit(); window.mostrarAlerta("Sucesso", `Dívida de ${n} quitada!`, "success"); } else { window.mostrarAlerta("Sucesso", `Pago R$ ${v}. Resta R$ ${saldo.toFixed(2)}`, "success"); } document.getElementById('modal-abatimento').classList.add('hidden'); window.carregarDevedores(); } catch (e) { console.error(e); } finally { window.mostrarLoading(false); } };
window.filtrarEstoque = () => { const t = document.getElementById('busca-estoque').value.toLowerCase(); document.querySelectorAll('#tabela-estoque tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(t) ? '' : 'none'); };
window.filtrarHistorico = () => { const t = document.getElementById('busca-historico').value.toLowerCase(); document.querySelectorAll('#tabela-historico tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(t) ? '' : 'none'); };
window.filtrarClientes = () => { const t = document.getElementById('busca-clientes').value.toLowerCase(); document.querySelectorAll('#tabela-clientes tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(t) ? '' : 'none'); };
window.filtrarDevedores = () => { const t = document.getElementById('busca-devedores').value.toLowerCase(); document.querySelectorAll('#tabela-devedores tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(t) ? '' : 'none'); };
window.excluirMassaClientes=async()=>{const c=document.querySelectorAll('.cli-checkbox:checked');if(c.length===0)return;window.mostrarConfirmacao("Apagar?", `Excluir ${c.length} clientes?`, async()=>{window.mostrarLoading(true);for(const x of c)await deleteDoc(doc(db,COLECAO_CLIENTES,x.value));window.mostrarLoading(false);window.carregarClientes();});};
window.excluirCliente=async(id)=>{window.mostrarConfirmacao("Apagar?", "Excluir cliente?", async()=>{await deleteDoc(doc(db,COLECAO_CLIENTES,id));window.carregarClientes();});};
window.excluirMassa=async()=>{const c=document.querySelectorAll('.sale-checkbox:checked');if(c.length===0)return;window.mostrarConfirmacao("Apagar?", `Excluir ${c.length} registros?`, async()=>{window.mostrarLoading(true);for(const x of c){try{await deleteDoc(doc(db,COLECAO_VENDAS,x.value));const pid=x.dataset.pid;const q=parseInt(x.dataset.qtd);if(pid&&pid.length>10&&!isNaN(q))await updateDoc(doc(db,COLECAO_PRODUTOS,pid),{qtd:increment(q)});}catch(e){}}window.mostrarLoading(false);window.carregarHistorico();});};
window.abrirEdicao=(id,v,m)=>{document.getElementById('edit-id').value=id;document.getElementById('edit-valor').value=v;document.getElementById('edit-metodo').value=m;document.getElementById('modal-editar').classList.remove('hidden');};
window.salvarEdicaoVenda=async()=>{const id=document.getElementById('edit-id').value;const m=document.getElementById('edit-metodo').value;const valor=parseFloat(document.getElementById('edit-valor').value);const isAbatimento=valor<0;const isPago=isAbatimento?false:(m!=='aver');await updateDoc(doc(db,COLECAO_VENDAS,id),{total:valor,metodo:m,pago:isPago});window.fecharModalEdicao();window.carregarHistorico();};
window.excluirMassaDevedores=async()=>{const c=document.querySelectorAll('.dev-checkbox:checked');if(c.length===0)return;window.mostrarConfirmacao("Perdoar?", `Zerar ${c.length} clientes?`, async()=>{window.mostrarLoading(true);for(const x of c){const n=x.value;const s=await getDocs(query(collection(db,COLECAO_VENDAS),where("cliente","==",n),where("pago","==",false)));s.forEach(async d=>await deleteDoc(doc(db,COLECAO_VENDAS,d.id)));}window.mostrarLoading(false);window.mostrarAlerta("Sucesso","Dívidas perdoadas!","success");window.carregarDevedores();});};
window.abrirModalBancos = () => document.getElementById('modal-bancos').classList.remove('hidden');
window.adicionarBanco = async () => { const n = document.getElementById('novo-banco-nome').value.trim(); if(n) { await addDoc(collection(db, COLECAO_BANCOS), { nome: n }); document.getElementById('novo-banco-nome').value = ''; window.carregarBancos(); } };
window.removerBanco = async (id) => { window.mostrarConfirmacao("Excluir Banco?", "Essa ação não pode ser desfeita.", async () => { await deleteDoc(doc(db, COLECAO_BANCOS, id)); window.carregarBancos(); }); };
window.toggleCamposPagamento = (idSelect, idContainer) => {
    const status = document.getElementById(idSelect).value;
    const container = document.getElementById(idContainer);
    if(status === 'pago') container.classList.remove('hidden');
    else container.classList.add('hidden');
};
window.excluirGasto = async (id) => { window.mostrarConfirmacao("Excluir?", "Deseja remover essa despesa?", async () => { await deleteDoc(doc(db, COLECAO_GASTOS, id)); window.carregarGastos(); }); };
window.excluirMassaGastos = async () => { const c = document.querySelectorAll('.gasto-checkbox:checked'); if(c.length === 0) return; window.mostrarConfirmacao("Excluir em Massa", `Apagar ${c.length} despesas?`, async () => { window.mostrarLoading(true); for(const x of c) { try { await deleteDoc(doc(db, COLECAO_GASTOS, x.value)); } catch(e) {} } window.mostrarLoading(false); window.carregarGastos(); }); };
window.abrirEditarGasto = async (id) => {
    const docSnap = await getDoc(doc(db, COLECAO_GASTOS, id));
    if (docSnap.exists()) {
        const g = docSnap.data();
        document.getElementById('edit-gasto-id').value = id;
        document.getElementById('edit-gasto-nome').value = g.nome;
        document.getElementById('edit-gasto-valor').value = g.valor;
        document.getElementById('edit-gasto-data').value = g.dataEntrada.toDate().toISOString().split('T')[0];
        document.getElementById('edit-gasto-venc').value = g.vencimento;
        document.getElementById('edit-gasto-status').value = g.status;
        if(g.status === 'pago') { document.getElementById('edit-gasto-metodo').value = g.metodo || 'dinheiro'; document.getElementById('edit-gasto-banco').value = g.banco || ''; }
        window.toggleCamposPagamento('edit-gasto-status', 'container-pagamento-edit');
        document.getElementById('modal-gasto-edit').classList.remove('hidden');
    }
};
window.salvarEdicaoGasto = async () => {
    const id = document.getElementById('edit-gasto-id').value;
    const nome = document.getElementById('edit-gasto-nome').value;
    const valor = parseFloat(document.getElementById('edit-gasto-valor').value);
    let dtEntrada = new Date(document.getElementById('edit-gasto-data').value + 'T12:00:00');
    const dtVenc = document.getElementById('edit-gasto-venc').value;
    const status = document.getElementById('edit-gasto-status').value;
    let metodo = null; let banco = null;
    if(status === 'pago') { metodo = document.getElementById('edit-gasto-metodo').value; banco = document.getElementById('edit-gasto-banco').value; if(!banco) return window.mostrarAlerta("Erro", "Selecione o banco!", "error"); }
    window.mostrarLoading(true);
    await updateDoc(doc(db, COLECAO_GASTOS, id), { nome, valor, status, metodo, banco, dataEntrada: Timestamp.fromDate(dtEntrada), vencimento: dtVenc });
    window.mostrarLoading(false);
    document.getElementById('modal-gasto-edit').classList.add('hidden');
    window.carregarGastos();
};

// Função chamada pelos botões "Hoje", "7 Dias", "Mês"
window.filtrarHistoricoRapido = (tipo) => {
    isFiltroRapido = true; // Desativa a paginação (mostra tudo ou limite alto)
    
    const inputInicio = document.getElementById('data-inicio');
    const inputFim = document.getElementById('data-fim');
    const hoje = new Date();
    
    let dtInicio = new Date();
    let dtFim = new Date(); 

    if (tipo === 'dia') {
        dtInicio = hoje;
    } else if (tipo === 'semana') {
        dtInicio.setDate(hoje.getDate() - 7);
    } else if (tipo === 'mes') {
        dtInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        dtFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    }

    inputInicio.value = dtInicio.toISOString().split('T')[0];
    inputFim.value = dtFim.toISOString().split('T')[0];

    window.carregarHistorico();
};

// Função chamada pelo botão de filtro manual (ícone de funil)
window.filtrarPorData = () => {
    // Se o usuário clicou no filtro manual, reativamos a paginação
    isFiltroRapido = false; 
    
    // Reseta controles de paginação
    histPaginaAtual = 1;
    histStackDocs = [];
    
    const activeView = document.querySelector('.view.active').id;
    if(activeView === 'dashboard') window.carregarDashboard();
    if(activeView === 'historico') window.carregarHistorico();
    // Adicione outros if se precisar filtrar gastos com esse botão
};

// Função para mudar de página (Next/Prev)
window.mudarPaginaHistorico = (delta) => {
    const novaPagina = histPaginaAtual + delta;
    if (novaPagina < 1) return;
    
    histPaginaAtual = novaPagina;
    window.carregarHistorico();
};

// --- FUNÇÃO DE IMPRESSÃO DA NOTA DE VENDA ---
window.imprimirNota = async (venda, itensCarrinho) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Configurações visuais
    const corBorda = '#000000';
    const larguraPagina = 210; // A4
    const margemEsq = 10;
    
    // --- CABEÇALHO ---
    // Retângulo Principal do Cabeçalho
    doc.setDrawColor(0);
    doc.rect(10, 10, 190, 35); // Borda externa topo

    // Divisórias verticais do cabeçalho
    doc.line(70, 10, 70, 45); // Separa Logo/Dados
    doc.line(160, 10, 160, 45); // Separa Dados/Nota

    // 1. Área da Empresa (Centro)
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("NUTRIFORTE", 115, 18, { align: "center" });
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("RUA SILVIO SANTOS, 398 - AMARALINA", 115, 24, { align: "center" });
    doc.text("BOM JESUS DA LAPA - BA - CEP: 47600000", 115, 29, { align: "center" });
    doc.text("TEL.: (77) 9191 - 1821", 115, 34, { align: "center" });

   doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Nota de Venda", 180, 16, { align: "center" }); // Centralizado em 180
    
    // Número da Venda
    const idCurto = venda.id ? venda.id.substring(0, 8).toUpperCase() : "NOVO";
    doc.text(`VN-${idCurto}`, 180, 22, { align: "center" }); // Centralizado em 180

    doc.line(160, 25, 200, 25); // Linha divisória horizontal

    // DADOS MENORES (Data, Página, Empresa)
    doc.setFontSize(7); // Reduzi de 8 para 7 para garantir que caiba
    doc.setFont("helvetica", "normal");
    
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const horaHoje = new Date().toLocaleTimeString('pt-BR');
    
    // Centralizando tudo em X = 180 (meio do quadro da direita)
    doc.text(`Emissão: ${dataHoje} ${horaHoje}`, 180, 29, { align: "center" });
    doc.text(`Página: 1 de 1`, 180, 33, { align: "center" });
    
    // Para o nome da empresa, se for muito grande, usamos splitTextToSize ou apenas centralizamos
    // Vou colocar centralizado, que resolve para "NUTRIFORTE RACOES"
    doc.text(`EMP.: NUTRIFORTE RACOES`, 180, 37, { align: "center" });

    // --- DADOS DO CLIENTE ---
    const startYCliente = 50;
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`FANTASIA: ${venda.cliente}`, 10, startYCliente);
    doc.text(`R.SOCIAL: ${venda.cliente}`, 130, startYCliente);
    
    doc.setFont("helvetica", "normal");
    doc.text("Endereço não informado", 10, startYCliente + 5);
    doc.text("COMPLEMENTO:", 130, startYCliente + 5);
    
    doc.text("CPF/CNPJ: null", 10, startYCliente + 10);
    doc.text("BAIRRO:", 80, startYCliente + 10);
    doc.text("CIDADE: Bom Jesus da Lapa", 130, startYCliente + 10);

    doc.setFont("helvetica", "bold");
    doc.text(`DATA: ${dataHoje}`, 190, startYCliente + 18, { align: "right" });

    // --- TABELA DE ITENS ---
    // Prepara os dados para a tabela
    const colunas = ["REF", "DESCRIÇÃO", "UND", "QTDE", "PREÇO", "DESC.", "TOTAL"];
    const linhas = itensCarrinho.map((item, index) => [
        (index + 1).toString().padStart(3, '0'), // REF simples
        item.nome.toUpperCase(),
        "UN", // Unidade padrão (pode ajustar se tiver no cadastro)
        item.qtd.toString(),
        item.unit.toFixed(2).replace('.', ','),
        "0,00",
        item.total.toFixed(2).replace('.', ',')
    ]);

    doc.autoTable({
        startY: 75,
        head: [colunas],
        body: linhas,
        theme: 'plain', // Tema simples para parecer nota fiscal
        styles: { 
            fontSize: 9, 
            cellPadding: 2, 
            lineColor: [200, 200, 200], 
            lineWidth: 0.1 
        },
        headStyles: { 
            fontStyle: 'bold', 
            fillColor: [255, 255, 255], 
            textColor: 0, 
            lineColor: 0, 
            lineWidth: 0.1,
            border: 'bottom' // Apenas borda inferior no cabeçalho
        },
        columnStyles: {
            0: { cellWidth: 15 }, // REF
            1: { cellWidth: 'auto' }, // DESCRIÇÃO
            2: { cellWidth: 15 }, // UND
            3: { cellWidth: 15, halign: 'center' }, // QTDE
            4: { cellWidth: 25, halign: 'right' }, // PREÇO
            5: { cellWidth: 20, halign: 'right' }, // DESC
            6: { cellWidth: 25, halign: 'right' }  // TOTAL
        },
        margin: { left: 10, right: 10 }
    });

    // --- RODAPÉ DA NOTA (TOTALIZADORES E ASSINATURAS) ---
    // Pegar a posição Y onde a tabela terminou
    let finalY = doc.lastAutoTable.finalY + 10;
    
    // Garante que o rodapé fique na parte inferior se a nota for pequena, 
    // ou logo após a tabela se for grande (mas cuidado com quebra de página)
    if (finalY < 220) finalY = 220; 

    doc.setDrawColor(0);
    doc.line(10, finalY, 200, finalY); // Linha separadora superior do rodapé

    // Bloco Esquerdo (Assinaturas)
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(`Resp. / Vendedor: ADMINISTRADOR`, 12, finalY + 5);
    
    doc.text("Data Recebimento: _____/_____/_______", 12, finalY + 12);
    
    doc.text("Aceite do Cliente:", 12, finalY + 19);
    doc.line(40, finalY + 19, 110, finalY + 19); // Linha para assinatura
    
    doc.setFontSize(9);
    doc.text("AJUSTE DE ESTOQUE", 60, finalY + 24, { align: "center" });

    // Bloco Direito (Totais)
    // Linhas verticais do bloco de totais
    doc.line(115, finalY, 115, finalY + 25); 
    doc.line(150, finalY, 150, finalY + 25); 
    
    // Qtde e Volumes
    doc.setFont("helvetica", "bold");
    doc.text("Qtde", 117, finalY + 5);
    doc.setFont("helvetica", "normal");
    doc.text(itensCarrinho.length.toString(), 145, finalY + 5, { align: "right" });
    
    doc.setFont("helvetica", "bold");
    doc.text("Volumes", 117, finalY + 23);
    doc.text("_______", 145, finalY + 23, { align: "right" });

    // Valores Monetários
    const totalGeral = itensCarrinho.reduce((acc, item) => acc + item.total, 0);

    doc.setFont("helvetica", "bold");
    doc.text("Total da Nota:", 152, finalY + 5);
    doc.text(`R$ ${totalGeral.toFixed(2).replace('.', ',')}`, 198, finalY + 5, { align: "right" });
    
    doc.text("Desconto:", 152, finalY + 10);
    doc.text("R$ 0,00", 198, finalY + 10, { align: "right" });

    doc.setFontSize(10);
    doc.text("Total a Pagar:", 152, finalY + 23);
    doc.text(`R$ ${totalGeral.toFixed(2).replace('.', ',')}`, 198, finalY + 23, { align: "right" });

    doc.line(10, finalY + 25, 200, finalY + 25); // Linha final

    // Rodapézinho (Prazo e valor)
    doc.setFontSize(7);
    doc.text("PRAZO / 1", 12, finalY + 30);
    const dataVenc = new Date();
    dataVenc.setDate(dataVenc.getDate() + 30);
    doc.text(`A Pagar ${dataVenc.toLocaleDateString('pt-BR')}`, 60, finalY + 30);
    doc.text(`R$ ${totalGeral.toFixed(2).replace('.', ',')}`, 120, finalY + 30);

    // Abrir PDF em nova aba ou baixar
    // doc.save(`Nota_${idCurto}.pdf`); // Para baixar direto
    window.open(doc.output('bloburl'), '_blank'); // Para abrir em nova aba e imprimir
};

window.excluirMassaEstoque = async () => { const c = document.querySelectorAll('.stock-checkbox:checked'); if(c.length===0) return; window.mostrarConfirmacao("Apagar?", `Excluir ${c.length} produtos?`, async () => { window.mostrarLoading(true); for(const x of c) await deleteDoc(doc(db, COLECAO_PRODUTOS, x.value)); window.mostrarLoading(false); window.carregarEstoque(); }); };
window.excluirProduto = async (id) => { window.mostrarConfirmacao("Excluir?", "Apagar produto?", async () => { await deleteDoc(doc(db, COLECAO_PRODUTOS, id)); window.carregarEstoque(); }); };
window.abrirEditarProduto = async (id) => { const p = produtosCache.find(x => x.id === id); if(p) { document.getElementById('edit-prod-id').value = id; document.getElementById('edit-prod-nome').value = p.nome; document.getElementById('edit-prod-custo').value = p.custo; document.getElementById('edit-prod-venda').value = p.venda; document.getElementById('edit-prod-qtd').value = p.qtd; document.getElementById('modal-prod').classList.remove('hidden'); } };
window.salvarEdicaoProduto = async () => { const id = document.getElementById('edit-prod-id').value; window.mostrarLoading(true); await updateDoc(doc(db, COLECAO_PRODUTOS, id), { nome: document.getElementById('edit-prod-nome').value, custo: parseFloat(document.getElementById('edit-prod-custo').value), venda: parseFloat(document.getElementById('edit-prod-venda').value), qtd: parseFloat(document.getElementById('edit-prod-qtd').value) }); window.mostrarLoading(false); document.getElementById('modal-prod').classList.add('hidden'); window.carregarEstoque(); };
window.abrirEditarCliente = async (id) => { let c = clientesCache.find(x => x.id === id); if(c){ document.getElementById('edit-cli-id').value = id; document.getElementById('edit-cli-nome').value = c.nome; document.getElementById('edit-cli-tel').value = c.tel || ''; document.getElementById('edit-cli-cpf').value = c.cpf || ''; document.getElementById('edit-cli-endereco').value = c.endereco || ''; document.getElementById('modal-cliente-edit').classList.remove('hidden'); } };
window.salvarEdicaoCliente = async () => { const id = document.getElementById('edit-cli-id').value; window.mostrarLoading(true); await updateDoc(doc(db, COLECAO_CLIENTES, id), { nome: document.getElementById('edit-cli-nome').value.toUpperCase(), tel: document.getElementById('edit-cli-tel').value, cpf: document.getElementById('edit-cli-cpf').value, endereco: document.getElementById('edit-cli-endereco').value }); window.mostrarLoading(false); document.getElementById('modal-cliente-edit').classList.add('hidden'); window.carregarClientes(); };
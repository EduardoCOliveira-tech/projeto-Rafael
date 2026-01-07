import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } 
       from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, limit, Timestamp, doc, updateDoc, deleteDoc, increment, getDoc, writeBatch } 
       from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// ============================================================
// 1. CONFIGURAÇÃO FIREBASE
// ============================================================
// ⚠️ COLOQUE SUAS CHAVES AQUI
const firebaseConfig = {
  apiKey: "AIzaSyBx34219zAWq6qtvs7qO3-SMSVRHJ5dX8M",
  authDomain: "projeto-rafael-f9eef.firebaseapp.com",
  projectId: "projeto-rafael-f9eef",
  storageBucket: "projeto-rafael-f9eef.firebasestorage.app",
  messagingSenderId: "1058117376976",
  appId: "1:1058117376976:web:78a6891a5ec9904d7637d5",
  measurementId: "G-NWXV5KCE2V"
}

let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Erro Firebase:", e);
    alert("ERRO CRÍTICO: Configure o app.js com suas chaves!");
}

// ============================================================
// 2. GLOBAIS
// ============================================================
let chartInstance = null;
let dailyChartInstance = null;
let chartGastoStatus = null;
let chartGastoMetodo = null;
let chartGastoEvolucao = null;

let produtosCache = [];
let clientesCache = [];
let categoriasCache = [];
let bancosCache = [];

const COLECAO_VENDAS = 'loja_vendas';
const COLECAO_PRODUTOS = 'loja_produtos';
const COLECAO_CATEGORIAS = 'loja_categorias_config';
const COLECAO_CLIENTES = 'loja_clientes';
const COLECAO_GASTOS = 'loja_gastos';
const COLECAO_BANCOS = 'loja_bancos';

// ============================================================
// 3. INICIALIZAÇÃO
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    
    // Filtros de Data
    const elInicio = document.getElementById('data-inicio');
    const elFim = document.getElementById('data-fim');
    if(elInicio) elInicio.valueAsDate = inicio;
    if(elFim) elFim.valueAsDate = fim;
    
    // Filtro Mês Gastos
    const mesStr = hoje.toISOString().slice(0, 7); // YYYY-MM
    const elMesGastos = document.getElementById('mes-gastos');
    if(elMesGastos) elMesGastos.value = mesStr;
    
    // Data Venda Manual
    const elVendaData = document.getElementById('venda-data');
    if(elVendaData) elVendaData.valueAsDate = hoje;

    // Dark Mode
    const btnTheme = document.getElementById('theme-toggle');
    if(btnTheme) {
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-mode');
            btnTheme.querySelector('i').classList.replace('fa-moon', 'fa-sun');
        }
        btnTheme.onclick = (e) => {
            e.preventDefault();
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            btnTheme.querySelector('i').classList.replace(isDark ? 'fa-moon' : 'fa-sun', isDark ? 'fa-sun' : 'fa-moon');
            updateChartsTheme();
        };
    }

    // Sidebar Toggle
    const btnSidebar = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (btnSidebar && sidebar) {
        btnSidebar.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
});

function updateChartsTheme() {
    [chartInstance, dailyChartInstance, chartGastoStatus, chartGastoMetodo, chartGastoEvolucao].forEach(c => {
        if(c) c.update();
    });
}

// ============================================================
// 4. AUTENTICAÇÃO
// ============================================================
const loginForm = document.getElementById('login-form');
if(loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value);
        } catch (error) {
            document.getElementById('login-msg').innerText = "Erro: " + error.message;
        }
    });
}
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
        carregarCategorias(),
        carregarEstoque(),
        carregarClientes(),
        carregarDashboard(),
        carregarGastos(),
        carregarBancos()
    ]).catch(console.error);
}

// ============================================================
// 5. NAVEGAÇÃO
// ============================================================
document.querySelectorAll('.menu li').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.menu li').forEach(li => li.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        item.classList.add('active');
        const target = item.getAttribute('data-target');
        document.getElementById(target).classList.add('active');
        
        const filtroGeral = document.getElementById('filtro-periodo-geral');
        const filtroGastos = document.getElementById('filtro-mes-gastos');
        
        if (target === 'gastos') {
            if(filtroGeral) filtroGeral.classList.add('hidden');
            if(filtroGastos) filtroGastos.classList.remove('hidden');
            carregarGastos();
        } else if (target === 'dashboard' || target === 'historico') {
            if(filtroGeral) filtroGeral.classList.remove('hidden');
            if(filtroGastos) filtroGastos.classList.add('hidden');
            if(target === 'dashboard') carregarDashboard();
            if(target === 'historico') carregarHistorico();
        } else {
            if(filtroGeral) filtroGeral.classList.add('hidden');
            if(filtroGastos) filtroGastos.classList.add('hidden');
        }

        if(target === 'devedores') carregarDevedores();
        if(target === 'estoque') carregarEstoque();
        if(target === 'clientes') carregarClientes();
    });
});

window.filtrarPorData = () => {
    if(document.getElementById('dashboard').classList.contains('active')) carregarDashboard();
    if(document.getElementById('historico').classList.contains('active')) carregarHistorico();
};

function mostrarLoading(show) {
    const el = document.getElementById('loading-indicator');
    if(el) show ? el.classList.remove('hidden') : el.classList.add('hidden');
}

// ============================================================
// 6. GASTOS E GRÁFICOS DE GASTOS
// ============================================================
window.toggleCamposPagamento = (idSelect, idContainer) => {
    const status = document.getElementById(idSelect).value;
    const container = document.getElementById(idContainer);
    if(status === 'pago') {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
};

window.carregarBancos = async () => {
    const selects = [document.getElementById('gasto-banco'), document.getElementById('edit-gasto-banco')];
    const ul = document.getElementById('lista-bancos');
    
    if(ul) ul.innerHTML = '';
    
    selects.forEach(s => { 
        if(s) s.innerHTML = '<option value="">Selecione...</option>'; 
    });
    
    bancosCache = [];
    const snap = await getDocs(collection(db, COLECAO_BANCOS));
    
    snap.forEach(d => {
        const b = d.data();
        bancosCache.push(b.nome);
        selects.forEach(s => { 
            if(s) { 
                const opt = document.createElement('option'); 
                opt.value = b.nome; 
                opt.text = b.nome; 
                s.appendChild(opt); 
            } 
        });
        if(ul) ul.innerHTML += `<li>${b.nome} <button onclick="window.removerBanco('${d.id}')" style="color:red;border:none;background:none;cursor:pointer;margin-left:10px">X</button></li>`;
    });
};

window.abrirModalBancos = () => document.getElementById('modal-bancos').classList.remove('hidden');

window.adicionarBanco = async () => { 
    const n = document.getElementById('novo-banco-nome').value.trim(); 
    if(n) { 
        await addDoc(collection(db, COLECAO_BANCOS), { nome: n }); 
        document.getElementById('novo-banco-nome').value = ''; 
        carregarBancos(); 
    } 
};

window.removerBanco = async (id) => { 
    if(confirm("Excluir?")) { 
        await deleteDoc(doc(db, COLECAO_BANCOS, id)); 
        carregarBancos(); 
    } 
};

window.carregarGastos = async () => {
    const mesInput = document.getElementById('mes-gastos').value; 
    const [ano, mes] = mesInput.split('-');
    const inicio = new Date(ano, mes - 1, 1);
    const fim = new Date(ano, mes, 0, 23, 59, 59);

    const q = query(collection(db, COLECAO_GASTOS), where("dataEntrada", ">=", Timestamp.fromDate(inicio)), where("dataEntrada", "<=", Timestamp.fromDate(fim)), orderBy("dataEntrada", "desc"));
    const snap = await getDocs(q);
    
    const tbody = document.querySelector('#tabela-gastos tbody');
    tbody.innerHTML = '';
    document.getElementById('bulk-actions-gastos').classList.add('hidden');
    const selectAll = document.getElementById('select-all-gastos');
    if(selectAll) selectAll.checked = false;

    let totalMes = 0;
    
    const statusCount = { pago: 0, pendente: 0 };
    const metodoCount = {};
    const evolucaoDia = {};

    snap.forEach(d => {
        const g = d.data();
        totalMes += g.valor;
        const dataF = g.dataEntrada.toDate().toLocaleDateString('pt-BR');
        const vencF = g.vencimento ? new Date(g.vencimento).toLocaleDateString('pt-BR') : '-';
        const badge = g.status === 'pago' ? 'badge-success' : 'badge-danger';
        const bancoDisplay = g.status === 'pago' ? (g.banco || '-') : '-';
        const metodoDisplay = g.status === 'pago' ? (g.metodo || '-') : '-';
        
        if(g.status === 'pago') statusCount.pago += g.valor;
        else statusCount.pendente += g.valor;

        if(g.status === 'pago' && g.metodo) {
            metodoCount[g.metodo] = (metodoCount[g.metodo] || 0) + g.valor;
        }

        const dia = g.dataEntrada.toDate().getDate();
        evolucaoDia[dia] = (evolucaoDia[dia] || 0) + g.valor;

        tbody.innerHTML += `<tr>
            <td style="text-align:center"><input type="checkbox" class="gasto-checkbox" value="${d.id}"></td>
            <td>${dataF}</td><td>${g.nome}</td><td>${bancoDisplay}</td><td>${metodoDisplay}</td><td>${vencF}</td>
            <td>R$ ${g.valor.toFixed(2)}</td>
            <td><span class="badge ${badge}">${g.status.toUpperCase()}</span></td>
            <td>
                <button onclick="window.abrirEditarGasto('${d.id}')" class="btn-icon btn-edit"><i class="fas fa-edit"></i></button>
                <button onclick="window.excluirGasto('${d.id}')" class="btn-icon btn-delete"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    
    const kpi = document.getElementById('kpi-gastos');
    if(kpi) kpi.innerText = `R$ ${totalMes.toFixed(2)}`;

    configurarCheckboxes('select-all-gastos', 'gasto-checkbox', 'bulk-actions-gastos', null);
    renderGastosCharts(statusCount, metodoCount, evolucaoDia);
};

function renderGastosCharts(statusData, metodoData, evolucaoData) {
    const ctx1 = document.getElementById('chartGastoStatus');
    if(ctx1) {
        if(chartGastoStatus) chartGastoStatus.destroy();
        chartGastoStatus = new Chart(ctx1.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Pago', 'Pendente'],
                datasets: [{ data: [statusData.pago, statusData.pendente], backgroundColor: ['#10B981', '#EF4444'] }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const ctx2 = document.getElementById('chartGastoMetodo');
    if(ctx2) {
        if(chartGastoMetodo) chartGastoMetodo.destroy();
        chartGastoMetodo = new Chart(ctx2.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Object.keys(metodoData),
                datasets: [{ label: 'Total por Método', data: Object.values(metodoData), backgroundColor: '#6366f1' }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const ctx3 = document.getElementById('chartGastoEvolucao');
    if(ctx3) {
        if(chartGastoEvolucao) chartGastoEvolucao.destroy();
        const dias = Object.keys(evolucaoData).sort((a,b) => a-b);
        const valores = dias.map(d => evolucaoData[d]);
        chartGastoEvolucao = new Chart(ctx3.getContext('2d'), {
            type: 'line',
            data: {
                labels: dias,
                datasets: [{ label: 'Gastos no Mês', data: valores, borderColor: '#F59E0B', tension: 0.3, fill: true, backgroundColor: 'rgba(245, 158, 11, 0.1)' }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

document.getElementById('form-gasto')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('gasto-nome').value;
    const valor = parseFloat(document.getElementById('gasto-valor').value);
    const dtEntrada = new Date(document.getElementById('gasto-data-entrada').value + 'T12:00:00');
    const dtVenc = document.getElementById('gasto-data-vencimento').value;
    const status = document.getElementById('gasto-status').value;
    let metodo = null; let banco = null;
    
    if(status === 'pago') {
        metodo = document.getElementById('gasto-metodo').value;
        banco = document.getElementById('gasto-banco').value;
        if(!banco) return alert("Selecione o banco!");
    }
    
    mostrarLoading(true);
    await addDoc(collection(db, COLECAO_GASTOS), { nome, valor, status, metodo, banco, dataEntrada: Timestamp.fromDate(dtEntrada), vencimento: dtVenc });
    mostrarLoading(false);
    alert("Gasto registrado!");
    document.getElementById('form-gasto').reset();
    window.toggleCamposPagamento('gasto-status', 'container-pagamento-novo');
    carregarGastos();
});

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
        if(g.status === 'pago') {
            document.getElementById('edit-gasto-metodo').value = g.metodo || 'dinheiro';
            document.getElementById('edit-gasto-banco').value = g.banco || '';
        }
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

    if(status === 'pago') {
        metodo = document.getElementById('edit-gasto-metodo').value;
        banco = document.getElementById('edit-gasto-banco').value;
        if(!banco) return alert("Selecione o banco!");
    }

    mostrarLoading(true);
    await updateDoc(doc(db, COLECAO_GASTOS, id), { nome, valor, status, metodo, banco, dataEntrada: Timestamp.fromDate(dtEntrada), vencimento: dtVenc });
    mostrarLoading(false);
    document.getElementById('modal-gasto-edit').classList.add('hidden');
    carregarGastos();
};

window.excluirGasto = async (id) => { 
    if(confirm("Excluir?")) { 
        await deleteDoc(doc(db, COLECAO_GASTOS, id)); 
        carregarGastos(); 
    } 
};

window.excluirMassaGastos = async () => { 
    const c = document.querySelectorAll('.gasto-checkbox:checked'); 
    if(!confirm(`Apagar ${c.length}?`)) return; 
    mostrarLoading(true); 
    for(const x of c) { 
        try { 
            await deleteDoc(doc(db, COLECAO_GASTOS, x.value)); 
        } catch(e) {} 
    } 
    mostrarLoading(false); 
    carregarGastos(); 
};

// ============================================================
// 7. ESTOQUE E CATEGORIAS
// ============================================================
const btnAddCat = document.getElementById('btn-add-cat');
if (btnAddCat) {
    btnAddCat.addEventListener('click', async () => {
        const nova = prompt("Nome da Nova Categoria:");
        if (nova) {
            const sel = document.getElementById('prod-categoria');
            let existe = false;
            for (let i = 0; i < sel.options.length; i++) if (sel.options[i].value === nova.toUpperCase()) existe = true;
            if (!existe) {
                mostrarLoading(true);
                try {
                    await addDoc(collection(db, COLECAO_CATEGORIAS), { nome: nova.toUpperCase(), margem: 30 });
                    await carregarCategorias();
                    alert("Categoria adicionada!");
                } catch (e) { console.error(e); alert("Erro."); } finally { mostrarLoading(false); }
            } else { alert("Já existe!"); }
        }
    });
}

const btnDelCat = document.getElementById('btn-del-cat');
if (btnDelCat) {
    btnDelCat.addEventListener('click', async () => {
        const sel = document.getElementById('prod-categoria');
        const nomeCategoria = sel.value;
        if (!nomeCategoria) return alert("Selecione.");
        if (!confirm(`Excluir "${nomeCategoria}"?`)) return;
        mostrarLoading(true);
        try {
            const q = query(collection(db, COLECAO_CATEGORIAS), where("nome", "==", nomeCategoria));
            const snap = await getDocs(q);
            const deletePromises = [];
            snap.forEach((d) => deletePromises.push(deleteDoc(doc(db, COLECAO_CATEGORIAS, d.id))));
            await Promise.all(deletePromises);
            alert("Removida!");
            await carregarCategorias();
        } catch (e) { console.error(e); alert("Erro."); } finally { mostrarLoading(false); }
    });
}

const inputNomeProd = document.getElementById('prod-nome');
if (inputNomeProd) {
    inputNomeProd.addEventListener('input', function() {
        const nomeDigitado = this.value;
        const produto = produtosCache.find(p => p.nome === nomeDigitado);
        if(produto) {
            document.getElementById('prod-custo').value = produto.custo;
            document.getElementById('prod-venda').value = produto.venda;
            document.getElementById('prod-categoria').value = produto.categoria;
            document.getElementById('prod-qtd').value = "";
            if(produto.categoria) {
                const cat = categoriasCache.find(c => c.nome === produto.categoria);
                if(cat && cat.margem) document.getElementById('prod-margem').value = cat.margem;
            }
            document.getElementById('prod-qtd').focus();
        }
    });
}

async function carregarCategorias() {
    const sel = document.getElementById('prod-categoria');
    if(!sel) return;
    sel.innerHTML = '<option value="">Selecione...</option>';
    categoriasCache = [];
    const nomesAdicionados = new Set(); 

    const snap = await getDocs(query(collection(db, COLECAO_CATEGORIAS), orderBy("nome")));
    snap.forEach(d => {
        const cat = d.data();
        if (!nomesAdicionados.has(cat.nome)) {
            nomesAdicionados.add(cat.nome);
            categoriasCache.push({ nome: cat.nome, margem: cat.margem || 0 });
            const opt = document.createElement('option');
            opt.value = cat.nome; opt.text = cat.nome;
            sel.appendChild(opt);
        }
    });
}

window.atualizarMargemCategoria = () => {
    const catNome = document.getElementById('prod-categoria').value;
    const cat = categoriasCache.find(c => c.nome === catNome);
    if(cat && cat.margem) { 
        document.getElementById('prod-margem').value = cat.margem; 
        window.calcularPrecoVenda(); 
    }
};

window.calcularPrecoVenda = () => {
    const c = parseFloat(document.getElementById('prod-custo').value) || 0;
    const m = parseFloat(document.getElementById('prod-margem').value) || 0;
    if(c > 0) document.getElementById('prod-venda').value = (c + (c * (m / 100))).toFixed(2);
};

document.getElementById('form-produto')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nomeInput = document.getElementById('prod-nome').value.trim();
    const categoria = document.getElementById('prod-categoria').value;
    const custo = parseFloat(document.getElementById('prod-custo').value);
    const venda = parseFloat(document.getElementById('prod-venda').value);
    const qtd = parseInt(document.getElementById('prod-qtd').value);
    const margem = parseFloat(document.getElementById('prod-margem').value) || 0;
    
    mostrarLoading(true);
    try {
        if(margem > 0) {
            const qCat = query(collection(db, COLECAO_CATEGORIAS), where("nome", "==", categoria));
            const snapCat = await getDocs(qCat);
            if(!snapCat.empty) await updateDoc(doc(db, COLECAO_CATEGORIAS, snapCat.docs[0].id), { margem: margem });
        }
        
        const q = query(collection(db, COLECAO_PRODUTOS), where("nome", "==", nomeInput));
        const sn = await getDocs(q);
        
        if (!sn.empty) { 
            const p = sn.docs[0]; 
            await updateDoc(doc(db, COLECAO_PRODUTOS, p.id), { qtd: p.data().qtd + qtd, custo, venda, categoria }); 
            alert("Estoque atualizado!"); 
        } else { 
            await addDoc(collection(db, COLECAO_PRODUTOS), { nome: nomeInput, categoria, custo, venda, qtd, ativo: true, criadoEm: Timestamp.now() }); 
            alert("Cadastrado!"); 
        }
        document.getElementById('form-produto').reset(); 
        carregarEstoque();
    } catch (error) { 
        console.error(error); alert("Erro."); 
    } finally { 
        mostrarLoading(false); 
    }
});

async function carregarEstoque() {
    const snap = await getDocs(query(collection(db, COLECAO_PRODUTOS), orderBy("nome")));
    const tb = document.querySelector('#tabela-estoque tbody');
    const dv = document.getElementById('list-produtos-venda');
    const dbusca = document.getElementById('list-busca-estoque');
    const dform = document.getElementById('list-sugestoes-produtos');
    
    tb.innerHTML = ''; 
    if(dv) dv.innerHTML = ''; 
    if(dbusca) dbusca.innerHTML = ''; 
    if(dform) dform.innerHTML = '';
    
    produtosCache = []; 
    document.getElementById('bulk-actions-estoque').classList.add('hidden'); 
    document.getElementById('select-all-stock').checked = false;
    
    snap.forEach(d => {
        const p = d.data();
        produtosCache.push({ id: d.id, ...p }); 
        
        let h = `<tr>
            <td style="text-align:center"><input type="checkbox" class="stock-checkbox" value="${d.id}"></td>
            <td>${p.nome}</td>
            <td><span class="badge" style="background:#e0e7ff; color:#3730a3">${p.categoria||'GER'}</span></td>
            <td>R$ ${p.custo.toFixed(2)}</td>
            <td>R$ ${p.venda.toFixed(2)}</td>
            <td>${p.qtd}</td>
            <td>
                <button onclick="window.abrirEditarProduto('${d.id}')" class="btn-icon btn-edit"><i class="fas fa-edit"></i></button>
                <button onclick="window.excluirProduto('${d.id}')" class="btn-icon btn-delete"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
        tb.insertAdjacentHTML('beforeend', h);
        
        const o = document.createElement('option'); o.value = p.nome;
        if(dbusca) dbusca.appendChild(o.cloneNode(true)); 
        if(dform) dform.appendChild(o.cloneNode(true)); 
        if(dv) dv.appendChild(optClone(o));
    });
    configurarCheckboxes('select-all-stock', 'stock-checkbox', 'bulk-actions-estoque', 'selected-count-stock');
}

function optClone(o){ return o.cloneNode(true); }

// Edição e Exclusão Globais
window.excluirMassaEstoque = async () => {
    const c = document.querySelectorAll('.stock-checkbox:checked');
    if(!confirm(`Apagar ${c.length} produtos?`)) return;
    mostrarLoading(true);
    for(const x of c) await deleteDoc(doc(db, COLECAO_PRODUTOS, x.value));
    mostrarLoading(false);
    carregarEstoque();
};

window.excluirProduto = async (id) => {
    if(confirm("Excluir?")) { 
        await deleteDoc(doc(db, COLECAO_PRODUTOS, id)); 
        carregarEstoque(); 
    }
};

window.abrirEditarProduto = async (id) => {
    const p = produtosCache.find(x => x.id === id);
    if(p) { 
        document.getElementById('edit-prod-id').value = id; 
        document.getElementById('edit-prod-nome').value = p.nome; 
        document.getElementById('edit-prod-custo').value = p.custo; 
        document.getElementById('edit-prod-venda').value = p.venda; 
        document.getElementById('edit-prod-qtd').value = p.qtd; 
        document.getElementById('modal-prod').classList.remove('hidden'); 
    }
};

window.salvarEdicaoProduto = async () => {
    const id = document.getElementById('edit-prod-id').value; 
    mostrarLoading(true);
    await updateDoc(doc(db, COLECAO_PRODUTOS, id), { 
        nome: document.getElementById('edit-prod-nome').value, 
        custo: parseFloat(document.getElementById('edit-prod-custo').value), 
        venda: parseFloat(document.getElementById('edit-prod-venda').value), 
        qtd: parseInt(document.getElementById('edit-prod-qtd').value) 
    });
    mostrarLoading(false); 
    document.getElementById('modal-prod').classList.add('hidden'); 
    carregarEstoque();
};

window.filtrarEstoque = () => { 
    const t = document.getElementById('busca-estoque').value.toLowerCase(); 
    document.querySelectorAll('#tabela-estoque tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(t)?'':'none'); 
};

// ============================================================
// 8. CLIENTES
// ============================================================
document.getElementById('form-cliente')?.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    mostrarLoading(true);
    await addDoc(collection(db, COLECAO_CLIENTES), { 
        nome: document.getElementById('cli-nome').value.toUpperCase(), 
        tel: document.getElementById('cli-tel').value, 
        cpf: document.getElementById('cli-cpf').value, 
        endereco: document.getElementById('cli-endereco').value 
    });
    mostrarLoading(false); 
    document.getElementById('form-cliente').reset(); 
    carregarClientes(); 
    alert("Salvo!");
});

async function carregarClientes() {
    const snap = await getDocs(query(collection(db, COLECAO_CLIENTES), orderBy("nome")));
    const tbody = document.querySelector('#tabela-clientes tbody');
    const datalist = document.getElementById('list-clientes-venda');
    
    tbody.innerHTML = ''; 
    if(datalist) datalist.innerHTML = '<option value="Consumidor Final">';
    
    clientesCache = []; 
    document.getElementById('bulk-actions-clientes').classList.add('hidden'); 
    document.getElementById('select-all-cli').checked = false;
    
    snap.forEach(d => {
        const c = d.data(); 
        clientesCache.push({ id: d.id, ...c });
        
        tbody.innerHTML += `<tr>
            <td style="text-align:center"><input type="checkbox" class="cli-checkbox" value="${d.id}"></td>
            <td>${c.nome}</td>
            <td>${c.tel||'-'}</td>
            <td>${c.cpf||'-'}</td>
            <td>
                <button onclick="window.abrirEditarCliente('${d.id}')" class="btn-icon btn-edit"><i class="fas fa-edit"></i></button>
                <button onclick="window.excluirCliente('${d.id}')" class="btn-icon btn-delete"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
        
        if(datalist) { 
            const opt = document.createElement('option'); 
            opt.value = c.nome; 
            datalist.appendChild(opt); 
        }
    });
    configurarCheckboxes('select-all-cli', 'cli-checkbox', 'bulk-actions-clientes', 'selected-count-cli');
}

window.abrirEditarCliente = async (id) => {
    let c = clientesCache.find(x => x.id === id);
    if(c){ 
        document.getElementById('edit-cli-id').value = id; 
        document.getElementById('edit-cli-nome').value = c.nome; 
        document.getElementById('edit-cli-tel').value = c.tel || ''; 
        document.getElementById('edit-cli-cpf').value = c.cpf || ''; 
        document.getElementById('edit-cli-endereco').value = c.endereco || ''; 
        document.getElementById('modal-cliente-edit').classList.remove('hidden'); 
    }
};

window.salvarEdicaoCliente = async () => {
    const id = document.getElementById('edit-cli-id').value; 
    mostrarLoading(true);
    await updateDoc(doc(db, COLECAO_CLIENTES, id), { 
        nome: document.getElementById('edit-cli-nome').value.toUpperCase(), 
        tel: document.getElementById('edit-cli-tel').value, 
        cpf: document.getElementById('edit-cli-cpf').value, 
        endereco: document.getElementById('edit-cli-endereco').value 
    });
    mostrarLoading(false); 
    document.getElementById('modal-cliente-edit').classList.add('hidden'); 
    carregarClientes();
};

window.excluirMassaClientes = async()=>{
    const c = document.querySelectorAll('.cli-checkbox:checked');
    if(!confirm(`Apagar ${c.length}?`)) return;
    mostrarLoading(true);
    for(const x of c) await deleteDoc(doc(db,COLECAO_CLIENTES,x.value));
    mostrarLoading(false);
    carregarClientes();
};

window.excluirCliente = async(id)=>{
    if(confirm("Apagar?")) await deleteDoc(doc(db,COLECAO_CLIENTES,id));
    carregarClientes();
};

window.filtrarClientes = ()=>{
    const t = document.getElementById('busca-clientes').value.toLowerCase();
    document.querySelectorAll('#tabela-clientes tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(t)?'':'none');
};

// ============================================================
// 9. VENDAS (DATA MANUAL)
// ============================================================
function attTotal() { 
    const n = document.getElementById('venda-produto').value; 
    const q = document.getElementById('venda-qtd').value; 
    const p = produtosCache.find(x => x.nome === n); 
    if(p) { 
        const u = p.venda; 
        document.getElementById('venda-valor-unit').value = u.toFixed(2); 
        if(document.activeElement !== document.getElementById('venda-valor-total')) document.getElementById('venda-valor-total').value = (u * q).toFixed(2); 
    } else { 
        document.getElementById('venda-valor-unit').value = ""; 
    } 
}
document.getElementById('venda-produto')?.addEventListener('input', attTotal); 
document.getElementById('venda-qtd')?.addEventListener('input', attTotal);

document.getElementById('form-venda')?.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const n = document.getElementById('venda-produto').value; 
    const q = parseInt(document.getElementById('venda-qtd').value); 
    const m = document.getElementById('venda-metodo').value; 
    const c = document.getElementById('venda-cliente').value; 
    const t = parseFloat(document.getElementById('venda-valor-total').value); 
    const dt = document.getElementById('venda-data').value;
    
    const p = produtosCache.find(x => x.nome === n); 
    if (!p) return alert("Produto não encontrado!"); 
    if(m === 'aver' && (!c || c === 'Consumidor Final')) return alert("Fiado precisa de cliente!");
    
    const dtf = new Date(dt + 'T12:00:00'); 
    mostrarLoading(true);
    await addDoc(collection(db, COLECAO_VENDAS), { 
        produtoId: p.id, 
        produtoNome: p.nome, 
        qtd: q, 
        total: t, 
        custo: p.custo * q, 
        metodo: m, 
        cliente: c, 
        pago: m !== 'aver', 
        data: Timestamp.fromDate(dtf) 
    });
    await updateDoc(doc(db, COLECAO_PRODUTOS, p.id), { qtd: increment(-q) });
    mostrarLoading(false); 
    alert("Venda realizada!"); 
    document.getElementById('form-venda').reset(); 
    document.getElementById('venda-data').valueAsDate = new Date(); 
    document.getElementById('venda-produto').focus(); 
    carregarEstoque();
});

// ============================================================
// 10. DASHBOARD, HISTÓRICO E DEVEDORES
// ============================================================
// ATUALIZADO: FIADO TOTAL GERAL (Não depende da data)
async function carregarDashboard() {
    const i = new Date(document.getElementById('data-inicio').value + 'T00:00:00'); 
    const f = new Date(document.getElementById('data-fim').value + 'T23:59:59');
    
    // Consultas com filtro de data (para faturamento e gráficos)
    const qV = query(collection(db, COLECAO_VENDAS), where("data", ">=", Timestamp.fromDate(i)), where("data", "<=", Timestamp.fromDate(f)));
    const qG = query(collection(db, COLECAO_GASTOS), where("dataEntrada", ">=", Timestamp.fromDate(i)), where("dataEntrada", "<=", Timestamp.fromDate(f)));
    
    // Consulta TOTAL de fiado (sem filtro de data)
    const qFiadoTotal = query(collection(db, COLECAO_VENDAS), where("pago", "==", false));

    const [sv, sg, sf] = await Promise.all([getDocs(qV), getDocs(qG), getDocs(qFiadoTotal)]);
    
    let fat=0, custo=0, gastos=0; 
    const dias={};
    
    // Vendas do Período
    sv.forEach(d => { 
        const v=d.data(); 
        if(v.produtoNome!=="PAGAMENTO DÍVIDA"){ 
            fat+=v.total; 
            custo+=v.custo||0; 
            const dia=v.data.toDate().toLocaleDateString('pt-BR').slice(0,5); 
            dias[dia]=(dias[dia]||0)+v.total; 
        } 
    });
    
    // Gastos do Período
    sg.forEach(d => gastos+=d.data().valor);
    
    // Fiado TOTAL (Todas as datas)
    let fiadoGeral = 0;
    sf.forEach(d => {
        fiadoGeral += d.data().total;
    });
    
    document.getElementById('kpi-faturamento').innerText = `R$ ${fat.toFixed(2)}`; 
    document.getElementById('kpi-fiado').innerText = `R$ ${fiadoGeral.toFixed(2)}`; // Agora mostra o total geral!
    document.getElementById('kpi-gastos').innerText = `R$ ${gastos.toFixed(2)}`; 
    document.getElementById('kpi-lucro').innerText = `R$ ${(fat-custo-gastos).toFixed(2)}`;
    
    renderChart(fat, custo, gastos); 
    renderDailyChart(dias);
}

function renderChart(f, c, g) {
    const ctx = document.getElementById('mainChart'); 
    if(!ctx) return; 
    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx.getContext('2d'), { 
        type: 'bar', 
        data: { 
            labels: ['Financeiro'], 
            datasets: [
                { label: 'Vendas', data: [f], backgroundColor: '#4F46E5' }, 
                { label: 'Custos', data: [c], backgroundColor: '#F59E0B' }, 
                { label: 'Gastos', data: [g], backgroundColor: '#EF4444' }
            ] 
        }, 
        options: { responsive: true, maintainAspectRatio: false } 
    });
}

function renderDailyChart(dias) {
    const ctx = document.getElementById('dailyChart'); 
    if(!ctx) return; 
    if(dailyChartInstance) dailyChartInstance.destroy();
    
    const l = Object.keys(dias).sort(); 
    const v = l.map(d => dias[d]);
    
    dailyChartInstance = new Chart(ctx.getContext('2d'), { 
        type: 'bar', 
        data: { 
            labels: l, 
            datasets: [{ label: 'Vendas Diárias', data: v, backgroundColor: '#10B981' }] 
        }, 
        options: { responsive: true, maintainAspectRatio: false } 
    });
}

// Histórico
window.carregarHistorico = async () => { 
    const tb = document.querySelector('#tabela-historico tbody'); 
    tb.innerHTML = '<tr><td colspan="9">Carregando...</td></tr>'; 
    const i = new Date(document.getElementById('data-inicio').value + 'T00:00:00'); 
    const f = new Date(document.getElementById('data-fim').value + 'T23:59:59'); 
    const q = query(collection(db, COLECAO_VENDAS), where("data", ">=", Timestamp.fromDate(i)), where("data", "<=", Timestamp.fromDate(f)), orderBy("data", "desc"), limit(100)); 
    const s = await getDocs(q); 
    let h = ''; 
    s.forEach(d => { 
        const v = d.data(); 
        let pg = v.metodo; 
        if(pg==='aver') pg='Fiado'; 
        let b=v.pago?'badge-success':'badge-warning'; 
        let st=v.pago?'PAGO':'PENDENTE'; 
        let rc=''; 
        if(v.total<0&&!v.pago){ b='badge-success'; st='PAGO'; rc='style="background:#f0fdf4"'; }
        h += `<tr ${rc}>
            <td style="text-align:center"><input type="checkbox" class="sale-checkbox" value="${d.id}" data-pid="${v.produtoId}" data-qtd="${v.qtd}"></td>
            <td>${v.data?.toDate?v.data.toDate().toLocaleDateString('pt-BR'):'-'}</td>
            <td>${v.cliente}</td><td>${v.produtoNome}</td><td>${v.qtd||1}</td>
            <td style="${v.total<0?'color:green;font-weight:bold':''}">${v.total<0?'R$ '+Math.abs(v.total).toFixed(2)+' (Abatido)':'R$ '+v.total.toFixed(2)}</td>
            <td>${pg}</td><td><span class="badge ${b}">${st}</span></td>
            <td><button onclick="window.abrirEdicao('${d.id}','${v.total}','${v.metodo}')" class="btn-icon btn-edit"><i class="fas fa-edit"></i></button></td>
        </tr>`; 
    }); 
    tb.innerHTML = h; 
    configurarCheckboxes('select-all', 'sale-checkbox', 'bulk-actions', 'selected-count'); 
};

window.filtrarHistorico = () => { 
    const t = document.getElementById('busca-historico').value.toLowerCase(); 
    document.querySelectorAll('#tabela-historico tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(t)?'':'none'); 
};

window.excluirMassa = async () => { 
    const c = document.querySelectorAll('.sale-checkbox:checked'); 
    if(!confirm(`Apagar ${c.length}?`)) return; 
    mostrarLoading(true); 
    for(const x of c) { 
        try { 
            await deleteDoc(doc(db,COLECAO_VENDAS,x.value)); 
            const pid=x.dataset.pid; 
            const q=parseInt(x.dataset.qtd); 
            if(pid&&pid.length>10&&!isNaN(q)) await updateDoc(doc(db,COLECAO_PRODUTOS,pid),{qtd:increment(q)}); 
        } catch(e) {} 
    } 
    mostrarLoading(false); 
    carregarHistorico(); 
};

window.abrirEdicao = (id,v,m) => { 
    document.getElementById('edit-id').value=id; 
    document.getElementById('edit-valor').value=v; 
    document.getElementById('edit-metodo').value=m; 
    document.getElementById('modal-editar').classList.remove('hidden'); 
};

window.fecharModalEdicao = () => document.getElementById('modal-editar').classList.add('hidden');

window.salvarEdicaoVenda = async () => { 
    const id = document.getElementById('edit-id').value; 
    const m = document.getElementById('edit-metodo').value; 
    const valor = parseFloat(document.getElementById('edit-valor').value);
    
    // Se valor negativo (abatimento), 'pago' deve ser falso pra abater do devedor
    const isAbatimento = valor < 0;
    const isPago = isAbatimento ? false : (m !== 'aver');

    await updateDoc(doc(db,COLECAO_VENDAS,id),{ total: valor, metodo: m, pago: isPago }); 
    window.fecharModalEdicao(); 
    carregarHistorico(); 
};

// Devedores
async function carregarDevedores() { 
    const tb = document.querySelector('#tabela-devedores tbody'); 
    tb.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>'; 
    const s = await getDocs(query(collection(db,COLECAO_VENDAS),where("pago","==",false))); 
    const dv = {}; 
    s.forEach(d => { 
        const v=d.data(); 
        if(!dv[v.cliente]) dv[v.cliente]=0; 
        dv[v.cliente]+=v.total; 
    }); 
    let h = ''; 
    Object.keys(dv).sort().forEach(n => { 
        if(dv[n] > 0.01) { 
            h += `<tr>
                <td style="text-align:center"><input type="checkbox" class="dev-checkbox" value="${n}"></td>
                <td>${n}</td>
                <td style="color:var(--danger)">R$ ${dv[n].toFixed(2)}</td>
                <td>
                    <button onclick="window.verDetalhesDevedor('${n}')" class="btn-primary" style="font-size:0.8rem;margin-right:5px">Ver</button>
                    <button onclick="window.abrirModalAbatimento('${n}')" class="btn-success" style="font-size:0.8rem;padding:6px 14px"><i class="fas fa-hand-holding-usd"></i> Pagar</button>
                </td>
            </tr>`; 
        } 
    }); 
    tb.innerHTML = h || '<tr><td colspan="5">Ninguém deve!</td></tr>'; 
    configurarCheckboxes('select-all-dev','dev-checkbox','bulk-actions-devedores','selected-count-dev'); 
}

window.filtrarDevedores = () => { 
    const t = document.getElementById('busca-devedores').value.toLowerCase(); 
    document.querySelectorAll('#tabela-devedores tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(t)?'':'none'); 
};

window.excluirMassaDevedores = async () => { 
    const c = document.querySelectorAll('.dev-checkbox:checked'); 
    if(!confirm(`Perdoar ${c.length}?`)) return; 
    mostrarLoading(true); 
    for(const x of c) { 
        const n = x.value; 
        const s = await getDocs(query(collection(db,COLECAO_VENDAS),where("cliente","==",n),where("pago","==",false))); 
        s.forEach(async d => await deleteDoc(doc(db,COLECAO_VENDAS,d.id))); 
    } 
    mostrarLoading(false); 
    alert("Feito!"); 
    carregarDevedores(); 
};

window.verDetalhesDevedor = async (n) => { 
    const m = document.getElementById('modal-devedor'); 
    const tb = document.querySelector('#tabela-detalhes-devedor tbody'); 
    tb.innerHTML = '<tr><td>...</td></tr>'; 
    m.classList.remove('hidden'); 
    document.getElementById('titulo-devedor').innerText = `Extrato: ${n}`; 
    const s = await getDocs(query(collection(db,COLECAO_VENDAS),where("cliente","==",n),where("pago","==",false))); 
    let vs = []; 
    s.forEach(d => vs.push(d.data())); 
    vs.sort((a,b)=>b.data.seconds-a.data.seconds); 
    let h = ''; 
    let t = 0; 
    vs.forEach(v => { 
        t += v.total; 
        const pg = v.total < 0; 
        h += `<tr style="${pg?'background:#f0fdf4':''}"><td>${v.data?.toDate?v.data.toDate().toLocaleDateString('pt-BR'):'-'}</td><td>${v.produtoNome}</td><td style="${pg?'color:green':''}">R$ ${Math.abs(v.total).toFixed(2)}</td></tr>`; 
    }); 
    tb.innerHTML = h; 
    document.getElementById('total-divida-modal').innerText = `R$ ${t.toFixed(2)}`; 
};

window.abrirModalAbatimento = (n) => { 
    document.getElementById('abatimento-cliente').value = n; 
    document.getElementById('abatimento-cliente-nome').innerText = n; 
    document.getElementById('abatimento-valor').value = ''; 
    document.getElementById('modal-abatimento').classList.remove('hidden'); 
    document.getElementById('abatimento-valor').focus(); 
};

window.salvarAbatimento = async () => { 
    const n = document.getElementById('abatimento-cliente').value; 
    const v = parseFloat(document.getElementById('abatimento-valor').value); 
    const m = document.getElementById('abatimento-metodo').value; 
    if(!v || v<=0) return alert("Valor?"); 
    mostrarLoading(true); 
    try { 
        // 1. Adiciona o pagamento
        await addDoc(collection(db,COLECAO_VENDAS), { 
            cliente: n, 
            produtoNome: "PAGAMENTO DÍVIDA", 
            total: -v, 
            metodo: m, 
            pago: false, 
            qtd: 1, 
            data: Timestamp.now() 
        }); 

        // 2. Verifica se quitou tudo
        const q = query(collection(db, COLECAO_VENDAS), where("cliente", "==", n), where("pago", "==", false));
        const snap = await getDocs(q);
        
        let saldoDevedor = 0;
        const listaParaAtualizar = [];

        snap.forEach(doc => {
            saldoDevedor += doc.data().total;
            listaParaAtualizar.push(doc.ref);
        });

        // 3. Se saldo <= 0, marca tudo como pago
        if (saldoDevedor <= 0.01) {
            const batch = writeBatch(db);
            listaParaAtualizar.forEach(ref => {
                batch.update(ref, { pago: true });
            });
            await batch.commit();
            alert(`Pagamento registrado! Dívida de ${n} quitada.`);
        } else {
            alert(`Pagamento registrado. Restante: R$ ${saldoDevedor.toFixed(2)}`);
        }

        document.getElementById('modal-abatimento').classList.add('hidden'); 
        carregarDevedores(); 
    } catch(e) { 
        console.error(e); 
    } finally { 
        mostrarLoading(false); 
    } 
};

function configurarCheckboxes(m,c,b,cnt) { 
    const master = document.getElementById(m); 
    const checks = document.querySelectorAll('.'+c); 
    const bar = document.getElementById(b); 
    if(!master) return; 
    master.onclick = () => { 
        checks.forEach(k => k.checked = master.checked); 
        up(); 
    }; 
    checks.forEach(k => k.onclick = () => { 
        if(!k.checked) master.checked = false; 
        up(); 
    }); 
    function up() { 
        const n = document.querySelectorAll('.'+c+':checked').length; 
        if(n > 0) bar.classList.remove('hidden'); 
        else bar.classList.add('hidden'); 
    } 
}

// ============================================================
// 11. BACKUP E IMPORTAÇÃO
// ============================================================
window.exportarDadosBackup = async () => {
    mostrarLoading(true);
    try {
        const d = { produtos: [], clientes: [], vendas: [], categorias: [], gastos: [], bancos: [] };
        
        const [sp, sc, sct, sv, sg, sb] = await Promise.all([
            getDocs(collection(db, COLECAO_PRODUTOS)),
            getDocs(collection(db, COLECAO_CLIENTES)),
            getDocs(collection(db, COLECAO_CATEGORIAS)),
            getDocs(collection(db, COLECAO_VENDAS)),
            getDocs(collection(db, COLECAO_GASTOS)),
            getDocs(collection(db, COLECAO_BANCOS))
        ]);

        sp.forEach(x => d.produtos.push(x.data()));
        sc.forEach(x => d.clientes.push(x.data()));
        sct.forEach(x => d.categorias.push(x.data()));
        
        sv.forEach(x => {
            let v = x.data();
            if(v.data && v.data.seconds) v.data = v.data.toDate().toISOString();
            d.vendas.push(v);
        });
        
        sg.forEach(x => {
            let g = x.data();
            if(g.dataEntrada && g.dataEntrada.seconds) g.dataEntrada = g.dataEntrada.toDate().toISOString();
            d.gastos.push(g);
        });
        
        sb.forEach(x => d.bancos.push(x.data()));
        
        const b = new Blob([JSON.stringify(d)], { type: "application/json" });
        const u = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = u;
        a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch(e) {
        alert("Erro backup: " + e.message);
    } finally {
        mostrarLoading(false);
    }
};

window.importarDadosBackup = async (i) => {
    if(!i.files[0]) return;
    if(!confirm("Isso adicionará os dados ao banco atual. Continuar?")) return;
    
    const f = i.files[0];
    const r = new FileReader();
    
    r.onload = async (e) => {
        mostrarLoading(true);
        try {
            const d = JSON.parse(e.target.result);
            
            let batch = writeBatch(db);
            let count = 0;

            const commitBatch = async () => {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
            };

            if(d.produtos) {
                for(const x of d.produtos) {
                    if(x.criadoEm) x.criadoEm = Timestamp.fromDate(new Date(x.criadoEm));
                    batch.set(doc(collection(db, COLECAO_PRODUTOS)), x);
                    count++; if(count >= 400) await commitBatch();
                }
            }
            if(d.clientes) {
                for(const x of d.clientes) {
                    batch.set(doc(collection(db, COLECAO_CLIENTES)), x);
                    count++; if(count >= 400) await commitBatch();
                }
            }
            if(d.vendas) {
                for(const x of d.vendas) {
                    if(x.data) x.data = Timestamp.fromDate(new Date(x.data));
                    batch.set(doc(collection(db, COLECAO_VENDAS)), x);
                    count++; if(count >= 400) await commitBatch();
                }
            }
            if(d.categorias) {
                for(const x of d.categorias) {
                    batch.set(doc(collection(db, COLECAO_CATEGORIAS)), x);
                    count++; if(count >= 400) await commitBatch();
                }
            }
            if(d.gastos) {
                for(const x of d.gastos) {
                    if(x.dataEntrada) x.dataEntrada = Timestamp.fromDate(new Date(x.dataEntrada));
                    batch.set(doc(collection(db, COLECAO_GASTOS)), x);
                    count++; if(count >= 400) await commitBatch();
                }
            }
            if(d.bancos) {
                for(const x of d.bancos) {
                    batch.set(doc(collection(db, COLECAO_BANCOS)), x);
                    count++; if(count >= 400) await commitBatch();
                }
            }
            
            if(count > 0) await batch.commit();
            
            alert("Importação Concluída com Sucesso!");
            location.reload();
            
        } catch(er) {
            console.error(er);
            alert("Erro na importação: " + er.message);
        } finally {
            mostrarLoading(false);
        }
    };
    r.readAsText(f);
};
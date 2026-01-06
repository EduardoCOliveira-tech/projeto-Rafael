import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } 
       from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, limit, Timestamp, doc, updateDoc, deleteDoc, increment, getDoc, writeBatch } 
       from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// ⚠️ COLOQUE SUAS CHAVES AQUI
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
} catch (e) {
    console.error("Erro Firebase:", e);
    alert("ERRO CRÍTICO: Configure o app.js com suas chaves!");
}

let chartInstance = null;
let produtosCache = [];
let clientesCache = [];
const COLECAO_VENDAS = 'loja_vendas';
const COLECAO_PRODUTOS = 'loja_produtos';
const COLECAO_CATEGORIAS = 'loja_categorias_config';
const COLECAO_CLIENTES = 'loja_clientes';

document.addEventListener("DOMContentLoaded", () => {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    
    const elInicio = document.getElementById('data-inicio');
    const elFim = document.getElementById('data-fim');
    if(elInicio) elInicio.valueAsDate = inicio;
    if(elFim) elFim.valueAsDate = fim;

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
            if(chartInstance) chartInstance.update();
        };
    }

    const btnSidebar = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (btnSidebar && sidebar) {
        btnSidebar.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
});

// AUTENTICAÇÃO
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
        carregarDashboard()
    ]).catch(console.error);
}

// NAVEGAÇÃO
document.querySelectorAll('.menu li').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.menu li').forEach(li => li.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        item.classList.add('active');
        const target = item.getAttribute('data-target');
        document.getElementById(target).classList.add('active');
        
        const filtroArea = document.getElementById('area-filtros-data');
        if (filtroArea) {
            if (target === 'dashboard' || target === 'historico') filtroArea.style.display = 'flex';
            else filtroArea.style.display = 'none';
        }

        if(target === 'dashboard') carregarDashboard();
        if(target === 'devedores') carregarDevedores();
        if(target === 'estoque') carregarEstoque();
        if(target === 'historico') carregarHistorico();
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

// BACKUP
window.exportarDadosBackup = async () => {
    mostrarLoading(true);
    try {
        const dados = { produtos: [], clientes: [], vendas: [], categorias: [] };
        const snapProd = await getDocs(collection(db, COLECAO_PRODUTOS));
        snapProd.forEach(d => dados.produtos.push(d.data()));
        const snapCli = await getDocs(collection(db, COLECAO_CLIENTES));
        snapCli.forEach(d => dados.clientes.push(d.data()));
        const snapCat = await getDocs(collection(db, COLECAO_CATEGORIAS));
        snapCat.forEach(d => dados.categorias.push(d.data()));
        const snapVendas = await getDocs(collection(db, COLECAO_VENDAS));
        snapVendas.forEach(d => {
            let v = d.data();
            if(v.data && v.data.seconds) v.data = v.data.toDate().toISOString(); 
            dados.vendas.push(v);
        });
        const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `backup_nutriforte_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        alert("Backup baixado!");
    } catch (e) {
        console.error(e);
        alert("Erro: " + e.message);
    } finally {
        mostrarLoading(false);
    }
};

window.importarDadosBackup = async (input) => {
    if (!input.files || !input.files[0]) return;
    if (!confirm("Isso adicionará os dados. Continuar?")) { input.value = ""; return; }
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
        mostrarLoading(true);
        try {
            const dados = JSON.parse(e.target.result);
            const batch = writeBatch(db);
            let count = 0;
            const commitBatch = async () => { await batch.commit(); count = 0; };

            if(dados.produtos) {
                for (const p of dados.produtos) {
                    if(p.criadoEm && typeof p.criadoEm === 'string') p.criadoEm = Timestamp.fromDate(new Date(p.criadoEm));
                    const ref = doc(collection(db, COLECAO_PRODUTOS));
                    batch.set(ref, p);
                    count++; if(count >= 400) await commitBatch();
                }
            }
            if(dados.clientes) {
                for (const c of dados.clientes) {
                    const ref = doc(collection(db, COLECAO_CLIENTES));
                    batch.set(ref, c);
                    count++; if(count >= 400) await commitBatch();
                }
            }
            if(dados.categorias) {
                for (const cat of dados.categorias) {
                    const ref = doc(collection(db, COLECAO_CATEGORIAS));
                    batch.set(ref, cat);
                    count++; if(count >= 400) await commitBatch();
                }
            }
            if(dados.vendas) {
                for (const v of dados.vendas) {
                    if(v.data && typeof v.data === 'string') v.data = Timestamp.fromDate(new Date(v.data));
                    const ref = doc(collection(db, COLECAO_VENDAS));
                    batch.set(ref, v);
                    count++; if(count >= 400) await commitBatch();
                }
            }
            if(count > 0) await batch.commit();
            alert("Importado! Recarregando...");
            location.reload();
        } catch (erro) {
            console.error(erro);
            alert("Erro: " + erro.message);
        } finally {
            mostrarLoading(false);
            input.value = "";
        }
    };
    reader.readAsText(file);
};

// CLIENTES
document.getElementById('form-cliente')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    mostrarLoading(true);
    await addDoc(collection(db, COLECAO_CLIENTES), {
        nome: document.getElementById('cli-nome').value.toUpperCase(),
        tel: document.getElementById('cli-tel').value
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
        tbody.innerHTML += `<tr><td style="text-align:center"><input type="checkbox" class="cli-checkbox" value="${d.id}"></td><td>${c.nome}</td><td>${c.tel||'-'}</td><td><button onclick="window.abrirEditarCliente('${d.id}')" class="btn-icon btn-edit"><i class="fas fa-edit"></i></button><button onclick="window.excluirCliente('${d.id}')" class="btn-icon btn-delete"><i class="fas fa-trash"></i></button></td></tr>`;
        if(datalist) { const opt = document.createElement('option'); opt.value = c.nome; datalist.appendChild(opt); }
    });
    configurarCheckboxes('select-all-cli', 'cli-checkbox', 'bulk-actions-clientes', 'selected-count-cli');
}
window.filtrarClientes = () => { const t = document.getElementById('busca-clientes').value.toLowerCase(); document.querySelectorAll('#tabela-clientes tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(t)?'':'none'); };
window.excluirMassaClientes = async () => { const c = document.querySelectorAll('.cli-checkbox:checked'); if(!confirm(`Apagar ${c.length}?`)) return; mostrarLoading(true); for(const x of c) await deleteDoc(doc(db, COLECAO_CLIENTES, x.value)); mostrarLoading(false); carregarClientes(); };
window.excluirCliente = async (id) => { if(confirm("Apagar?")) await deleteDoc(doc(db, COLECAO_CLIENTES, id)); carregarClientes(); };
window.abrirEditarCliente = async (id) => { let c = clientesCache.find(x => x.id === id); if(!c){const s = await getDoc(doc(db, COLECAO_CLIENTES, id)); if(s.exists()) c = s.data();} if(c){ document.getElementById('edit-cli-id').value = id; document.getElementById('edit-cli-nome').value = c.nome; document.getElementById('edit-cli-tel').value = c.tel || ''; document.getElementById('modal-cliente-edit').classList.remove('hidden'); } };
window.salvarEdicaoCliente = async () => { const id = document.getElementById('edit-cli-id').value; mostrarLoading(true); await updateDoc(doc(db, COLECAO_CLIENTES, id), { nome: document.getElementById('edit-cli-nome').value.toUpperCase(), tel: document.getElementById('edit-cli-tel').value }); mostrarLoading(false); document.getElementById('modal-cliente-edit').classList.add('hidden'); carregarClientes(); };

// ESTOQUE
window.filtrarEstoque = () => { const t = document.getElementById('busca-estoque').value.toLowerCase(); document.querySelectorAll('#tabela-estoque tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(t)?'':'none'); };
document.getElementById('btn-add-cat')?.addEventListener('click', async () => { const n = prompt("Categoria:"); if(n) { const s=document.getElementById('prod-categoria'); let e=false; for(let i=0;i<s.options.length;i++)if(s.options[i].value===n.toUpperCase())e=true; if(!e){ await addDoc(collection(db, COLECAO_CATEGORIAS), { nome: n.toUpperCase() }); carregarCategorias(); } } });
document.getElementById('btn-del-cat')?.addEventListener('click', async () => { const s=document.getElementById('prod-categoria'); const n=s.value; if(!n)return alert("Selecione."); if(!confirm(`Excluir ${n}?`))return; mostrarLoading(true); const q=query(collection(db, COLECAO_CATEGORIAS), where("nome", "==", n)); const sn=await getDocs(q); sn.forEach(async d => await deleteDoc(doc(db, COLECAO_CATEGORIAS, d.id))); alert("Excluída!"); carregarCategorias(); mostrarLoading(false); });
async function carregarCategorias() { const s = document.getElementById('prod-categoria'); if(!s)return; s.innerHTML='<option value="">Selecione...</option>'; const sn = await getDocs(query(collection(db, COLECAO_CATEGORIAS), orderBy("nome"))); const c = new Set(); sn.forEach(d => { const n = d.data().nome; if(!c.has(n)){c.add(n); const o = document.createElement('option'); o.value = n; o.text = n; s.appendChild(o);} }); }
document.getElementById('form-produto')?.addEventListener('submit', async (e) => { e.preventDefault(); const n=document.getElementById('prod-nome').value.trim(); const c=document.getElementById('prod-categoria').value; const cu=parseFloat(document.getElementById('prod-custo').value); const v=parseFloat(document.getElementById('prod-venda').value); const q=parseInt(document.getElementById('prod-qtd').value); mostrarLoading(true); try { const qr = query(collection(db, COLECAO_PRODUTOS), where("nome", "==", n)); const sn = await getDocs(qr); if (!sn.empty) { const p = sn.docs[0]; await updateDoc(doc(db, COLECAO_PRODUTOS, p.id), { qtd: p.data().qtd + q, custo: cu, venda: v, categoria: c }); alert("Atualizado/Somado!"); } else { await addDoc(collection(db, COLECAO_PRODUTOS), { nome: n, categoria: c, custo: cu, venda: v, qtd: q, ativo: true, criadoEm: Timestamp.now() }); alert("Cadastrado!"); } document.getElementById('form-produto').reset(); carregarEstoque(); } catch (error) { console.error(error); alert("Erro."); } finally { mostrarLoading(false); } });
document.getElementById('prod-nome')?.addEventListener('input', function() { const v = this.value; const p = produtosCache.find(x => x.nome === v); if(p) { document.getElementById('prod-custo').value = p.custo; document.getElementById('prod-venda').value = p.venda; document.getElementById('prod-categoria').value = p.categoria; document.getElementById('prod-qtd').value = ""; document.getElementById('prod-qtd').focus(); } });
async function carregarEstoque() { const sn = await getDocs(query(collection(db, COLECAO_PRODUTOS), orderBy("nome"))); const tb = document.querySelector('#tabela-estoque tbody'); const dv = document.getElementById('list-produtos-venda'); const dbusca = document.getElementById('list-busca-estoque'); const dform = document.getElementById('list-sugestoes-produtos'); tb.innerHTML = ''; if(dv) dv.innerHTML = ''; if(dbusca) dbusca.innerHTML = ''; if(dform) dform.innerHTML = ''; produtosCache = []; document.getElementById('bulk-actions-estoque').classList.add('hidden'); document.getElementById('select-all-stock').checked = false; sn.forEach(d => { const p = d.data(); produtosCache.push({ id: d.id, ...p }); let h = `<tr><td style="text-align:center"><input type="checkbox" class="stock-checkbox" value="${d.id}"></td><td>${p.nome}</td><td><span class="badge" style="background:#e0e7ff; color:#3730a3">${p.categoria||'GER'}</span></td><td>R$ ${p.custo.toFixed(2)}</td><td>R$ ${p.venda.toFixed(2)}</td><td>${p.qtd}</td><td><button onclick="window.abrirEditarProduto('${d.id}')" class="btn-icon btn-edit"><i class="fas fa-edit"></i></button><button onclick="window.excluirProduto('${d.id}')" class="btn-icon btn-delete"><i class="fas fa-trash"></i></button></td></tr>`; tb.insertAdjacentHTML('beforeend', h); const o = document.createElement('option'); o.value = p.nome; if(dbusca) dbusca.appendChild(o.cloneNode(true)); if(dform) dform.appendChild(o.cloneNode(true)); if(dv && p.qtd > 0) dv.appendChild(o); }); configurarCheckboxes('select-all-stock', 'stock-checkbox', 'bulk-actions-estoque', 'selected-count-stock'); }
window.excluirMassaEstoque = async () => { const c = document.querySelectorAll('.stock-checkbox:checked'); if(!confirm(`Apagar ${c.length}?`)) return; mostrarLoading(true); for(const x of c) await deleteDoc(doc(db, COLECAO_PRODUTOS, x.value)); mostrarLoading(false); carregarEstoque(); };
window.excluirProduto = async (id) => { if(confirm("Apagar?")) await deleteDoc(doc(db, COLECAO_PRODUTOS, id)); carregarEstoque(); };
window.abrirEditarProduto = async (id) => { const p = produtosCache.find(x => x.id === id); if(p) { document.getElementById('edit-prod-id').value = id; document.getElementById('edit-prod-nome').value = p.nome; document.getElementById('edit-prod-custo').value = p.custo; document.getElementById('edit-prod-venda').value = p.venda; document.getElementById('edit-prod-qtd').value = p.qtd; document.getElementById('modal-prod').classList.remove('hidden'); } };
window.salvarEdicaoProduto = async () => { const id = document.getElementById('edit-prod-id').value; mostrarLoading(true); await updateDoc(doc(db, COLECAO_PRODUTOS, id), { nome: document.getElementById('edit-prod-nome').value, custo: parseFloat(document.getElementById('edit-prod-custo').value), venda: parseFloat(document.getElementById('edit-prod-venda').value), qtd: parseInt(document.getElementById('edit-prod-qtd').value) }); mostrarLoading(false); document.getElementById('modal-prod').classList.add('hidden'); carregarEstoque(); };

// VENDAS
function attTotal() { const n = document.getElementById('venda-produto').value; const q = document.getElementById('venda-qtd').value; const p = produtosCache.find(x => x.nome === n); if(p) { const u = p.venda; document.getElementById('venda-valor-unit').value = u.toFixed(2); if(document.activeElement !== document.getElementById('venda-valor-total')) document.getElementById('venda-valor-total').value = (u * q).toFixed(2); } else { document.getElementById('venda-valor-unit').value = ""; } }
document.getElementById('venda-produto')?.addEventListener('input', attTotal); document.getElementById('venda-qtd')?.addEventListener('input', attTotal);
document.getElementById('form-venda')?.addEventListener('submit', async (e) => { e.preventDefault(); const n = document.getElementById('venda-produto').value; const q = parseInt(document.getElementById('venda-qtd').value); const m = document.getElementById('venda-metodo').value; const c = document.getElementById('venda-cliente').value; const t = parseFloat(document.getElementById('venda-valor-total').value); const p = produtosCache.find(x => x.nome === n); if (!p) return alert("Produto não encontrado!"); if(m === 'aver' && (!c || c === 'Consumidor Final')) return alert("Fiado precisa de cliente!"); mostrarLoading(true); await addDoc(collection(db, COLECAO_VENDAS), { produtoId: p.id, produtoNome: p.nome, qtd: q, total: t, custo: p.custo * q, metodo: m, cliente: c, pago: m !== 'aver', data: Timestamp.now() }); await updateDoc(doc(db, COLECAO_PRODUTOS, p.id), { qtd: increment(-q) }); mostrarLoading(false); alert("Venda realizada!"); document.getElementById('form-venda').reset(); document.getElementById('venda-produto').focus(); carregarEstoque(); });

// HISTORICO
window.carregarHistorico = async () => { 
    const tb = document.querySelector('#tabela-historico tbody'); 
    tb.innerHTML = '<tr><td colspan="9">Carregando...</td></tr>'; 
    const i = new Date(document.getElementById('data-inicio').value + 'T00:00:00'); 
    const f = new Date(document.getElementById('data-fim').value + 'T23:59:59'); 
    const q = query(collection(db, COLECAO_VENDAS), where("data", ">=", Timestamp.fromDate(i)), where("data", "<=", Timestamp.fromDate(f)), orderBy("data", "desc"), limit(100)); 
    const snap = await getDocs(q); 
    let h = ''; 
    snap.forEach(d => { 
        const v = d.data(); 
        let pg = v.metodo; 
        if(pg==='aver') pg='Fiado'; 
        if(pg==='dinheiro') pg='Dinheiro'; 
        if(pg==='pix') pg='Pix'; 
        if(pg==='credito') pg='Crédito'; 
        if(pg==='debito') pg='Débito'; 
        
        let badgeClass = v.pago ? 'badge-success' : 'badge-warning';
        let statusText = v.pago ? 'PAGO' : 'PENDENTE';
        let rowClass = '';

        // Se for um abatimento (valor negativo e "pago: false" para abater dívida)
        if (v.total < 0 && !v.pago) {
            badgeClass = 'badge-success'; // Verde para indicar bom sinal
            statusText = 'PAGAMENTO DÍVIDA';
            rowClass = 'style="background-color: #f0fdf4;"'; // Fundo verde claro suave
        }

        h += `<tr ${rowClass}>
            <td style="text-align:center"><input type="checkbox" class="sale-checkbox" value="${d.id}" data-pid="${v.produtoId}" data-qtd="${v.qtd}"></td>
            <td>${v.data?.toDate?v.data.toDate().toLocaleDateString('pt-BR'):'-'}</td>
            <td>${v.cliente}</td>
            <td>${v.produtoNome}</td>
            <td>${v.qtd||1}</td>
            <td style="${v.total < 0 ? 'color:green; font-weight:bold' : ''}">R$ ${Math.abs(v.total).toFixed(2)} ${v.total < 0 ? '(Abatido)' : ''}</td>
            <td>${pg}</td>
            <td><span class="badge ${badgeClass}">${statusText}</span></td>
            <td><button onclick="window.abrirEdicao('${d.id}','${v.total}','${v.metodo}')" class="btn-icon btn-edit"><i class="fas fa-edit"></i></button></td>
        </tr>`; 
    }); 
    tb.innerHTML = h || '<tr><td colspan="9">Nada encontrado.</td></tr>'; 
    configurarCheckboxes('select-all', 'sale-checkbox', 'bulk-actions', 'selected-count'); 
};
window.filtrarHistorico = () => { const t = document.getElementById('busca-historico').value.toLowerCase(); document.querySelectorAll('#tabela-historico tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(t) ? '' : 'none'); };
window.excluirMassa = async () => { const c = document.querySelectorAll('.sale-checkbox:checked'); if(!confirm(`Apagar ${c.length}?`)) return; mostrarLoading(true); for(const x of c) { try { await deleteDoc(doc(db, COLECAO_VENDAS, x.value)); const pid = x.dataset.pid; const q = parseInt(x.dataset.qtd); if(pid && pid.length > 10 && !isNaN(q)) await updateDoc(doc(db, COLECAO_PRODUTOS, pid), { qtd: increment(q) }); } catch(e) {} } mostrarLoading(false); carregarHistorico(); };
window.abrirEdicao = (id, v, m) => { document.getElementById('edit-id').value = id; document.getElementById('edit-valor').value = v; document.getElementById('edit-metodo').value = m; document.getElementById('modal-editar').classList.remove('hidden'); };
window.fecharModalEdicao = () => document.getElementById('modal-editar').classList.add('hidden');
window.salvarEdicaoVenda = async () => { const id = document.getElementById('edit-id').value; const m = document.getElementById('edit-metodo').value; await updateDoc(doc(db, COLECAO_VENDAS, id), { total: parseFloat(document.getElementById('edit-valor').value), metodo: m, pago: m !== 'aver' }); window.fecharModalEdicao(); carregarHistorico(); };

// DEVEDORES (COM ABATIMENTO)
async function carregarDevedores() { 
    const tb = document.querySelector('#tabela-devedores tbody'); 
    tb.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>'; 
    const sn = await getDocs(query(collection(db, COLECAO_VENDAS), where("pago", "==", false))); 
    const dv = {}; 
    sn.forEach(d => { 
        const v = d.data(); 
        if(!dv[v.cliente]) dv[v.cliente] = 0; 
        dv[v.cliente] += v.total; // Soma (vendas) e subtrai (abatimentos negativos) automaticamente
    }); 
    let h = ''; 
    Object.keys(dv).sort().forEach(n => { 
        if(dv[n] > 0.01) { // Só mostra quem deve mais que 1 centavo
            h += `<tr>
                <td style="text-align:center"><input type="checkbox" class="dev-checkbox" value="${n}"></td>
                <td>${n}</td>
                <td style="color:var(--danger)">R$ ${dv[n].toFixed(2)}</td>
                <td>
                    <button onclick="window.verDetalhesDevedor('${n}')" class="btn-primary" style="font-size:0.8rem; margin-right:5px">Ver</button>
                    <button onclick="window.abrirModalAbatimento('${n}')" class="btn-success" style="font-size:0.8rem; padding: 8px 12px;"><i class="fas fa-hand-holding-usd"></i> Pagar</button>
                </td>
            </tr>`; 
        }
    }); 
    tb.innerHTML = h || '<tr><td colspan="5">Ninguém deve nada!</td></tr>'; 
    configurarCheckboxes('select-all-dev', 'dev-checkbox', 'bulk-actions-devedores', 'selected-count-dev'); 
}

// FUNÇÕES DE ABATIMENTO
window.abrirModalAbatimento = (nome) => {
    document.getElementById('abatimento-cliente').value = nome;
    document.getElementById('abatimento-cliente-nome').innerText = nome;
    document.getElementById('abatimento-valor').value = '';
    document.getElementById('modal-abatimento').classList.remove('hidden');
    document.getElementById('abatimento-valor').focus();
};

window.salvarAbatimento = async () => {
    const nome = document.getElementById('abatimento-cliente').value;
    const valor = parseFloat(document.getElementById('abatimento-valor').value);
    const metodo = document.getElementById('abatimento-metodo').value;

    if (!valor || valor <= 0) return alert("Digite um valor válido para pagar.");

    mostrarLoading(true);
    try {
        await addDoc(collection(db, COLECAO_VENDAS), {
            cliente: nome,
            produtoNome: "PAGAMENTO DÍVIDA",
            total: -valor, // Valor negativo para subtrair da dívida
            metodo: metodo,
            pago: false, // Mantém false para entrar na conta do devedor (reduzindo o total)
            qtd: 1,
            data: Timestamp.now()
        });
        alert(`Pagamento de R$ ${valor.toFixed(2)} registrado para ${nome}!`);
        document.getElementById('modal-abatimento').classList.add('hidden');
        carregarDevedores(); // Recarrega para ver a dívida diminuir
    } catch (e) {
        console.error(e);
        alert("Erro ao salvar pagamento.");
    } finally {
        mostrarLoading(false);
    }
};

window.filtrarDevedores = () => { const t = document.getElementById('busca-devedores').value.toLowerCase(); document.querySelectorAll('#tabela-devedores tbody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(t) ? '' : 'none'); };
window.excluirMassaDevedores = async () => { const c = document.querySelectorAll('.dev-checkbox:checked'); if(!confirm(`Perdoar ${c.length} clientes?`)) return; mostrarLoading(true); for(const x of c) { const n = x.value; const sn = await getDocs(query(collection(db, COLECAO_VENDAS), where("cliente", "==", n), where("pago", "==", false))); sn.forEach(async d => await deleteDoc(doc(db, COLECAO_VENDAS, d.id))); } mostrarLoading(false); alert("Feito!"); carregarDevedores(); };
window.verDetalhesDevedor = async (n) => { 
    const m = document.getElementById('modal-devedor'); 
    const tb = document.querySelector('#tabela-detalhes-devedor tbody'); 
    tb.innerHTML = '<tr><td>...</td></tr>'; 
    m.classList.remove('hidden'); 
    document.getElementById('titulo-devedor').innerText = `Extrato: ${n}`; 
    const sn = await getDocs(query(collection(db, COLECAO_VENDAS), where("cliente", "==", n), where("pago", "==", false))); 
    let vs = []; 
    sn.forEach(d => vs.push(d.data())); 
    vs.sort((a, b) => b.data.seconds - a.data.seconds); 
    let h = ''; 
    let t = 0; 
    vs.forEach(v => { 
        t += v.total; 
        const isPagamento = v.total < 0;
        h += `<tr style="${isPagamento ? 'background:#f0fdf4' : ''}">
            <td>${v.data?.toDate ? v.data.toDate().toLocaleDateString('pt-BR') : '-'}</td>
            <td>${v.produtoNome}</td>
            <td style="${isPagamento ? 'color:green;font-weight:bold' : ''}">R$ ${Math.abs(v.total).toFixed(2)} ${isPagamento ? '(PAGTO)' : ''}</td>
        </tr>`; 
    }); 
    tb.innerHTML = h; 
    document.getElementById('total-divida-modal').innerText = `R$ ${t.toFixed(2)}`; 
};

// DASHBOARD
async function carregarDashboard() { const i = new Date(document.getElementById('data-inicio').value + 'T00:00:00'); const f = new Date(document.getElementById('data-fim').value + 'T23:59:59'); const q = query(collection(db, COLECAO_VENDAS), where("data", ">=", Timestamp.fromDate(i)), where("data", "<=", Timestamp.fromDate(f))); const sn = await getDocs(q); let fat = 0, fiado = 0, custo = 0; sn.forEach(d => { const v = d.data(); fat += v.total; custo += (v.custo || 0); if(!v.pago) fiado += v.total; }); document.getElementById('kpi-faturamento').innerText = `R$ ${fat.toFixed(2)}`; document.getElementById('kpi-fiado').innerText = `R$ ${fiado.toFixed(2)}`; document.getElementById('kpi-lucro').innerText = `R$ ${(fat - custo).toFixed(2)}`; renderChart([fat]); }
function renderChart(d) { const ctx = document.getElementById('mainChart'); if(!ctx) return; if(chartInstance) chartInstance.destroy(); chartInstance = new Chart(ctx.getContext('2d'), { type: 'bar', data: { labels: ['Total Período'], datasets: [{ label: 'Vendas', data: d, backgroundColor: '#4F46E5' }] }, options: { responsive: true, maintainAspectRatio: false } }); }
function configurarCheckboxes(m, c, b, cnt) { const master = document.getElementById(m); const checks = document.querySelectorAll('.' + c); const bar = document.getElementById(b); const count = document.getElementById(cnt); if(!master) return; master.onclick = () => { checks.forEach(k => k.checked = master.checked); up(); }; checks.forEach(k => k.onclick = () => { if(!k.checked) master.checked = false; up(); }); function up() { const n = document.querySelectorAll('.' + c + ':checked').length; if(n > 0) { bar.classList.remove('hidden'); if(count) count.innerText = n + ' sel.'; } else { bar.classList.add('hidden'); } } }
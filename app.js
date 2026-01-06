import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } 
       from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, limit, Timestamp, doc, updateDoc, deleteDoc, increment, getDoc, writeBatch } 
       from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// ============================================================
// 1. CONFIGURAÇÃO FIREBASE
// ============================================================
// ⚠️ COLOQUE SUAS CHAVES AQUI ⚠️
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
    alert("ERRO CRÍTICO: Configure o app.js com suas chaves do Firebase!");
}

// ============================================================
// 2. GLOBAIS E CONSTANTES
// ============================================================
let chartInstance = null;
let produtosCache = [];
let clientesCache = [];

const COLECAO_VENDAS = 'loja_vendas';
const COLECAO_PRODUTOS = 'loja_produtos';
const COLECAO_CATEGORIAS = 'loja_categorias_config';
const COLECAO_CLIENTES = 'loja_clientes';

// ============================================================
// 3. INICIALIZAÇÃO
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    // Define datas padrão (Mês atual)
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    
    const elInicio = document.getElementById('data-inicio');
    const elFim = document.getElementById('data-fim');
    if(elInicio) elInicio.valueAsDate = inicio;
    if(elFim) elFim.valueAsDate = fim;

    // Configura Dark Mode
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
});

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
    // Carrega tudo em paralelo para ser mais rápido
    Promise.all([
        carregarCategorias(),
        carregarEstoque(),
        carregarClientes(),
        carregarDashboard()
    ]).catch(console.error);
}

// ============================================================
// 5. NAVEGAÇÃO E UX
// ============================================================
document.querySelectorAll('.menu li').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.menu li').forEach(li => li.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        item.classList.add('active');
        const target = item.getAttribute('data-target');
        document.getElementById(target).classList.add('active');
        
        // Controle do filtro de data (só aparece onde precisa)
        const filtroArea = document.getElementById('area-filtros-data');
        if (filtroArea) {
            if (target === 'dashboard' || target === 'historico') filtroArea.style.display = 'flex';
            else filtroArea.style.display = 'none';
        }

        // Recarrega dados ao entrar na aba
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

// ============================================================
// 6. BACKUP (IMPORTAR E EXPORTAR)
// ============================================================

// EXPORTAR (Baixar JSON)
window.exportarDadosBackup = async () => {
    mostrarLoading(true);
    try {
        const dados = { produtos: [], clientes: [], vendas: [], categorias: [] };

        // Coleta dados de todas as coleções
        const snapProd = await getDocs(collection(db, COLECAO_PRODUTOS));
        snapProd.forEach(d => dados.produtos.push(d.data()));

        const snapCli = await getDocs(collection(db, COLECAO_CLIENTES));
        snapCli.forEach(d => dados.clientes.push(d.data()));

        const snapCat = await getDocs(collection(db, COLECAO_CATEGORIAS));
        snapCat.forEach(d => dados.categorias.push(d.data()));

        const snapVendas = await getDocs(collection(db, COLECAO_VENDAS));
        snapVendas.forEach(d => {
            let v = d.data();
            // Converte data para texto para salvar no arquivo
            if(v.data && v.data.seconds) v.data = v.data.toDate().toISOString(); 
            dados.vendas.push(v);
        });

        // Gera arquivo para download
        const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `backup_nutriforte_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        alert("Backup baixado com sucesso!");
    } catch (e) {
        console.error(e);
        alert("Erro ao exportar: " + e.message);
    } finally {
        mostrarLoading(false);
    }
};

// IMPORTAR (Ler JSON)
window.importarDadosBackup = async (input) => {
    if (!input.files || !input.files[0]) return;
    if (!confirm("Isso adicionará os dados do arquivo ao sistema atual. Continuar?")) {
        input.value = ""; 
        return;
    }

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        mostrarLoading(true);
        try {
            const dados = JSON.parse(e.target.result);
            const batch = writeBatch(db); // Gravação em lote (mais rápida)
            let count = 0;

            // Função para salvar lote se ficar cheio
            const commitBatch = async () => { await batch.commit(); count = 0; };

            // Processa Produtos
            if(dados.produtos) {
                for (const p of dados.produtos) {
                    if(p.criadoEm && typeof p.criadoEm === 'string') p.criadoEm = Timestamp.fromDate(new Date(p.criadoEm));
                    const ref = doc(collection(db, COLECAO_PRODUTOS));
                    batch.set(ref, p);
                    count++; if(count >= 400) await commitBatch();
                }
            }
            // Processa Clientes
            if(dados.clientes) {
                for (const c of dados.clientes) {
                    const ref = doc(collection(db, COLECAO_CLIENTES));
                    batch.set(ref, c);
                    count++; if(count >= 400) await commitBatch();
                }
            }
            // Processa Categorias
            if(dados.categorias) {
                for (const cat of dados.categorias) {
                    const ref = doc(collection(db, COLECAO_CATEGORIAS));
                    batch.set(ref, cat);
                    count++; if(count >= 400) await commitBatch();
                }
            }
            // Processa Vendas
            if(dados.vendas) {
                for (const v of dados.vendas) {
                    if(v.data && typeof v.data === 'string') v.data = Timestamp.fromDate(new Date(v.data));
                    const ref = doc(collection(db, COLECAO_VENDAS));
                    batch.set(ref, v);
                    count++; if(count >= 400) await commitBatch();
                }
            }

            if(count > 0) await batch.commit(); // Salva o resto

            alert("Importação concluída! A página será recarregada.");
            location.reload();

        } catch (erro) {
            console.error(erro);
            alert("Erro ao importar: " + erro.message);
        } finally {
            mostrarLoading(false);
            input.value = "";
        }
    };
    reader.readAsText(file);
};

// ============================================================
// 7. MÓDULO: CLIENTES
// ============================================================
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
    alert("Cliente Salvo!");
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

window.filtrarClientes = () => {
    const termo = document.getElementById('busca-clientes').value.toLowerCase();
    document.querySelectorAll('#tabela-clientes tbody tr').forEach(tr => {
        tr.style.display = tr.innerText.toLowerCase().includes(termo) ? '' : 'none';
    });
};

window.excluirMassaClientes = async () => {
    const checks = document.querySelectorAll('.cli-checkbox:checked');
    if(!confirm(`Excluir ${checks.length} clientes?`)) return;
    mostrarLoading(true);
    for(const c of checks) { try { await deleteDoc(doc(db, COLECAO_CLIENTES, c.value)); } catch(e) {} }
    mostrarLoading(false);
    carregarClientes();
};

window.excluirCliente = async (id) => {
    if(confirm("Excluir cliente?")) { await deleteDoc(doc(db, COLECAO_CLIENTES, id)); carregarClientes(); }
};

window.abrirEditarCliente = async (id) => {
    let c = clientesCache.find(x => x.id === id);
    if (!c) {
        const snap = await getDoc(doc(db, COLECAO_CLIENTES, id));
        if(snap.exists()) c = snap.data();
    }
    if(c) {
        document.getElementById('edit-cli-id').value = id;
        document.getElementById('edit-cli-nome').value = c.nome;
        document.getElementById('edit-cli-tel').value = c.tel || '';
        document.getElementById('modal-cliente-edit').classList.remove('hidden');
    }
};

window.salvarEdicaoCliente = async () => {
    const id = document.getElementById('edit-cli-id').value;
    mostrarLoading(true);
    await updateDoc(doc(db, COLECAO_CLIENTES, id), {
        nome: document.getElementById('edit-cli-nome').value.toUpperCase(),
        tel: document.getElementById('edit-cli-tel').value
    });
    mostrarLoading(false);
    document.getElementById('modal-cliente-edit').classList.add('hidden');
    carregarClientes();
};

// ============================================================
// 8. MÓDULO: ESTOQUE E CATEGORIAS
// ============================================================
window.filtrarEstoque = () => {
    const termo = document.getElementById('busca-estoque').value.toLowerCase();
    document.querySelectorAll('#tabela-estoque tbody tr').forEach(tr => {
        tr.style.display = tr.innerText.toLowerCase().includes(termo) ? '' : 'none';
    });
};

// Adicionar Categoria
document.getElementById('btn-add-cat')?.addEventListener('click', async () => {
    const nova = prompt("Nome da Categoria:");
    if(nova) { 
        const sel = document.getElementById('prod-categoria');
        let existe = false;
        for (let i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === nova.toUpperCase()) existe = true;
        }
        if(!existe) {
            await addDoc(collection(db, COLECAO_CATEGORIAS), { nome: nova.toUpperCase() }); 
            carregarCategorias();
        }
    }
});

// Excluir Categoria Selecionada
document.getElementById('btn-del-cat')?.addEventListener('click', async () => {
    const sel = document.getElementById('prod-categoria');
    const nomeCategoria = sel.value;

    if (!nomeCategoria) return alert("Selecione uma categoria para excluir.");
    if (!confirm(`Tem certeza que deseja excluir a categoria "${nomeCategoria}"?`)) return;

    mostrarLoading(true);
    try {
        const q = query(collection(db, COLECAO_CATEGORIAS), where("nome", "==", nomeCategoria));
        const snap = await getDocs(q);
        snap.forEach(async (d) => await deleteDoc(doc(db, COLECAO_CATEGORIAS, d.id)));
        alert("Categoria removida!");
        carregarCategorias();
    } catch (e) {
        console.error(e);
        alert("Erro ao excluir.");
    } finally {
        mostrarLoading(false);
    }
});

async function carregarCategorias() {
    const sel = document.getElementById('prod-categoria');
    if(!sel) return;
    sel.innerHTML = '<option value="">Selecione...</option>';
    const snap = await getDocs(query(collection(db, COLECAO_CATEGORIAS), orderBy("nome")));
    const cats = new Set();
    snap.forEach(d => {
        const nome = d.data().nome;
        if(!cats.has(nome)) {
            cats.add(nome);
            const opt = document.createElement('option');
            opt.value = nome;
            opt.text = nome;
            sel.appendChild(opt);
        }
    });
}

// Salvar Produto (Com lógica de somar estoque se já existir)
document.getElementById('form-produto')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nomeInput = document.getElementById('prod-nome').value.trim();
    const categoria = document.getElementById('prod-categoria').value;
    const custo = parseFloat(document.getElementById('prod-custo').value);
    const venda = parseFloat(document.getElementById('prod-venda').value);
    const qtdDigitada = parseInt(document.getElementById('prod-qtd').value);

    mostrarLoading(true);
    try {
        const q = query(collection(db, COLECAO_PRODUTOS), where("nome", "==", nomeInput));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const produtoExistente = querySnapshot.docs[0];
            const dadosAtuais = produtoExistente.data();
            const novaQtdTotal = dadosAtuais.qtd + qtdDigitada;
            await updateDoc(doc(db, COLECAO_PRODUTOS, produtoExistente.id), {
                qtd: novaQtdTotal, custo: custo, venda: venda, categoria: categoria
            });
            alert(`Produto atualizado! Estoque somado para: ${novaQtdTotal}`);
        } else {
            await addDoc(collection(db, COLECAO_PRODUTOS), {
                nome: nomeInput, categoria, custo, venda, qtd: qtdDigitada, ativo: true, criadoEm: Timestamp.now()
            });
            alert("Novo produto cadastrado!");
        }
        document.getElementById('form-produto').reset();
        carregarEstoque();
    } catch (error) { console.error(error); alert("Erro ao salvar."); } finally { mostrarLoading(false); }
});

// Autocomplete no formulário de produto
document.getElementById('prod-nome')?.addEventListener('input', function() {
    const nomeDigitado = this.value;
    const produto = produtosCache.find(p => p.nome === nomeDigitado);
    if(produto) {
        document.getElementById('prod-custo').value = produto.custo;
        document.getElementById('prod-venda').value = produto.venda;
        document.getElementById('prod-categoria').value = produto.categoria;
        document.getElementById('prod-qtd').value = ""; // Limpa para digitar a entrada
        document.getElementById('prod-qtd').focus();
    }
});

async function carregarEstoque() {
    const snap = await getDocs(query(collection(db, COLECAO_PRODUTOS), orderBy("nome")));
    const tbody = document.querySelector('#tabela-estoque tbody');
    const datalistVenda = document.getElementById('list-produtos-venda');
    const datalistBusca = document.getElementById('list-busca-estoque');
    const datalistForm = document.getElementById('list-sugestoes-produtos');
    
    tbody.innerHTML = '';
    if(datalistVenda) datalistVenda.innerHTML = '';
    if(datalistBusca) datalistBusca.innerHTML = ''; 
    if(datalistForm) datalistForm.innerHTML = '';
    
    produtosCache = [];
    document.getElementById('bulk-actions-estoque').classList.add('hidden');
    document.getElementById('select-all-stock').checked = false;

    snap.forEach(d => {
        const p = d.data();
        produtosCache.push({ id: d.id, ...p }); 

        let rowHtml = `<tr>
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
        tbody.insertAdjacentHTML('beforeend', rowHtml);

        const opt = document.createElement('option');
        opt.value = p.nome;
        
        if(datalistBusca) datalistBusca.appendChild(opt.cloneNode(true));
        if(datalistForm) datalistForm.appendChild(opt.cloneNode(true));
        if(datalistVenda && p.qtd > 0) datalistVenda.appendChild(opt);
    });
    configurarCheckboxes('select-all-stock', 'stock-checkbox', 'bulk-actions-estoque', 'selected-count-stock');
}

window.excluirMassaEstoque = async () => {
    const checks = document.querySelectorAll('.stock-checkbox:checked');
    if(!confirm(`Apagar ${checks.length} produtos?`)) return;
    mostrarLoading(true);
    for(const c of checks) { try { await deleteDoc(doc(db, COLECAO_PRODUTOS, c.value)); } catch(e) {} }
    mostrarLoading(false);
    carregarEstoque();
};

window.excluirProduto = async (id) => {
    if(confirm("Excluir este produto?")) { await deleteDoc(doc(db, COLECAO_PRODUTOS, id)); carregarEstoque(); }
};

window.abrirEditarProduto = async (id) => {
    const p = produtosCache.find(p => p.id === id); 
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

// ============================================================
// 9. MÓDULO: VENDAS
// ============================================================
function attTotal() {
    const inputNome = document.getElementById('venda-produto').value;
    const qtd = document.getElementById('venda-qtd').value;
    const produtoEncontrado = produtosCache.find(p => p.nome === inputNome);

    if(produtoEncontrado) {
        const unit = produtoEncontrado.venda;
        document.getElementById('venda-valor-unit').value = unit.toFixed(2);
        if(document.activeElement !== document.getElementById('venda-valor-total')) {
            document.getElementById('venda-valor-total').value = (unit * qtd).toFixed(2);
        }
    } else {
        document.getElementById('venda-valor-unit').value = "";
    }
}
document.getElementById('venda-produto')?.addEventListener('input', attTotal);
document.getElementById('venda-qtd')?.addEventListener('input', attTotal);

document.getElementById('form-venda')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nomeProd = document.getElementById('venda-produto').value;
    const qtd = parseInt(document.getElementById('venda-qtd').value);
    const metodo = document.getElementById('venda-metodo').value;
    const cliente = document.getElementById('venda-cliente').value;
    const total = parseFloat(document.getElementById('venda-valor-total').value);

    const produto = produtosCache.find(p => p.nome === nomeProd);
    if (!produto) return alert("Produto não encontrado no estoque!");
    if(metodo === 'aver' && (!cliente || cliente === 'Consumidor Final')) return alert("Para vender Fiado, digite o nome do cliente!");

    mostrarLoading(true);
    await addDoc(collection(db, COLECAO_VENDAS), {
        produtoId: produto.id,
        produtoNome: produto.nome,
        qtd, total,
        custo: produto.custo * qtd,
        metodo, cliente,
        pago: metodo !== 'aver',
        data: Timestamp.now()
    });
    await updateDoc(doc(db, COLECAO_PRODUTOS, produto.id), { qtd: increment(-qtd) });
    
    mostrarLoading(false);
    alert("Venda realizada!");
    document.getElementById('form-venda').reset();
    document.getElementById('venda-produto').focus(); 
    carregarEstoque();
});

// ============================================================
// 10. MÓDULO: HISTÓRICO
// ============================================================
window.carregarHistorico = async () => {
    const tbody = document.querySelector('#tabela-historico tbody');
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center">Carregando...</td></tr>';
    document.getElementById('bulk-actions').classList.add('hidden');
    document.getElementById('select-all').checked = false;

    const inicioInput = document.getElementById('data-inicio').value;
    const fimInput = document.getElementById('data-fim').value;
    const inicio = new Date(inicioInput + 'T00:00:00');
    const fim = new Date(fimInput + 'T23:59:59');

    // Usa ordenação do Firestore (se falhar, precisar criar índice no console)
    const q = query(collection(db, COLECAO_VENDAS), where("data", ">=", Timestamp.fromDate(inicio)), where("data", "<=", Timestamp.fromDate(fim)), orderBy("data", "desc"), limit(100));
    const snap = await getDocs(q);
    
    let html = '';
    snap.forEach(d => {
        const v = d.data();
        const data = v.data?.toDate ? v.data.toDate().toLocaleDateString('pt-BR') : '-';
        const badge = v.pago ? 'badge-success' : 'badge-warning';
        const st = v.pago ? 'PAGO' : 'PENDENTE';
        
        let pg = v.metodo;
        if(v.metodo === 'aver') pg = 'Fiado';
        if(v.metodo === 'dinheiro') pg = 'Dinheiro';
        if(v.metodo === 'credito') pg = 'Crédito';
        if(v.metodo === 'debito') pg = 'Débito';
        if(v.metodo === 'pix') pg = 'Pix';

        html += `<tr>
            <td style="text-align:center"><input type="checkbox" class="sale-checkbox" value="${d.id}" data-pid="${v.produtoId}" data-qtd="${v.qtd}"></td>
            <td>${data}</td>
            <td>${v.cliente}</td>
            <td>${v.produtoNome}</td>
            <td>${v.qtd || 1}</td>
            <td>R$ ${v.total.toFixed(2)}</td>
            <td>${pg}</td>
            <td><span class="badge ${badge}">${st}</span></td>
            <td><button onclick="window.abrirEdicao('${d.id}','${v.total}','${v.metodo}')" class="btn-icon btn-edit"><i class="fas fa-edit"></i></button></td>
        </tr>`;
    });
    tbody.innerHTML = html || '<tr><td colspan="9" style="text-align:center">Nenhuma venda encontrada.</td></tr>';
    configurarCheckboxes('select-all', 'sale-checkbox', 'bulk-actions', 'selected-count');
};

window.filtrarHistorico = () => {
    const termo = document.getElementById('busca-historico').value.toLowerCase();
    document.querySelectorAll('#tabela-historico tbody tr').forEach(tr => {
        tr.style.display = tr.innerText.toLowerCase().includes(termo) ? '' : 'none';
    });
};

function configurarCheckboxes(masterId, checkClass, bulkBarId, countId) {
    const master = document.getElementById(masterId);
    const checks = document.querySelectorAll(`.${checkClass}`);
    const bar = document.getElementById(bulkBarId);
    const count = document.getElementById(countId);
    if(!master) return;
    master.onclick = () => { checks.forEach(c => c.checked = master.checked); updateBar(); };
    checks.forEach(c => c.onclick = () => { if(!c.checked) master.checked = false; updateBar(); });
    function updateBar() {
        const n = document.querySelectorAll(`.${checkClass}:checked`).length;
        if(n > 0) { bar.classList.remove('hidden'); count.innerText = `${n} selecionado(s)`; } else { bar.classList.add('hidden'); }
    }
}

window.excluirMassa = async () => {
    const checks = document.querySelectorAll('.sale-checkbox:checked');
    if(!confirm(`Excluir ${checks.length} vendas?`)) return;
    mostrarLoading(true);
    for(const c of checks) {
        try {
            await deleteDoc(doc(db, COLECAO_VENDAS, c.value));
            const pid = c.dataset.pid;
            const qtd = parseInt(c.dataset.qtd);
            if(pid && pid.length > 10 && !isNaN(qtd)) { await updateDoc(doc(db, COLECAO_PRODUTOS, pid), { qtd: increment(qtd) }); }
        } catch(e) { console.error(e); }
    }
    mostrarLoading(false);
    carregarHistorico();
};

window.abrirEdicao = (id, valor, metodo) => {
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-valor').value = valor;
    document.getElementById('edit-metodo').value = metodo;
    document.getElementById('modal-editar').classList.remove('hidden');
};
window.fecharModalEdicao = () => document.getElementById('modal-editar').classList.add('hidden');
window.salvarEdicaoVenda = async () => {
    const id = document.getElementById('edit-id').value;
    const met = document.getElementById('edit-metodo').value;
    await updateDoc(doc(db, COLECAO_VENDAS, id), { total: parseFloat(document.getElementById('edit-valor').value), metodo: met, pago: met !== 'aver' });
    window.fecharModalEdicao();
    carregarHistorico();
};

// ============================================================
// 11. MÓDULO: DEVEDORES
// ============================================================
async function carregarDevedores() {
    const tbody = document.querySelector('#tabela-devedores tbody');
    tbody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';
    document.getElementById('bulk-actions-devedores').classList.add('hidden');
    document.getElementById('select-all-dev').checked = false;

    const snap = await getDocs(query(collection(db, COLECAO_VENDAS), where("pago", "==", false)));
    const dev = {};
    snap.forEach(d => {
        const v = d.data();
        if(!dev[v.cliente]) dev[v.cliente] = 0;
        dev[v.cliente] += v.total;
    });
    
    let html = '';
    Object.keys(dev).sort().forEach(n => {
        html += `<tr>
            <td style="text-align:center"><input type="checkbox" class="dev-checkbox" value="${n}"></td>
            <td>${n}</td>
            <td style="color:var(--danger)">R$ ${dev[n].toFixed(2)}</td>
            <td><button onclick="window.verDetalhesDevedor('${n}')" class="btn-primary" style="font-size:0.8rem">Ver</button></td>
        </tr>`;
    });
    tbody.innerHTML = html || '<tr><td colspan="4">Ninguém deve nada!</td></tr>';
    
    configurarCheckboxes('select-all-dev', 'dev-checkbox', 'bulk-actions-devedores', 'selected-count-dev');
}

window.filtrarDevedores = () => {
    const termo = document.getElementById('busca-devedores').value.toLowerCase();
    document.querySelectorAll('#tabela-devedores tbody tr').forEach(tr => {
        tr.style.display = tr.innerText.toLowerCase().includes(termo) ? '' : 'none';
    });
};

window.excluirMassaDevedores = async () => {
    const checks = document.querySelectorAll('.dev-checkbox:checked');
    if(!confirm(`ATENÇÃO: Isso apagará TODAS as dívidas de ${checks.length} clientes. Continuar?`)) return;
    
    mostrarLoading(true);
    for(const c of checks) {
        const nomeCliente = c.value;
        const q = query(collection(db, COLECAO_VENDAS), where("cliente", "==", nomeCliente), where("pago", "==", false));
        const snap = await getDocs(q);
        snap.forEach(async (docSnap) => { await deleteDoc(doc(db, COLECAO_VENDAS, docSnap.id)); });
    }
    mostrarLoading(false);
    alert("Dívidas excluídas.");
    carregarDevedores();
};

window.verDetalhesDevedor = async (nome) => {
    const modal = document.getElementById('modal-devedor');
    const tbody = document.querySelector('#tabela-detalhes-devedor tbody');
    tbody.innerHTML = '<tr><td colspan="3">Buscando...</td></tr>';
    modal.classList.remove('hidden');
    document.getElementById('titulo-devedor').innerText = `Extrato: ${nome}`;
    
    // Sem OrderBy para evitar erro de índice
    const q = query(collection(db, COLECAO_VENDAS), where("cliente", "==", nome), where("pago", "==", false));
    const snap = await getDocs(q);
    
    let vendas = [];
    snap.forEach(d => vendas.push(d.data()));
    vendas.sort((a, b) => b.data.seconds - a.data.seconds);

    let html = ''; let total = 0;
    vendas.forEach(v => {
        total += v.total;
        const data = v.data?.toDate ? v.data.toDate().toLocaleDateString('pt-BR') : '-';
        html += `<tr><td>${data}</td><td>${v.produtoNome}</td><td>R$ ${v.total.toFixed(2)}</td></tr>`;
    });
    tbody.innerHTML = html || '<tr><td colspan="3">Nada encontrado.</td></tr>';
    document.getElementById('total-divida-modal').innerText = `R$ ${total.toFixed(2)}`;
};

// --- DASHBOARD ---
async function carregarDashboard() {
    const inicioInput = document.getElementById('data-inicio').value;
    const fimInput = document.getElementById('data-fim').value;
    const inicio = new Date(inicioInput + 'T00:00:00');
    const fim = new Date(fimInput + 'T23:59:59');
    const q = query(collection(db, COLECAO_VENDAS), where("data", ">=", Timestamp.fromDate(inicio)), where("data", "<=", Timestamp.fromDate(fim)));
    const snap = await getDocs(q);
    let fat = 0, fiado = 0, custo = 0;
    snap.forEach(d => {
        const v = d.data();
        fat += v.total; custo += (v.custo || 0); if(!v.pago) fiado += v.total;
    });
    document.getElementById('kpi-faturamento').innerText = `R$ ${fat.toFixed(2)}`;
    document.getElementById('kpi-fiado').innerText = `R$ ${fiado.toFixed(2)}`;
    document.getElementById('kpi-lucro').innerText = `R$ ${(fat - custo).toFixed(2)}`;
    renderChart([fat]);
}

function renderChart(data) {
    const ctx = document.getElementById('mainChart');
    if(!ctx) return;
    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: { labels: ['Total Período'], datasets: [{ label: 'Vendas', data, backgroundColor: '#4F46E5' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
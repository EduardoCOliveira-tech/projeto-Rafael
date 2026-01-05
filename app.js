import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } 
       from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, limit, Timestamp, doc, updateDoc, deleteDoc, increment } 
       from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- 1. CONFIGURAÇÃO FIREBASE ---
// Substitua pelas chaves do seu projeto se necessário
const firebaseConfig = {
  apiKey: "AIzaSyBx34219zAWq6qtvs7qO3-SMSVRHJ5dX8M",
  authDomain: "projeto-rafael-f9eef.firebaseapp.com",
  projectId: "projeto-rafael-f9eef",
  storageBucket: "projeto-rafael-f9eef.firebasestorage.app",
  messagingSenderId: "1058117376976",
  appId: "1:1058117376976:web:78a6891a5ec9904d7637d5",
  measurementId: "G-NWXV5KCE2V"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Variáveis Globais
let chartInstance = null;
const COLECAO_VENDAS = 'loja_vendas';
const COLECAO_PRODUTOS = 'loja_produtos';
const COLECAO_CATEGORIAS = 'loja_categorias_config';

// --- 2. UI & INICIALIZAÇÃO ---
document.addEventListener("DOMContentLoaded", () => {
    // Configurar Dark Mode
    const btnTheme = document.getElementById('theme-toggle');
    if(btnTheme) {
        // Carregar preferência salva
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-mode');
            btnTheme.querySelector('i').classList.replace('fa-moon', 'fa-sun');
        }
        // Alternar tema
        btnTheme.onclick = (e) => {
            e.preventDefault();
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            btnTheme.querySelector('i').classList.replace(isDark ? 'fa-moon' : 'fa-sun', isDark ? 'fa-sun' : 'fa-moon');
            if(chartInstance) chartInstance.update();
        };
    }

    // Configurar Filtro de Data (Padrão: Mês Atual)
    const mesFiltro = document.getElementById('mes-filtro');
    const hoje = new Date();
    mesFiltro.value = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
    mesFiltro.addEventListener('change', carregarDashboard);
});

// --- 3. AUTENTICAÇÃO ---
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

// Monitorar Login
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
    carregarCategorias();
    carregarEstoque();
    carregarDashboard();
    // Devedores e Histórico carregam apenas ao clicar na aba para otimizar
}

// --- 4. NAVEGAÇÃO (Abas) ---
document.querySelectorAll('.menu li').forEach(item => {
    item.addEventListener('click', () => {
        // Remove classe ativa de todos
        document.querySelectorAll('.menu li').forEach(li => li.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        // Ativa o clicado
        item.classList.add('active');
        const target = item.getAttribute('data-target');
        document.getElementById(target).classList.add('active');
        
        // Carrega dados específicos da aba
        if(target === 'dashboard') carregarDashboard();
        if(target === 'devedores') carregarDevedores();
        if(target === 'estoque') carregarEstoque();
        if(target === 'historico') carregarHistorico();
    });
});

// --- 5. MÓDULO: ESTOQUE E CATEGORIAS ---

// Adicionar Nova Categoria
document.getElementById('btn-add-cat')?.addEventListener('click', async () => {
    const nova = prompt("Nome da Nova Categoria:");
    if(nova && nova.trim()) {
        await addDoc(collection(db, COLECAO_CATEGORIAS), { nome: nova.trim().toUpperCase() });
        carregarCategorias();
    }
});

// Carregar Categorias no Select
async function carregarCategorias() {
    const sel = document.getElementById('prod-categoria');
    if(!sel) return;
    
    sel.innerHTML = '<option value="">Selecione...</option>';
    const snap = await getDocs(query(collection(db, COLECAO_CATEGORIAS), orderBy("nome")));
    
    snap.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.data().nome; 
        opt.text = d.data().nome;
        sel.appendChild(opt);
    });
}

// Salvar Novo Produto
document.getElementById('form-produto')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    mostrarLoading(true);
    try {
        await addDoc(collection(db, COLECAO_PRODUTOS), {
            nome: document.getElementById('prod-nome').value,
            categoria: document.getElementById('prod-categoria').value,
            custo: parseFloat(document.getElementById('prod-custo').value),
            venda: parseFloat(document.getElementById('prod-venda').value),
            qtd: parseInt(document.getElementById('prod-qtd').value),
            ativo: true,
            criadoEm: Timestamp.now()
        });
        document.getElementById('form-produto').reset();
        carregarEstoque();
        alert("Produto salvo com sucesso!");
    } catch (error) {
        alert("Erro ao salvar: " + error.message);
    }
    mostrarLoading(false);
});

// Listar Estoque na Tabela
async function carregarEstoque() {
    const snap = await getDocs(query(collection(db, COLECAO_PRODUTOS), orderBy("nome")));
    const tbody = document.querySelector('#tabela-estoque tbody');
    const selVenda = document.getElementById('venda-produto');
    
    // Limpa e prepara Select de Vendas
    selVenda.innerHTML = '<option value="">Selecione um produto...</option>';
    let html = '';

    snap.forEach(d => {
        const p = d.data();
        
        // Linha da Tabela
        html += `<tr>
            <td>${p.nome}</td>
            <td><span class="badge" style="background:#e0e7ff; color:#3730a3; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">${p.categoria || 'GERAL'}</span></td>
            <td>R$ ${p.custo.toFixed(2)}</td>
            <td>R$ ${p.venda.toFixed(2)}</td>
            <td style="${p.qtd < 5 ? 'color:var(--danger);font-weight:bold':''}">${p.qtd}</td>
            <td><button class="btn-icon btn-edit" title="Editar (Em breve)"><i class="fas fa-edit"></i></button></td>
        </tr>`;

        // Adiciona ao Select de Venda se tiver estoque positivo
        if(p.qtd > 0) {
            const opt = document.createElement('option');
            opt.value = d.id;
            // Formato: [CAT] Nome (Estoque)
            opt.text = `[${p.categoria?.substr(0,3) || 'GER'}] ${p.nome}`;
            opt.dataset.preco = p.venda;
            opt.dataset.custo = p.custo;
            selVenda.appendChild(opt);
        }
    });
    tbody.innerHTML = html;
}

// --- 6. MÓDULO: VENDAS ---

// Atualizar Totais na Tela
function attTotal() {
    const sel = document.getElementById('venda-produto');
    const qtd = document.getElementById('venda-qtd').value;
    
    if(sel.value) {
        const unit = parseFloat(sel.options[sel.selectedIndex].dataset.preco);
        document.getElementById('venda-valor-unit').value = unit.toFixed(2);
        
        // Se o usuário NÃO estiver editando o total manualmente, calcula automático
        if(document.activeElement !== document.getElementById('venda-valor-total')) {
            document.getElementById('venda-valor-total').value = (unit * qtd).toFixed(2);
        }
    }
}
document.getElementById('venda-produto')?.addEventListener('change', attTotal);
document.getElementById('venda-qtd')?.addEventListener('input', attTotal);

// Registrar Venda
document.getElementById('form-venda')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sel = document.getElementById('venda-produto');
    const qtd = parseInt(document.getElementById('venda-qtd').value);
    const metodo = document.getElementById('venda-metodo').value;
    const cliente = document.getElementById('venda-cliente').value;
    const totalFinal = parseFloat(document.getElementById('venda-valor-total').value);

    // Validação
    if(!sel.value) return alert("Selecione um produto.");
    if(metodo === 'aver' && !cliente.trim()) return alert("Para vender FIADO, é obrigatório colocar o nome do cliente!");

    mostrarLoading(true);
    try {
        const produtoNome = sel.options[sel.selectedIndex].text;
        const custoUnitario = parseFloat(sel.options[sel.selectedIndex].dataset.custo);

        // 1. Salvar Venda
        await addDoc(collection(db, COLECAO_VENDAS), {
            produtoId: sel.value,
            produtoNome: produtoNome,
            qtd: qtd,
            total: totalFinal, // Usa o valor que está no input (pode ter desconto)
            custo: custoUnitario * qtd,
            metodo: metodo,
            cliente: cliente.trim() || 'Consumidor',
            pago: metodo !== 'aver', // Se não for "A Ver", já entra como Pago
            data: Timestamp.now()
        });

        // 2. Abater Estoque
        await updateDoc(doc(db, COLECAO_PRODUTOS, sel.value), { qtd: increment(-qtd) });
        
        alert("Venda realizada com sucesso!");
        document.getElementById('form-venda').reset();
        
        // Resetar campos visuais
        document.getElementById('venda-valor-unit').value = "";
        document.getElementById('venda-valor-total').value = "";
        
        carregarEstoque(); // Atualiza lista e select
    } catch (error) {
        console.error(error);
        alert("Erro ao vender.");
    }
    mostrarLoading(false);
});

// --- 7. MÓDULO: HISTÓRICO DE VENDAS ---
async function carregarHistorico() {
    const tbody = document.querySelector('#tabela-historico tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Carregando últimas vendas...</td></tr>';

    // Busca as últimas 50 vendas
    const q = query(collection(db, COLECAO_VENDAS), orderBy("data", "desc"), limit(50));
    const snap = await getDocs(q);
    
    let html = '';
    snap.forEach(d => {
        const v = d.data();
        const dataFormatada = v.data?.toDate ? v.data.toDate().toLocaleDateString('pt-BR') : '-';
        const badgeClass = v.pago ? 'badge-success' : 'badge-warning';
        const status = v.pago ? 'PAGO' : 'PENDENTE';

        html += `<tr>
            <td>${dataFormatada}</td>
            <td>${v.cliente}</td>
            <td>${v.produtoNome} <small>(x${v.qtd})</small></td>
            <td>R$ ${v.total.toFixed(2)}</td>
            <td><span class="badge ${badgeClass}">${status}</span> <small>(${v.metodo})</small></td>
            <td>
                <button class="btn-icon btn-edit" onclick="window.abrirEdicao('${d.id}', '${v.total}', '${v.metodo}')"><i class="fas fa-edit"></i></button>
                <button class="btn-icon btn-delete" onclick="window.excluirVenda('${d.id}', '${v.produtoId}', ${v.qtd})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center">Nenhuma venda registrada.</td></tr>';
}

// Funções Globais (acessíveis pelo onclick do HTML)
window.excluirVenda = async (idVenda, idProd, qtd) => {
    if(confirm("Tem certeza? A venda será apagada e os itens voltarão para o estoque.")) {
        mostrarLoading(true);
        try {
            await deleteDoc(doc(db, COLECAO_VENDAS, idVenda));
            // Devolve estoque se for produto cadastrado (ignora importações legadas)
            if(idProd && idProd !== 'legacy_debt') {
                await updateDoc(doc(db, COLECAO_PRODUTOS, idProd), { qtd: increment(qtd) });
            }
            alert("Venda excluída!");
            carregarHistorico();
        } catch(e) { console.error(e); alert("Erro ao excluir."); }
        mostrarLoading(false);
    }
};

window.abrirEdicao = (id, valor, metodo) => {
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-valor').value = valor;
    document.getElementById('edit-metodo').value = metodo;
    document.getElementById('modal-editar').classList.remove('hidden');
};

window.fecharModalEdicao = () => {
    document.getElementById('modal-editar').classList.add('hidden');
};

window.salvarEdicaoVenda = async () => {
    const id = document.getElementById('edit-id').value;
    const novoValor = parseFloat(document.getElementById('edit-valor').value);
    const novoMetodo = document.getElementById('edit-metodo').value;
    
    if(!id) return;

    mostrarLoading(true);
    await updateDoc(doc(db, COLECAO_VENDAS, id), {
        total: novoValor,
        metodo: novoMetodo,
        pago: novoMetodo !== 'aver' // Atualiza status de pagamento
    });
    mostrarLoading(false);
    window.fecharModalEdicao();
    carregarHistorico();
    alert("Atualizado!");
};

// --- 8. MÓDULO: DEVEDORES ---
async function carregarDevedores() {
    const tbody = document.querySelector('#tabela-devedores tbody');
    tbody.innerHTML = '<tr><td colspan="3">Calculando dívidas...</td></tr>';

    // Busca TUDO que não está pago (independente de data)
    const q = query(collection(db, COLECAO_VENDAS), where("pago", "==", false));
    const snap = await getDocs(q);
    
    const devedores = {};
    snap.forEach(d => {
        const v = d.data();
        if(!devedores[v.cliente]) devedores[v.cliente] = 0;
        devedores[v.cliente] += v.total;
    });

    let html = '';
    // Ordena alfabeticamente
    Object.keys(devedores).sort().forEach(nome => {
        html += `<tr>
            <td>${nome}</td>
            <td style="color:var(--danger); font-weight:bold">R$ ${devedores[nome].toFixed(2)}</td>
            <td><button class="btn-primary" style="padding:5px 10px; font-size:0.8rem">Ver Detalhes</button></td>
        </tr>`;
    });
    tbody.innerHTML = html || '<tr><td colspan="3" style="text-align:center">Ninguém deve nada!</td></tr>';
}

// --- 9. DASHBOARD ---
async function carregarDashboard() {
    const [ano, mes] = document.getElementById('mes-filtro').value.split('-');
    const inicio = new Date(ano, mes-1, 1);
    const fim = new Date(ano, mes, 0, 23, 59, 59);

    // Busca vendas do mês selecionado
    const q = query(collection(db, COLECAO_VENDAS), where("data", ">=", Timestamp.fromDate(inicio)), where("data", "<=", Timestamp.fromDate(fim)));
    const snap = await getDocs(q);
    
    let fat = 0, fiado = 0, custo = 0;
    snap.forEach(d => {
        const v = d.data();
        fat += v.total;
        custo += (v.custo || 0);
        if(!v.pago) fiado += v.total;
    });

    document.getElementById('kpi-faturamento').innerText = `R$ ${fat.toFixed(2)}`;
    document.getElementById('kpi-fiado').innerText = `R$ ${fiado.toFixed(2)}`;
    document.getElementById('kpi-lucro').innerText = `R$ ${(fat - custo).toFixed(2)}`;
    
    renderChart([fat]); // Exemplo simplificado
}

function renderChart(data) {
    const ctx = document.getElementById('mainChart');
    if(!ctx) return;
    if(chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: { 
            labels: ['Total Mês'], 
            datasets: [{ 
                label: 'Vendas', 
                data: data, 
                borderColor: '#4F46E5', 
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                fill: true,
                tension: 0.4 
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function mostrarLoading(show) {
    const el = document.getElementById('loading-indicator');
    if(el) show ? el.classList.remove('hidden') : el.classList.add('hidden');
}

// =================================================================
// === 10. IMPORTAÇÃO DE DADOS (Nutriforte) ===
// =================================================================
window.importarDadosDoPDF = async () => {
    if (!confirm("ATENÇÃO: Isso importará centenas de produtos e devedores.\nDeseja continuar?")) return;
    const senha = prompt("Digite a senha de segurança (1234):");
    if (senha !== "1234") return alert("Senha incorreta.");

    mostrarLoading(true);
    
    // Lista de Devedores (Extraído do PDF)
    const devedores = [
        {nome: "ADO CARVALHO", valor: 292.00}, {nome: "ALESSANDRO RODRIGUES", valor: 1210.00}, 
        {nome: "ALZINEIDE MAE DAILO", valor: 70.00}, {nome: "AMILTON RODRIGUES", valor: 200.00},
        {nome: "ARLAN LIMA", valor: 140.00}, {nome: "AZITANIA MAE ADRIEL", valor: 75.00},
        {nome: "BELINHA", valor: 258.00}, {nome: "BINO MADEREIRA", valor: 260.00},
        {nome: "CABRINHA", valor: 236.00}, {nome: "CAL GARCIA", valor: 32.00},
        {nome: "CLAUDIO LEITE", valor: 108.00}, {nome: "CLIVIM", valor: 233.00},
        {nome: "CRISTOVÃO AGROVILA", valor: 249.00}, {nome: "DANIEL QUEIROZ", valor: 182.00},
        {nome: "DEANO", valor: 98.00}, {nome: "DIEGO DOURADO", valor: 690.00},
        {nome: "DONA NOEMIA", valor: 138.00}, {nome: "EDSON JR", valor: 316.00},
        {nome: "FBV", valor: 293.00}, {nome: "FORTE GRILL", valor: 10.00},
        {nome: "GENIVALDO LIMA", valor: 103.00}, {nome: "GERALDO SITIO", valor: 86.00},
        {nome: "GILMAR MANTEIGA", valor: 65.00}, {nome: "GILMAR PAI", valor: 223.00},
        {nome: "GUILHERME GUILA", valor: 344.50}, {nome: "JACKSON ALVES COSTA", valor: 302.00},
        {nome: "JEAN LAPA BEER", valor: 270.00}, {nome: "JOAO VACA BRAVA", valor: 210.00},
        {nome: "LUCAS ÔNIBUS", valor: 275.00}, {nome: "LUCIANO DE AROLDO", valor: 182.00},
        {nome: "MAJOR", valor: 22.50}, {nome: "MAMAE", valor: 100.00},
        {nome: "MATEUS CHINA VAN", valor: 155.00}, {nome: "MAZINHO LIMA", valor: 90.00},
        {nome: "MESSIAS ONIBUS", valor: 10.00}, {nome: "MISSÃO REDENTORISTA", valor: 20.00},
        {nome: "OLIMPIO RIACHO", valor: 25.00}, {nome: "ORLANDO EMPLACADORA", valor: 215.00},
        {nome: "PARQUE SÃO JORGE", valor: 118.00}, {nome: "PELANCA", valor: 17.00},
        {nome: "SEU JOAQUIM", valor: 40.00}, {nome: "SIDNEY", valor: 65.00},
        {nome: "TIÃO VAQUEIRO", valor: 300.00}, {nome: "TODDY", valor: 334.00},
        {nome: "VA LOMBADOR", valor: 48.00}, {nome: "VALDECI", valor: 80.00},
        {nome: "VEI SITIO", valor: 598.00}, {nome: "VITALINA", valor: 95.00},
        {nome: "ZILÁ", valor: 9.00}
    ];

    // Lista de Produtos (Extraído do PDF)
    const produtos = [
        // GERAL
        {cat: "GERAL", nome: "GUABI", custo: 54.00, venda: 65.00, qtd: 1},
        {cat: "GERAL", nome: "CAROÇO DE ALGODÃO", custo: 486.00, venda: 112.00, qtd: -1},
        {cat: "GERAL", nome: "FARELO SOJA 1/2", custo: 80.00, venda: 3.50, qtd: 2},
        {cat: "GERAL", nome: "FARELO SOJA CARGIL", custo: 125.00, venda: 145.00, qtd: 4},
        {cat: "GERAL", nome: "FARELO TRIGO", custo: 810.00, venda: 55.00, qtd: 0},
        {cat: "GERAL", nome: "MILHO GRÃO", custo: 66.00, venda: 78.00, qtd: 4},
        {cat: "GERAL", nome: "MILHO MOIDO", custo: 68.00, venda: 80.00, qtd: 5},
        {cat: "GERAL", nome: "SAL COMUM", custo: 15.00, venda: 25.00, qtd: 1},
        {cat: "GERAL", nome: "TORTA DE ALGODÃO", custo: 85.00, venda: 95.00, qtd: 5},
        // PET
        {cat: "PET", nome: "BILLY CAT 25KG SELECT MIX", custo: 190.00, venda: 266.00, qtd: 1},
        {cat: "PET", nome: "BILLY DOG 1KG ADULTO", custo: 11.00, venda: 17.60, qtd: 4},
        {cat: "PET", nome: "BILLY DOG ADULTO CARNE 25KG", custo: 137.00, venda: 191.80, qtd: 2},
        {cat: "PET", nome: "BOBBY 25KG", custo: 87.90, venda: 109.00, qtd: 9},
        {cat: "PET", nome: "BOBBY JUNIOR 10KG", custo: 51.00, venda: 81.60, qtd: 8},
        {cat: "PET", nome: "COLEIRA CAO G SEM PINGENTE", custo: 5.62, venda: 9.56, qtd: 8},
        {cat: "PET", nome: "COLEIRA PATINHA GUIZO", custo: 4.51, venda: 7.22, qtd: 7},
        {cat: "PET", nome: "COMEDOURO PLASTICO ERGONOMICO", custo: 8.20, venda: 13.94, qtd: 9},
        {cat: "PET", nome: "CORRENTE CAES N4 FERRO", custo: 6.60, venda: 11.22, qtd: 8},
        {cat: "PET", nome: "GOLDEN ADULTO CARNE 15KG", custo: 147.45, venda: 206.43, qtd: 1},
        {cat: "PET", nome: "GOLDEN FILHOTES FRANGO 20 KG", custo: 200.88, venda: 281.23, qtd: 2},
        {cat: "PET", nome: "KIKO CAT 25KG", custo: 165.90, venda: 232.26, qtd: 1},
        {cat: "PET", nome: "PEDIGREE ADULTO CARNE 20KG", custo: 207.76, venda: 290.86, qtd: 2},
        {cat: "PET", nome: "PEDIGREE SACHE ADULTO", custo: 2.33, venda: 3.26, qtd: 24},
        {cat: "PET", nome: "PREMIER ADULTO RAÇA PEQ 20KG", custo: 282.00, venda: 394.80, qtd: 2},
        {cat: "PET", nome: "SHAMPOO SANOL DOG 500ML", custo: 14.87, venda: 23.79, qtd: 4},
        {cat: "PET", nome: "VITAPOP 25KG", custo: 81.00, venda: 100.44, qtd: 13},
        {cat: "PET", nome: "WHISKAS SACHE CARNE", custo: 2.33, venda: 3.00, qtd: 35},
        // RAÇÕES
        {cat: "RAÇÕES", nome: "RAÇÃO COMIGO BOVINOS LEITE 20 30KG", custo: 62.00, venda: 74.40, qtd: 18},
        {cat: "RAÇÕES", nome: "RAÇÃO COMIGO AVES POEDEIRA", custo: 52.22, venda: 64.75, qtd: 25},
        {cat: "RAÇÕES", nome: "RAÇÃO COMIGO COOPERHORSE", custo: 50.42, venda: 60.50, qtd: 18},
        {cat: "RAÇÕES", nome: "RAÇÃO COMIGO PORKAO DA ROÇA", custo: 53.50, venda: 65.81, qtd: 23},
        {cat: "RAÇÕES", nome: "RAÇÃO COMIGO COOPER BULL 20KG", custo: 39.40, venda: 49.64, qtd: 39},
        {cat: "RAÇÕES", nome: "RAÇÃO COMIPEIXE 4MM", custo: 74.80, venda: 97.24, qtd: 5},
        // MEDICAMENTOS
        {cat: "MEDICAMENTOS", nome: "ACURA MAX 25ML", custo: 44.77, venda: 71.63, qtd: 1},
        {cat: "MEDICAMENTOS", nome: "ADE EM PO 1KG", custo: 9.99, venda: 15.98, qtd: 10},
        {cat: "MEDICAMENTOS", nome: "AGULHA BD ROSA", custo: 0.30, venda: 0.48, qtd: 87},
        {cat: "MEDICAMENTOS", nome: "ALIV-V INJ 50ML", custo: 29.96, venda: 47.94, qtd: 5},
        {cat: "MEDICAMENTOS", nome: "AMINOMIX PET 100GRS", custo: 34.96, venda: 55.94, qtd: 2},
        {cat: "MEDICAMENTOS", nome: "AMITRAZ CALBOS", custo: 4.11, venda: 6.58, qtd: 4},
        {cat: "MEDICAMENTOS", nome: "ANTITOXICO BIOFARM 100ML", custo: 18.04, venda: 28.86, qtd: 6},
        {cat: "MEDICAMENTOS", nome: "AVEREX 30 GRS", custo: 7.06, venda: 11.30, qtd: 6},
        {cat: "MEDICAMENTOS", nome: "AZIUM", custo: 16.84, venda: 26.94, qtd: 3},
        {cat: "MEDICAMENTOS", nome: "BARRAGE 20 ML", custo: 3.30, venda: 5.28, qtd: 13},
        {cat: "MEDICAMENTOS", nome: "BENZOCRIOL 500ML", custo: 21.04, venda: 33.66, qtd: 2},
        {cat: "MEDICAMENTOS", nome: "BIODEX 20 COMPRIMIDOS", custo: 11.88, venda: 19.01, qtd: 4},
        {cat: "MEDICAMENTOS", nome: "BORGAL 50ML", custo: 60.73, venda: 85.02, qtd: 5},
        {cat: "MEDICAMENTOS", nome: "CALMINEX 100GRS", custo: 31.60, venda: 50.56, qtd: 11},
        {cat: "MEDICAMENTOS", nome: "CEF-50 INJ 100ML", custo: 49.99, venda: 79.98, qtd: 3},
        {cat: "MEDICAMENTOS", nome: "CHEMITRIL ORAL 10% 100ML", custo: 24.32, venda: 38.91, qtd: 6},
        {cat: "MEDICAMENTOS", nome: "CIPERMETRINA POUR ON CALBOS", custo: 24.60, venda: 39.36, qtd: 12},
        {cat: "MEDICAMENTOS", nome: "CREOLINA 50ML", custo: 10.33, venda: 16.53, qtd: 6},
        {cat: "MEDICAMENTOS", nome: "DECTOMAX 50ML", custo: 25.00, venda: 40.00, qtd: 4},
        {cat: "MEDICAMENTOS", nome: "ENRONEW 50MG", custo: 5.83, venda: 9.32, qtd: 58},
        {cat: "MEDICAMENTOS", nome: "EQUIPALAZONE INJ 100ML", custo: 41.99, venda: 67.18, qtd: 3},
        {cat: "MEDICAMENTOS", nome: "FLUMAX 50ML", custo: 38.99, venda: 62.38, qtd: 4},
        {cat: "MEDICAMENTOS", nome: "FORMIKELL GEL 10G", custo: 12.50, venda: 20.00, qtd: 10},
        {cat: "MEDICAMENTOS", nome: "GLICOFARM PET 20ML", custo: 12.64, venda: 20.22, qtd: 15},
        {cat: "MEDICAMENTOS", nome: "IVOMEC GOLD 3,15% 50 ML", custo: 45.00, venda: 72.00, qtd: 4},
        {cat: "MEDICAMENTOS", nome: "KELLDRIN KELLMAT BLOCO", custo: 1.18, venda: 2.12, qtd: 49},
        {cat: "MEDICAMENTOS", nome: "KELLDRIN KELLTHION 1L", custo: 58.78, venda: 105.80, qtd: 5},
        {cat: "MEDICAMENTOS", nome: "MATT PULGAS 100G", custo: 2.13, venda: 3.84, qtd: 177},
        {cat: "MEDICAMENTOS", nome: "MONOVIN A 20 ML", custo: 27.76, venda: 44.42, qtd: 11},
        {cat: "MEDICAMENTOS", nome: "NEXGARD SPECTRA 2-3.5KG", custo: 59.14, venda: 94.63, qtd: 3},
        {cat: "MEDICAMENTOS", nome: "ORGANOVIT 100ML", custo: 9.91, venda: 15.88, qtd: 12},
        {cat: "MEDICAMENTOS", nome: "POTENAY", custo: 10.00, venda: 16.00, qtd: 12},
        {cat: "MEDICAMENTOS", nome: "PROVERME 28GRS", custo: 6.02, venda: 9.63, qtd: 32},
        {cat: "MEDICAMENTOS", nome: "TERRAMICINA LA 50ML", custo: 19.47, venda: 31.15, qtd: 10},
        {cat: "MEDICAMENTOS", nome: "TIURAN AEROSSOL 125 ML", custo: 28.92, venda: 46.27, qtd: 5},
        {cat: "MEDICAMENTOS", nome: "WELLPET 100MG 4-10KG", custo: 43.46, venda: 69.54, qtd: 115},
        // SELARIA / DIVERSOS
        {cat: "SELARIA", nome: "ADUBO DIMY 10-10-10 500G", custo: 6.83, venda: 11.62, qtd: 17},
        {cat: "SELARIA", nome: "ARAME FARPADO FORTTE 500M", custo: 352.00, venda: 457.60, qtd: 5},
        {cat: "SELARIA", nome: "BAYGON ESPIRAL C/10", custo: 5.60, venda: 9.52, qtd: 57},
        {cat: "SELARIA", nome: "BOTA PLUMA", custo: 87.90, venda: 158.22, qtd: 33},
        {cat: "SELARIA", nome: "BOTA SOLADO PNEU", custo: 49.90, venda: 94.81, qtd: 39},
        {cat: "SELARIA", nome: "CANIVETE COMUM", custo: 21.00, venda: 33.60, qtd: 7},
        {cat: "SELARIA", nome: "CHAPEU COURO ABA G", custo: 60.00, venda: 96.00, qtd: 4},
        {cat: "SELARIA", nome: "COMEDOURO AVES 1 FURO", custo: 2.03, venda: 3.25, qtd: 37},
        {cat: "SELARIA", nome: "CORDA 10MM", custo: 1.29, venda: 2.06, qtd: 160},
        {cat: "SELARIA", nome: "CORDA TRANÇADA PP 4MM", custo: 0.40, venda: 0.80, qtd: 455},
        {cat: "SELARIA", nome: "ENXADA TRAMONTINA", custo: 23.67, venda: 37.87, qtd: 3},
        {cat: "SELARIA", nome: "FACÃO CORNETA", custo: 69.00, venda: 99.00, qtd: 6},
        {cat: "SELARIA", nome: "MACHADO TRAMONTINA", custo: 47.34, venda: 75.74, qtd: 6},
        {cat: "SELARIA", nome: "PULVERIZADOR 20L COSTAL", custo: 263.22, venda: 368.51, qtd: 1},
        {cat: "SELARIA", nome: "RAÇÃO CANÁRIO 500G", custo: 4.56, venda: 7.30, qtd: 7}
    ];

    try {
        // Importar Devedores
        for (const d of devedores) {
            await addDoc(collection(db, COLECAO_VENDAS), {
                produtoId: 'legacy_debt',
                produtoNome: 'Saldo Devedor Anterior (Importado)',
                qtd: 1,
                total: d.valor,
                custo: 0,
                metodo: 'aver',
                cliente: d.nome,
                pago: false,
                data: Timestamp.now()
            });
        }
        
        // Importar Produtos
        for (const p of produtos) {
            await addDoc(collection(db, COLECAO_PRODUTOS), {
                nome: p.nome,
                categoria: p.cat,
                custo: p.custo,
                venda: p.venda,
                qtd: p.qtd,
                ativo: true,
                criadoEm: Timestamp.now()
            });
        }
        
        // Criar Categorias se não existirem
        const cats = ["GERAL", "PET", "RAÇÕES", "MEDICAMENTOS", "SELARIA"];
        for(const c of cats) {
            await addDoc(collection(db, COLECAO_CATEGORIAS), { nome: c });
        }

        alert("SUCESSO! " + devedores.length + " devedores e " + produtos.length + " produtos importados.");
        location.reload();

    } catch (e) {
        console.error("Erro importação:", e);
        alert("Erro. Verifique o console.");
    } finally {
        mostrarLoading(false);
    }
};
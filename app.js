/* app.js - Frontend para GitHub Pages que comunica com Apps Script via fetch()
   Substitua SCRIPT_URL se necessário (já preenchido com o seu endpoint).
*/

/* --------------------- CONFIG --------------------- */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxvNjdVPhvpAoEzEpNN8BuyV8ZXkyOWC-ab5QtDcpwvvAg0LsHSn_l4zchI-sNC3jlcMA/exec";
/* --------------------- FIM CONFIG --------------------- */

let CURRENT_USER = null;
let DESPESAS = [];
let FUNCIONARIOS = [];
let FILTRO_GESTOR_EMAIL = "";
let CHART = null;
let DESPESA_SELECIONADA_ID = null;

const CATEGORIAS = [
  "Alimentação",
  "Transporte",
  "Hospedagem",
  "Combustível",
  "Pedágio",
  "Estacionamento",
  "Ferramentas",
  "Materiais",
  "Outros"
];

/* ---------- helpers fetch API ---------- */
async function apiRequest(action, payload = {}, method = "POST") {
  const url = new URL(SCRIPT_URL);
  url.searchParams.set("action", action);

  const opts = {
    method,
    headers: { "Content-Type": "application/json" }
  };

  if (method === "GET") {
    Object.keys(payload || {}).forEach(k => url.searchParams.set(k, payload[k]));
  } else {
    opts.body = JSON.stringify(payload);
  }

  const resp = await fetch(url.toString(), opts);
  if (!resp.ok) {
    throw new Error("Erro de rede: " + resp.status);
  }
  const data = await resp.json();
  return data;
}

/* ================================================
   LOGIN / INICIALIZAÇÃO
================================================= */
function temBackend() {
  return !!SCRIPT_URL;
}

function mostrarLogin() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("app-screen").classList.add("hidden");
}

function mostrarApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.remove("hidden");
}

function realizarLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const senha = document.getElementById("loginSenha").value;
  const divErro = document.getElementById("loginErro");

  if (!email || !senha) {
    divErro.style.display = "block";
    divErro.textContent = "Informe e-mail e senha.";
    return;
  }

  if (!temBackend()) {
    alert("Este app precisa ser executado contra um Web App do Google Apps Script.");
    return;
  }

  divErro.style.display = "none";
  divErro.textContent = "";

  const payload = { email, senhaBase64: btoa(senha) };

  apiRequest("loginUsuario", payload)
    .then(dados => {
      if (!dados || !dados.ok) {
        divErro.style.display = "block";
        divErro.textContent = (dados && dados.mensagem) || "Usuário ou senha inválidos.";
        return;
      }
      CURRENT_USER = dados.usuario;
      DESPESAS = dados.despesas || [];
      FUNCIONARIOS = dados.funcionarios || [];
      FILTRO_GESTOR_EMAIL = "";
      iniciarApp();
    })
    .catch(err => {
      console.error(err);
      divErro.style.display = "block";
      divErro.textContent = "Erro ao autenticar. Tente novamente.";
    });
}

function iniciarApp() {
  document.getElementById("tituloUsuario").textContent =
    "Olá, " + (CURRENT_USER.nome || CURRENT_USER.email);

  document.getElementById("infoTipoUsuario").textContent =
    (CURRENT_USER.tipo || "").toUpperCase() === "GESTOR"
      ? "Perfil: Gestor"
      : "Perfil: Funcionário";

  if ((CURRENT_USER.tipo || "").toUpperCase() === "GESTOR") {
    document.getElementById("tab-gestao").classList.remove("hidden");
  }

  inicializarCategorias();
  preencherFiltroGestor();
  atualizarResumo();
  renderDashboard();
  renderHistorico();
  initGrafico();
  atualizarGrafico();

  mostrarApp();
  showPage("dashboard");
}

function logout() {
  CURRENT_USER = null;
  DESPESAS = [];
  FUNCIONARIOS = [];
  FILTRO_GESTOR_EMAIL = "";
  CHART = null;
  mostrarLogin();
}

/* ================================================
   NAVEGAÇÃO ENTRE PÁGINAS
================================================= */
function showPage(page) {
  document
    .querySelectorAll(".page-view")
    .forEach((v) => v.classList.remove("active"));

  document.getElementById("page-" + page).classList.add("active");

  document
    .querySelectorAll(".bottom-nav button")
    .forEach((b) => b.classList.remove("active"));

  document.getElementById("tab-" + page)?.classList.add("active");

  if (page === "dashboard") {
    atualizarResumo();
    renderDashboard();
    atualizarGrafico();
  }

  if (page === "historico") renderHistorico();
  if (page === "gestao") renderGestaoFuncionarios();
}

/* ================================================
   CATEGORIAS / SELECTS DINÂMICOS
================================================= */
function inicializarCategorias() {
  const selects = [
    "categoria",
    "editCategoria",
    "filtroCategoria"
  ];

  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.innerHTML = "";

    if (id === "filtroCategoria") {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Todas";
      el.appendChild(opt);
    }

    CATEGORIAS.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      el.appendChild(opt);
    });
  });
}

/* ================================================
   DASHBOARD
================================================= */
function atualizarResumo() {
  let funcionarioFiltro =
    FILTRO_GESTOR_EMAIL &&
    FUNCIONARIOS.find(f => f.email === FILTRO_GESTOR_EMAIL);

  const saldoInicial = Number(
    funcionarioFiltro?.saldoInicial ?? CURRENT_USER.saldoInicial ?? 0
  );

  const total = DESPESAS
    .filter(d => !FILTRO_GESTOR_EMAIL || d.usuarioEmail === FILTRO_GESTOR_EMAIL)
    .reduce((acc, d) => acc + Number(d.valor || 0), 0);

  const saldoAtual = saldoInicial - total;

  document.getElementById("saldoInicial").textContent =
    saldoInicial.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });

  document.getElementById("totalGasto").textContent =
    total.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });

  document.getElementById("saldoAtual").textContent =
    saldoAtual.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });

  const tag = document.getElementById("tagSaldoStatus");

  if (saldoAtual < 0) {
    tag.textContent = "Saldo negativo";
    tag.style.background = "#FCE8E6";
    tag.style.color = "#C5221F";
  } else if (saldoAtual <= 50) {
    tag.textContent = "Quase no limite";
    tag.style.background = "#FEF7E0";
    tag.style.color = "#B06000";
  } else {
    tag.textContent = "Dentro do limite";
    tag.style.background = "#E6F4EA";
    tag.style.color = "#137333";
  }
}

function renderDashboard() {
  const cont = document.getElementById("ultimasDespesas");
  cont.innerHTML = "";

  const ultimas = DESPESAS
    .filter(d => !FILTRO_GESTOR_EMAIL || d.usuarioEmail === FILTRO_GESTOR_EMAIL)
    .sort((a,b)=> a.dataISO < b.dataISO ? 1 : -1)
    .slice(0,5);

  if (!ultimas.length) {
    cont.innerHTML = "<p style='font-size:13px;color:#666;'>Nenhuma despesa cadastrada ainda.</p>";
    return;
  }

  ultimas.forEach(d=>{
    const div=document.createElement("div");
    div.className="list-item";

    let dataBR=new Date(d.dataISO).toLocaleDateString("pt-BR");
    let sub = `${d.descricao} • ${dataBR}`;
    if ((CURRENT_USER.tipo||"").toUpperCase()==="GESTOR")
      sub += " • " + (d.usuarioNome || d.usuarioEmail);

    div.innerHTML=`
      <div class="list-item-main">
        <span class="list-item-title">${d.categoria}</span>
        <span class="list-item-sub">${sub}</span>
      </div>
      <span class="list-item-value">${Number(d.valor).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</span>
    `;

    cont.appendChild(div);
  });
}

/* ================================================
   HISTÓRICO
================================================= */
function renderHistorico() {
  const cont=document.getElementById("listaHistorico");
  cont.innerHTML="";

  let lista=[...DESPESAS].sort((a,b)=>a.dataISO<b.dataISO?1:-1);

  if (FILTRO_GESTOR_EMAIL)
    lista = lista.filter(d=>d.usuarioEmail===FILTRO_GESTOR_EMAIL);

  const cat=document.getElementById("filtroCategoria").value;
  if (cat) lista = lista.filter(d=>d.categoria===cat);

  if (!lista.length) {
    cont.innerHTML="<p style='font-size:13px;color:#666;'>Nenhuma despesa encontrada.</p>";
    return;
  }

  lista.forEach(d=>{
    const div=document.createElement("div");
    div.className="hist-item";

    let dataBR=new Date(d.dataISO).toLocaleDateString("pt-BR");
    let sub=`${d.descricao} • ${dataBR}`;

    if ((CURRENT_USER.tipo||"").toUpperCase()==="GESTOR")
      sub += " • " + (d.usuarioNome || d.usuarioEmail);

    div.innerHTML=`
      <div class="hist-info">
        <span class="hist-title">${d.categoria}</span>
        <span class="hist-sub">${sub}</span>
      </div>
      <div class="hist-actions">
        <span class="hist-value">${Number(d.valor).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</span>
        <button class="btn-white" onclick="abrirEdicao(${d.id})">Editar</button>
        <button class="btn-danger" onclick="abrirModalExcluir(${d.id})">Excluir</button>
      </div>
    `;
    cont.appendChild(div);
  });
}

function aplicarFiltroGestor() {
  let sel=document.getElementById("filtroUsuarioGestor");
  FILTRO_GESTOR_EMAIL = sel.value || "";

  apiRequest("carregarDados", { emailUsuario: CURRENT_USER.email, filtroEmail: FILTRO_GESTOR_EMAIL })
    .then(dados=>{
      if (!dados.ok){ alert("Erro ao carregar."); return; }

      CURRENT_USER=dados.usuario;
      DESPESAS=dados.despesas;
      FUNCIONARIOS=dados.funcionarios;

      atualizarResumo();
      renderDashboard();
      renderHistorico();
      atualizarGrafico();
    })
    .catch(err=>console.error(err));
}

/* ================================================
   NOVA DESPESA
================================================= */
function salvarDespesa() {
  const categoria=document.getElementById("categoria").value;
  const valor=parseFloat(document.getElementById("valor").value);
  const data=document.getElementById("data").value;
  const desc=document.getElementById("descricao").value.trim();
  const arq=document.getElementById("comprovante").files[0];

  if (!categoria || !valor || !data || !desc){
    alert("Preencha todos os campos.");
    return;
  }

  const dados={ categoria, valor, data, descricao:desc };

  const enviar=(b64,nomeArq)=>{
    apiRequest("salvarDespesaServidor", {
      emailUsuario: CURRENT_USER.email,
      dadosDespesa: dados,
      comprovanteBase64: b64 || "",
      nomeArquivo: nomeArq || "",
      filtroEmail: FILTRO_GESTOR_EMAIL
    })
    .then(ret=>{
      if (!ret.ok){ alert("Erro ao salvar"); return; }

      CURRENT_USER=ret.usuario;
      DESPESAS=ret.despesas;
      FUNCIONARIOS=ret.funcionarios;

      document.getElementById("formDespesa").reset();
      atualizarResumo(); renderDashboard(); renderHistorico(); atualizarGrafico();
      showPage("historico");
    })
    .catch(e=>{ console.error(e); alert("Erro ao salvar"); });
  };

  if (arq){
    const r=new FileReader();
    r.onload=e=>enviar(e.target.result, arq.name);
    r.readAsDataURL(arq);
  } else enviar("", "");
}

/* ================================================
   EDITAR
================================================= */
function abrirEdicao(id){
  const d=DESPESAS.find(x=>x.id==id);
  if (!d) return;

  document.getElementById("editId").value=d.id;
  document.getElementById("editCategoria").value=d.categoria;
  document.getElementById("editValor").value=d.valor;
  document.getElementById("editData").value=d.dataISO;
  document.getElementById("editDescricao").value=d.descricao;

  showPage("editar");
}

function salvarEdicao(){
  const dados={
    id: document.getElementById("editId").value,
    categoria: document.getElementById("editCategoria").value,
    valor: parseFloat(document.getElementById("editValor").value),
    data: document.getElementById("editData").value,
    descricao: document.getElementById("editDescricao").value.trim()
  };

  apiRequest("editarDespesaServidor", { emailUsuario: CURRENT_USER.email, dadosDespesa: dados, filtroEmail: FILTRO_GESTOR_EMAIL })
    .then(ret=>{
      if (!ret.ok){ alert("Erro"); return; }

      CURRENT_USER=ret.usuario;
      DESPESAS=ret.despesas;

      showPage("historico");
      renderHistorico();
      atualizarResumo();
    })
    .catch(err=>console.error(err));
}

/* ================================================
   EXCLUSÃO
================================================= */
function abrirModalExcluir(id){
  DESPESA_SELECIONADA_ID=id;
  document.getElementById("modalExcluir").classList.remove("hidden");
}

function fecharModal(){
  DESPESA_SELECIONADA_ID=null;
  document.getElementById("modalExcluir").classList.add("hidden");
}

function excluirDespesaConfirmada(){
  if (!DESPESA_SELECIONADA_ID) return;

  apiRequest("excluirDespesaServidor", { emailUsuario: CURRENT_USER.email, id: DESPESA_SELECIONADA_ID, filtroEmail: FILTRO_GESTOR_EMAIL })
    .then(ret=>{
      if (!ret.ok){ alert("Erro"); return; }

      CURRENT_USER=ret.usuario; DESPESAS=ret.despesas;
      fecharModal(); renderHistorico(); atualizarResumo(); atualizarGrafico();
    })
    .catch(err=>console.error(err));
}

/* ================================================
   GESTÃO DE FUNCIONÁRIOS
================================================= */
function preencherFiltroGestor(){
  const wrap=document.getElementById("filtroGestorWrapper");
  const sel=document.getElementById("filtroUsuarioGestor");

  sel.innerHTML="<option value=''>Todos</option>";

  if ((CURRENT_USER.tipo||"").toUpperCase()!=="GESTOR"){
    wrap.classList.add("hidden"); return;
  }

  wrap.classList.remove("hidden");

  FUNCIONARIOS.forEach(f=>{
    const opt=document.createElement("option");
    opt.value=f.email;
    opt.textContent=`${f.nome} (${f.email})`;
    sel.appendChild(opt);
  });

  renderGestaoFuncionarios();
}

function renderGestaoFuncionarios(){
  const c=document.getElementById("gestaoListaFuncionarios");
  c.innerHTML="";

  if (!FUNCIONARIOS.length){
    c.innerHTML="<p style='font-size:13px;color:#666;'>Nenhum funcionário.</p>";
    return;
  }

  FUNCIONARIOS.forEach(f=>{
    const div=document.createElement("div");
    div.className="gestao-item";

    div.innerHTML=`
      <div class="gestao-item-main">
        <b>${f.nome}</b><br/>
        <small>${f.email}</small><br/>
        <small>Tipo: ${f.tipo}</small><br/>
        <small>Saldo: ${Number(f.saldoInicial||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</small>
      </div>
      <div class="gestao-item-actions">
        <button class="btn-white" onclick="editarFuncionarioGestor('${f.email.replace(/'/g,"\\'")}')">Editar</button>
        <button class="btn-danger" onclick="excluirFuncionarioGestor('${f.email.replace(/'/g,"\\'")}')">Excluir</button>
      </div>
    `;
    c.appendChild(div);
  });
}

function editarFuncionarioGestor(email){
  const f=FUNCIONARIOS.find(x=>x.email===email);
  if (!f) return;

  document.getElementById("gestorNovoEmail").value=f.email;
  document.getElementById("gestorNovoNome").value=f.nome;
  document.getElementById("gestorNovoSaldo").value=f.saldoInicial ?? "";
  document.getElementById("gestorNovoTipo").value=f.tipo;
  document.getElementById("gestorNovoSenha").value="";

  showPage("gestao");
}

function salvarFuncionarioGestor(){
  const email=document.getElementById("gestorNovoEmail").value.trim();
  const nome=document.getElementById("gestorNovoNome").value.trim();
  const senha=document.getElementById("gestorNovoSenha").value;
  const saldo=document.getElementById("gestorNovoSaldo").value;
  const tipo=document.getElementById("gestorNovoTipo").value;

  const obj={
    email,
    nome,
    tipo,
    senhaBase64: senha? btoa(senha):"",
    saldoAtual: saldo===""? null: Number(saldo)
  };

  apiRequest("gestaoSalvarUsuario", { gestorEmail: CURRENT_USER.email, obj })
    .then(ret=>{
      if (!ret.ok){ alert(ret.mensagem||"Erro"); return; }

      FUNCIONARIOS=ret.funcionarios;
      preencherFiltroGestor();
      alert("Funcionário salvo!");
    })
    .catch(err=>console.error(err));
}

function excluirFuncionarioGestor(email){
  if (!confirm("Excluir usuário?")) return;

  apiRequest("gestaoExcluirUsuario", { emailGestor: CURRENT_USER.email, emailExcluir: email })
    .then(ret=>{
      if (!ret.ok){ alert("Erro"); return; }

      FUNCIONARIOS=ret.funcionarios;
      preencherFiltroGestor();
    })
    .catch(err=>console.error(err));
}

/* ================================================
   GRÁFICO
================================================= */
function initGrafico(){
  const ctx=document.getElementById("graficoCategorias");
  if (CHART) CHART.destroy();

  CHART=new Chart(ctx,{
    type:"doughnut",
    data:{
      labels: CATEGORIAS,
      datasets:[{
        data: Array(CATEGORIAS.length).fill(0),
        backgroundColor:[
          "#1E88E5","#43A047","#FB8C00","#8E24AA","#00ACC1",
          "#F06292","#FFD54F","#A1887F","#B39DDB"
        ]
      }]
    },
    options:{
      plugins:{
        legend:{
          position:"bottom",
          labels:{boxWidth:12,boxHeight:12}
        }
      },
      cutout:"55%"
    }
  });
}

function atualizarGrafico(){
  if (!CHART) return;

  const valores = CATEGORIAS.map(cat =>
    DESPESAS
      .filter(d => d.categoria===cat)
      .filter(d => !FILTRO_GESTOR_EMAIL || d.usuarioEmail===FILTRO_GESTOR_EMAIL)
      .reduce((a,b)=>a+Number(b.valor||0),0)
  );

  CHART.data.datasets[0].data = valores;
  CHART.update();
}

/* ================================================
   START
================================================= */
window.onload = function(){
  inicializarCategorias();
  mostrarLogin();
};

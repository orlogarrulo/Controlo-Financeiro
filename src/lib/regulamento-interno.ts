import { escolaLogoSrc } from "@/lib/logo-escola";
/**
 * Règlement intérieur / Regulamento interno — École Consulaire du Congo (Brazzaville) de Luanda
 * Versions FR et PT pour remise / signature des parents.
 */

export type RegulamentoLang = "fr" | "pt";

export type RegulamentoAck = {
  alunoNome: string;
  encarregadoNome: string;
  turma?: string;
  /** Até 6 alunos do mesmo encarregado. alunoNome/turma continuam o resumo. */
  alunos?: { nome: string; turma?: string }[];
  lang: RegulamentoLang;
  signedAt: string;
};

type EscolaMeta = {
  nome?: string;
  nomeCurto?: string;
  subtitulo?: string;
  ano?: string;
  morada?: string;
  telefones?: string;
  email?: string;
};

function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STYLES = `
  @page { size: A4 portrait; margin: 20mm 18mm 20mm 18mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: #fff; color: #0f172a;
    font-family: Georgia, "Times New Roman", Times, serif;
    font-size: 10.5px; line-height: 1.45;
    overflow-x: hidden;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* Ecrã / iframe / preview: margens brancas visíveis */
  @media screen {
    html, body {
      padding: 16px 20px 24px 20px;
      max-width: 210mm;
      margin-left: auto;
      margin-right: auto;
    }
  }
  .sheet {
    max-width: 100%; width: 100%; margin: 0 auto; padding: 0 2px;
    box-sizing: border-box; overflow-wrap: break-word; word-wrap: break-word;
  }
  .head { display: flex; gap: 10px; align-items: center;
    border-bottom: 2.5px solid #1f5c4a; padding-bottom: 8px; margin-bottom: 12px; max-width: 100%; }
  .head img { width: 56px; height: 56px; object-fit: contain; flex-shrink: 0; }
  .kicker { margin: 0; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
    color: #1f5c4a; font-weight: 600; }
  .title { margin: 3px 0 0; font-size: 14px; font-weight: 700; }
  .meta { margin: 2px 0 0; font-size: 10px; color: #555; }
  h2 { font-size: 12px; margin: 14px 0 6px; color: #1f5c4a;
    font-weight: 700; letter-spacing: 0.02em;
    border-bottom: 1px solid #c5d0ca; padding-bottom: 3px; }
  p, li {
    margin: 0 0 5px;
    text-align: justify;
    text-justify: inter-word;
    hyphens: auto;
    -webkit-hyphens: auto;
    overflow-wrap: break-word;
    word-wrap: break-word;
  }
  ul { margin: 0 0 8px; padding-left: 18px; }
  table.rules { width: 100%; max-width: 100%; border-collapse: collapse; margin: 6px 0 10px; table-layout: fixed; }
  table.rules td, table.rules th {
    border: 1px solid #1a4d3e; padding: 5px 7px; vertical-align: top; font-size: 10px;
    word-wrap: break-word; overflow-wrap: break-word; text-align: left; }
  table.rules th { background: #c6e0b4; color: #0f172a; text-align: left; font-size: 10px; font-weight: 700; }
  .box { border: 1px solid #c5d0ca; background: #f8faf9; padding: 8px 10px; margin: 8px 0; border-radius: 4px; }
  .box p, .box li { text-align: justify; }
  .aviso { border: 1px solid #d4a017; background: #fffbeb; padding: 8px 10px; margin: 10px 0;
    border-radius: 4px; }
  .sign { margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; max-width: 100%; }
  .sig { border-top: 1px solid #333; padding-top: 6px; font-size: 10.5px; }
  .foot { margin-top: 14px; font-size: 9px; color: #64748b; text-align: right; }
  .page-break { page-break-before: always; break-before: page; }
`;

function headBlock(
  escola: EscolaMeta,
  title: string,
  subtitle: string,
  lang: RegulamentoLang,
): string {
  const logo =
    escolaLogoSrc();
  const nome = esc(escola.nome || "École Consulaire du Congo (Brazzaville) de Luanda");
  return `
  <div class="head">
    <img src="${logo}" width="72" height="72" alt="" />
    <div>
      <p class="kicker">${nome}</p>
      <p class="title">${esc(title)}</p>
      <p class="meta">${esc(subtitle)} · ${esc(escola.ano || "2026/2027")} · ${lang === "fr" ? "Version française" : "Versão portuguesa"}</p>
    </div>
  </div>`;
}

function contentFr(escola: EscolaMeta): string {
  const tel = esc(escola.telefones || "+244 922 637 640");
  const email = esc(escola.email || "ecoleconsulaireeducongo1976.nv@gmail.com");
  const morada = esc(
    escola.morada ||
      "Urbanização Nova Vida, Rua 63, Casa S/N, Município Kilamba Kiaxi, Luanda – Angola",
  );
  return `
  <p>Le présent règlement intérieur s’applique à tous les élèves de l’${esc(escola.nomeCurto || "École Consulaire du Congo")} – Annexe Nova Vida (Luanda), ainsi qu’à leurs parents / responsables légaux. Il vise le bon fonctionnement de l’établissement, le respect mutuel et la sécurité des enfants.</p>

  <div class="aviso">
    <p><strong>Important —</strong> Les frais d’inscription et de renouvellement d’inscription (matrícula / renovação de matrícula) <strong>ne sont pas remboursables</strong>, quelles que soient les circonstances (retrait, transfert, abandon en cours d’année).</p>
  </div>

  <h2>1. Organisation pédagogique (République du Congo – Brazzaville)</h2>
  <p>L’École Consulaire suit le cadre de l’enseignement de la <strong>République du Congo (Brazzaville)</strong>, proche du modèle francophone :</p>
  <ul>
    <li><strong>Préscolaire / Maternelle</strong> : petite, moyenne et grande section (préparation à l’entrée en primaire).</li>
    <li><strong>Primaire (6 ans)</strong> : CP1, CP2, CE1, CE2, CM1, CM2 — sanctionné par le <strong>CEPE</strong> (Certificat d’études primaires élémentaires) / concours d’entrée en 6<sup>e</sup>.</li>
    <li><strong>Collège (4 ans)</strong> : 6<sup>e</sup>, 5<sup>e</sup>, 4<sup>e</sup>, 3<sup>e</sup> — sanctionné par le <strong>BEPC</strong> (Brevet d’études du premier cycle).</li>
    <li><strong>Lycée (3 ans)</strong> : Seconde, Première, Terminale — sanctionné par le <strong>Baccalauréat</strong>.</li>
  </ul>
  <p>L’enseignement est orienté vers les programmes et calendriers adaptés au contexte consulaire à Luanda, en cohérence avec les références de la République du Congo (Brazzaville). La direction publie chaque année les classes ouvertes et le calendrier scolaire.</p>

  <h2>2. Horaires et présence</h2>
  <ul>
    <li>Les élèves doivent arriver à l’heure. Les retards répétés font l’objet d’un suivi avec la famille.</li>
    <li><strong>Retards :</strong> 3 retards dans le même mois civil équivalent à 1 absence (faute de présence).</li>
    <li><strong>Matériel scolaire :</strong> 3 manquements de matériel dans le même mois civil équivalent également à 1 absence.</li>
    <li>Toute absence doit être justifiée par écrit (ou message) par le responsable légal, de préférence le jour même.</li>
    <li>Les absences non justifiées peuvent entraîner des mesures pédagogiques et, en cas de récidive, un entretien avec la direction.</li>
    <li><strong>Récupération des élèves :</strong> l’heure limite de prise en charge est <strong>18h00</strong>, avec une tolérance de <strong>30 minutes</strong> (jusqu’à 18h30).</li>
  </ul>

  <h2>3. Retards après 18h30 (garde exceptionnelle)</h2>
  <div class="box">
    <p>Après 18h00, une tolérance de 30 minutes est accordée (jusqu’à 18h30). Passé ce délai, tout élève non récupéré reste sous la responsabilité de l’école jusqu’à l’arrivée du responsable. Une pénalité de garde de <strong>15 000 Kz par heure</strong> (ou fraction d’heure) est facturée au responsable légal. En cas de retard répété, la direction convoque les parents.</p>
  </div>

  <h2>4. Jours fériés et dates commémoratives</h2>
  <p>En tant qu’établissement consulaire congolais implanté en Angola, <strong>il n’y a pas de cours</strong> les jours fériés nationaux de la République du Congo (Brazzaville) ni les jours fériés nationaux de la République d’Angola. Dates à date fixe (Congo et Angola) :</p>
  <table class="rules">
    <thead>
      <tr><th>Date</th><th>Commémoration</th></tr>
    </thead>
    <tbody>
      <tr><td>1<sup>er</sup> janvier</td><td>Jour de l’An (Congo et Angola)</td></tr>
      <tr><td>4 février</td><td>Début de la Lutte armée de libération nationale (Angola)</td></tr>
      <tr><td>8 mars</td><td>Journée internationale de la femme (Angola)</td></tr>
      <tr><td>23 mars</td><td>Libération de l’Afrique australe (Angola)</td></tr>
      <tr><td>4 avril</td><td>Paix et réconciliation nationale (Angola)</td></tr>
      <tr><td>1<sup>er</sup> mai</td><td>Fête du Travail (Congo et Angola)</td></tr>
      <tr><td>10 juin</td><td>Fête de la Réconciliation (Congo)</td></tr>
      <tr><td>15 août</td><td>Fête Nationale — Indépendance (Congo)</td></tr>
      <tr><td>17 septembre</td><td>Fondateur de la Nation et Héros national (Angola)</td></tr>
      <tr><td>1<sup>er</sup> novembre</td><td>Toussaint (Congo)</td></tr>
      <tr><td>2 novembre</td><td>Jour des défunts (Angola)</td></tr>
      <tr><td>11 novembre</td><td>Indépendance nationale (Angola)</td></tr>
      <tr><td>28 novembre</td><td>Jour de la République (Congo)</td></tr>
      <tr><td>25 décembre</td><td>Noël / Noël et Famille (Congo et Angola)</td></tr>
    </tbody>
  </table>
  <p>Fêtes mobiles : au Congo — Lundi de Pâques, Ascension et Lundi de Pentecôte ; en Angola — Carnaval et Vendredi saint (dates variables chaque année).</p>
  <p><strong>Vacances d’août :</strong> le mois d’août est une période de vacances scolaires — il n’y a pas de cours pendant tout le mois d’août.</p>

  <h2>5. Frais de scolarité, délais et pénalités</h2>
  <p>Les frais (inscription, assurance, manuels, uniforme, cantine, transport, cours, mensualités) sont dus selon le calendrier du Département des Finances. Rappel : les frais d’inscription et de renouvellement d’inscription ne sont pas remboursables.</p>
  <table class="rules">
    <thead>
      <tr><th>Période</th><th>Conséquence</th></tr>
    </thead>
    <tbody>
      <tr><td>Jusqu’au 10 du mois civil suivant</td><td>Paiement sans majoration</td></tr>
      <tr><td>Du 11 au 30 du même mois</td><td>Majoration de 35 %</td></tr>
      <tr><td>Jusqu’au 10 du mois suivant</td><td>Majoration de 50 %</td></tr>
      <tr><td>Après cette date</td><td>Suspension possible des services scolaires jusqu’à régularisation des paiements en retard</td></tr>
    </tbody>
  </table>
  <p>Modes de paiement : espèces, dépôt / virement BAI, carte Multicaixa. Un reçu ou facture est délivré.</p>

  <h2>6. Tenue vestimentaire et présentation</h2>
  <ul>
    <li>L’uniforme officiel est obligatoire les jours de cours, sauf consigne contraire de la direction.</li>
    <li>Tenue adaptée à l’âge ; chaussures fermées recommandées.</li>
    <li>Interdits : vêtements provocants, messages offensants, accessoires dangereux.</li>
    <li><strong>Coiffures :</strong> aucun style de coiffure n’est interdit, dès lors que le visage et les yeux de l’élève restent visibles.</li>
  </ul>

  <h2>7. Comportement et vie scolaire</h2>
  <ul>
    <li>Respect des enseignants, du personnel, des camarades et des locaux.</li>
    <li>Interdiction de violence, harcèlement, insultes, vol ou dégradation du matériel.</li>
    <li><strong>Téléphones portables :</strong> à l’entrée de l’école, le téléphone est déposé auprès de nos services. L’élève le récupère à la fin des cours. L’usage pendant le temps de classe est strictement interdit (sauf autorisation pédagogique écrite).</li>
    <li>Les objets de valeur sont déconseillés ; l’école n’est pas responsable des pertes hors faute prouvée.</li>
  </ul>

  <h2>8. Accueil des parents (Département pédagogique)</h2>
  <p>Le Département pédagogique reçoit les parents le <strong>samedi, de 9h30 à 12h30</strong>, uniquement sur rendez-vous (créneaux de <strong>20 minutes</strong> par réunion et par responsable légal). Prise de rendez-vous : <a href="https://controlo-financeiro-tau.vercel.app/marca">https://controlo-financeiro-tau.vercel.app/marca</a> ou par téléphone / WhatsApp <strong>922 637 640</strong>.</p>

  <h2>9. Santé et sécurité</h2>
  <ul>
    <li>Les allergies, groupe sanguin et clinique de proximité doivent figurer sur la fiche d’inscription.</li>
    <li>En cas d’urgence, l’école contacte les responsables et oriente vers la structure de santé indiquée.</li>
    <li>Médicaments : uniquement avec autorisation écrite des parents et consignes claires.</li>
    <li>Fiche santé / allergies : accès au formulaire via <a href="https://controlo-financeiro-tau.vercel.app/saude">https://controlo-financeiro-tau.vercel.app/saude</a> ou par téléphone <strong>922 637 640</strong>.</li>
  </ul>

  <h2>10. Canaux de signalement et réclamations</h2>
  <ul>
    <li>Secrétariat / Direction — sur place aux heures d’ouverture</li>
    <li>Téléphone : ${tel}</li>
    <li>E-mail : ${email}</li>
    <li>Adresse : ${morada}</li>
  </ul>

  <h2>11. Protection des données personnelles</h2>
  <p>Conformément à la Loi n° 22/11 du 17 juin (Loi sur la protection des données personnelles — Angola) et sous le contrôle de l’APD, l’école traite les données des élèves et des familles uniquement à des fins scolaires et de sécurité.</p>

  <h2>12. Acceptation</h2>
  <p>La signature du présent règlement (ou l’acceptation via le lien officiel de l’école) vaut prise de connaissance et engagement à le respecter pour l’année scolaire en cours.</p>
`;
}

function contentPt(escola: EscolaMeta): string {
  const tel = esc(escola.telefones || "+244 922 637 640");
  const email = esc(escola.email || "ecoleconsulaireeducongo1976.nv@gmail.com");
  const morada = esc(
    escola.morada ||
      "Urbanização Nova Vida, Rua 63, Casa S/N, Município Kilamba Kiaxi, Luanda – Angola",
  );
  return `
  <p>O presente regulamento interno aplica-se a todos os alunos da ${esc(escola.nomeCurto || "École Consulaire du Congo")} – Anexo Nova Vida (Luanda), bem como aos respectivos pais / encarregados de educação. Visa o bom funcionamento do estabelecimento, o respeito mútuo e a segurança das crianças.</p>

  <div class="aviso">
    <p><strong>Importante —</strong> Os valores de matrícula e de renovação de matrícula <strong>não são reembolsáveis</strong>, quaisquer que sejam as circunstâncias (desistência, transferência, abandono a meio do ano lectivo).</p>
  </div>

  <h2>1. Organização pedagógica (República do Congo – Brazzaville)</h2>
  <p>A École Consulaire segue o quadro de ensino da <strong>República do Congo (Brazzaville)</strong>, próximo do modelo francófono:</p>
  <ul>
    <li><strong>Pré-escolar / Maternelle:</strong> pequena, média e grande secção (preparação para o primário).</li>
    <li><strong>Primário (6 anos):</strong> CP1, CP2, CE1, CE2, CM1, CM2 — concluído com o <strong>CEPE</strong> (Certificat d’études primaires élémentaires) / concurso de acesso ao 6.º ano.</li>
    <li><strong>Colégio (4 anos):</strong> 6.º, 5.º, 4.º, 3.º — concluído com o <strong>BEPC</strong> (Brevet d’études du premier cycle).</li>
    <li><strong>Liceu (3 anos):</strong> Seconde, Première, Terminale — concluído com o <strong>Baccalauréat</strong>.</li>
  </ul>
  <p>O ensino orienta-se pelos programas e calendários adaptados ao contexto consular em Luanda, em coerência com as referências da República do Congo (Brazzaville). A direcção publica anualmente as classes abertas e o calendário escolar.</p>

  <h2>2. Horários e assiduidade</h2>
  <ul>
    <li>Os alunos devem chegar a horas. Atrasos repetidos são acompanhados com a família.</li>
    <li><strong>Atrasos:</strong> 3 atrasos no mesmo mês civil equivalem a 1 falta de presença.</li>
    <li><strong>Material escolar:</strong> 3 faltas de material (cadernos, livros, material pedido) no mesmo mês civil equivalem também a 1 falta de presença.</li>
    <li>Qualquer falta deve ser justificada por escrito (ou mensagem) pelo encarregado de educação, de preferência no próprio dia.</li>
    <li>Faltas não justificadas podem originar medidas pedagógicas e, em reincidência, reunião com a direcção.</li>
    <li><strong>Recolha dos alunos:</strong> o horário limite de saída / recolha é <strong>18h00</strong>, com tolerância de <strong>30 minutos</strong> (até às 18h30).</li>
  </ul>

  <h2>3. Atrasos depois das 18h30 (guarda excepcional)</h2>
  <div class="box">
    <p>Após as 18h00, é concedida uma tolerância de 30 minutos (até às 18h30). Ultrapassado este prazo, qualquer aluno não recolhido permanece sob responsabilidade da escola até à chegada do responsável. É cobrada ao encarregado de educação uma penalização de guarda de <strong>15 000 Kz por hora</strong> (ou fracção de hora). Em caso de atraso repetido, a direcção convoca os pais.</p>
  </div>

  <h2>4. Feriados e datas comemorativas</h2>
  <p>Enquanto estabelecimento consular congolês implantado em Angola, <strong>não há aulas</strong> nos feriados nacionais da República do Congo (Brazzaville) nem nos feriados nacionais da República de Angola. Datas fixas (Congo e Angola):</p>
  <table class="rules">
    <thead>
      <tr><th>Data</th><th>Comemoração</th></tr>
    </thead>
    <tbody>
      <tr><td>1 de janeiro</td><td>Ano Novo (Congo e Angola)</td></tr>
      <tr><td>4 de fevereiro</td><td>Início da Luta Armada de Libertação Nacional (Angola)</td></tr>
      <tr><td>8 de março</td><td>Dia Internacional da Mulher (Angola)</td></tr>
      <tr><td>23 de março</td><td>Dia da Libertação da África Austral (Angola)</td></tr>
      <tr><td>4 de abril</td><td>Dia da Paz e da Reconciliação Nacional (Angola)</td></tr>
      <tr><td>1 de maio</td><td>Dia do Trabalho (Congo e Angola)</td></tr>
      <tr><td>10 de junho</td><td>Festa da Reconciliação (Congo)</td></tr>
      <tr><td>15 de agosto</td><td>Festa Nacional — Independência (Congo)</td></tr>
      <tr><td>17 de setembro</td><td>Dia do Fundador da Nação e do Herói Nacional (Angola)</td></tr>
      <tr><td>1 de novembro</td><td>Todos os Santos (Congo)</td></tr>
      <tr><td>2 de novembro</td><td>Dia dos Finados (Angola)</td></tr>
      <tr><td>11 de novembro</td><td>Dia da Independência Nacional (Angola)</td></tr>
      <tr><td>28 de novembro</td><td>Dia da República (Congo)</td></tr>
      <tr><td>25 de dezembro</td><td>Natal / Natal e Família (Congo e Angola)</td></tr>
    </tbody>
  </table>
  <p>Festas móveis: no Congo — Segunda-feira de Páscoa, Ascensão e Segunda-feira de Pentecostes; em Angola — Carnaval e Sexta-Feira Santa (datas variáveis em cada ano).</p>
  <p><strong>Agosto:</strong> o mês de agosto é período de férias escolares — não há aulas durante todo o mês de agosto (salvo actividade excepcional anunciada por escrito pela direcção).</p>

  <h2>5. Propinas, prazos e multas por atraso de pagamento</h2>
  <p>As propinas e demais encargos (inscrição, seguro escolar, manuais, uniforme, cantina, transporte, cursos, mensalidades) são devidos segundo o calendário comunicado pelo Departamento de Finanças. Recorda-se: os valores de matrícula e de renovação de matrícula não são reembolsáveis.</p>
  <table class="rules">
    <thead>
      <tr><th>Período</th><th>Consequência</th></tr>
    </thead>
    <tbody>
      <tr><td>Até ao dia 10 do mês civil seguinte ao mês de facturação</td><td>Pagamento sem majoração</td></tr>
      <tr><td>Do dia 11 ao 30 do mesmo mês</td><td>Majoração de 35 % sobre o montante devido</td></tr>
      <tr><td>Até ao dia 10 do mês seguinte</td><td>Majoração de 50 % sobre o montante devido</td></tr>
      <tr><td>Após essa data</td><td>Suspensão possível dos serviços escolares até regularização dos pagamentos em atraso (decisão da direcção)</td></tr>
    </tbody>
  </table>
  <p>Formas de pagamento: dinheiro (caixa), depósito / transferência conta BAI, cartão Multicaixa. A escola emite recibo ou fatura.</p>

  <h2>6. Vestuário e apresentação</h2>
  <ul>
    <li>O uniforme oficial da escola é obrigatório nos dias de aulas, salvo indicação em contrário da direcção.</li>
    <li>Roupa adequada e própria à idade; calçado fechado recomendado.</li>
    <li>Proibido: vestuário provocador, mensagens ofensivas, acessórios perigosos.</li>
    <li><strong>Penteados:</strong> não há qualquer impedimento quanto aos penteados dos alunos, desde que o rosto e os olhos permaneçam visíveis.</li>
  </ul>

  <h2>7. Comportamento e vida escolar</h2>
  <ul>
    <li>Respeito por professores, funcionários, colegas e instalações.</li>
    <li>Proibida violência, assédio, insultos, furto ou danificação de material.</li>
    <li><strong>Telemóveis:</strong> na entrada da escola o telemóvel é depositado com os nossos serviços; o aluno recolhe-o no final das aulas. O uso dos telemóveis durante o tempo de aulas é proibido (salvo autorização pedagógica escrita).</li>
    <li>Objectos de valor são desaconselhados; a escola não se responsabiliza por perdas sem culpa comprovada.</li>
  </ul>

  <h2>8. Atendimento aos encarregados de educação (Departamento pedagógico)</h2>
  <p>O Departamento pedagógico atende os encarregados de educação aos <strong>sábados, das 9h30 às 12h30</strong>, apenas por agendamento (slots de <strong>20 minutos</strong> por reunião e por encarregado de educação). Marcação: <a href="https://controlo-financeiro-tau.vercel.app/marca">https://controlo-financeiro-tau.vercel.app/marca</a> ou telefone / WhatsApp <strong>922 637 640</strong>.</p>

  <h2>9. Saúde e segurança</h2>
  <ul>
    <li>Alergias, grupo sanguíneo e clínica mais próxima devem constar da ficha de matrícula.</li>
    <li>Em emergência, a escola contacta os responsáveis e, se necessário, orienta para a estrutura de saúde indicada.</li>
    <li>Medicamentos: apenas com autorização escrita dos pais e instruções claras.</li>
    <li>Ficha de saúde / alergias: acesso ao formulário pelo link <a href="https://controlo-financeiro-tau.vercel.app/saude">https://controlo-financeiro-tau.vercel.app/saude</a> ou pelo telefone <strong>922 637 640</strong>.</li>
  </ul>

  <h2>10. Canais de denúncia e reclamações</h2>
  <p>Para reclamação ou denúncia (comportamento, segurança, assédio, facturação):</p>
  <ul>
    <li>Secretaria / Direcção — presencialmente no horário de atendimento</li>
    <li>Telefone: ${tel}</li>
    <li>E-mail: ${email}</li>
    <li>Morada: ${morada}</li>
  </ul>
  <p>Os relatos são tratados com a confidencialidade possível. Factos graves podem ser comunicados às autoridades competentes, nos termos da lei angolana.</p>

  <h2>11. Protecção de dados pessoais</h2>
  <p>Nos termos da Lei n.º 22/11, de 17 de Junho (Lei da Protecção de Dados Pessoais — Angola) e sob fiscalização da Agência de Protecção de Dados (APD), a escola trata os dados dos alunos e famílias apenas para fins escolares e de segurança. Os encarregados dispõem dos direitos de informação, acesso, rectificação e oposição previstos na lei.</p>

  <h2>12. Aceitação</h2>
  <p>A assinatura deste regulamento (ou a aceitação através do link oficial da escola) implica a tomada de conhecimento e o compromisso de o respeitar no ano lectivo em curso.</p>
`;
}

function signatureBlock(
  lang: RegulamentoLang,
  ack?: Partial<RegulamentoAck>,
): string {
  const enc = esc(ack?.encarregadoNome || "");
  const data = ack?.signedAt
    ? new Date(ack.signedAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "pt-PT")
    : "____ / ____ / ________";
  const filled = (ack?.alunos || [])
    .map((a) => ({ nome: (a.nome || "").trim(), turma: (a.turma || "").trim() }))
    .filter((a) => a.nome);
  const slots = Array.from({ length: 6 }, (_, i) => filled[i] || { nome: "", turma: "" });
  const alunoLabel = lang === "fr" ? "Nom de l’élève" : "Nome do aluno";
  const turmaLabel = lang === "fr" ? "Classe" : "Turma";
  const lines = slots
    .map((a, i) => {
      const nome = a.nome ? esc(a.nome) : "_________________________________";
      const turma = a.turma ? esc(a.turma) : "____________";
      return `${i + 1}. ${alunoLabel} : ${nome} &nbsp;&nbsp; ${turmaLabel} : ${turma}`;
    })
    .join("<br/>");
  if (lang === "fr") {
    return `
  <div class="sign">
    <div class="sig">
      <strong>Le responsable légal / parent</strong><br/>
      Élèves du même responsable (1 à 6) :<br/>
      ${lines}<br/>
      Nom du responsable : ${enc || "_____________________________"}<br/>
      Date : ${data}<br/>
      Signature : _______________________________
    </div>
    <div class="sig">
      <strong>L’école (réception)</strong><br/>
      Nom : _________________________________<br/>
      Date : ____ / ____ / ________<br/>
      Signature / cachet : ___________________
    </div>
  </div>`;
  }
  return `
  <div class="sign">
    <div class="sig">
      <strong>O(A) encarregado(a) de educação</strong><br/>
      Alunos do mesmo encarregado (1 a 6) :<br/>
      ${lines}<br/>
      Nome do encarregado : ${enc || "_____________________________"}<br/>
      Data : ${data}<br/>
      Assinatura : _______________________________
    </div>
    <div class="sig">
      <strong>A escola (recepção)</strong><br/>
      Nome : _________________________________<br/>
      Data : ____ / ____ / ________<br/>
      Assinatura / carimbo : ___________________
    </div>
  </div>`;
}

/** Document HTML complet (impression / PDF). */
export function regulamentoInternoHtml(
  lang: RegulamentoLang,
  escola: EscolaMeta = {},
  ack?: Partial<RegulamentoAck>,
): string {
  const title =
    lang === "fr" ? "Règlement intérieur" : "Regulamento interno";
  const subtitle =
    lang === "fr"
      ? "À l’attention des parents et responsables légaux"
      : "Para os pais e encarregados de educação";
  const body = lang === "fr" ? contentFr(escola) : contentPt(escola);
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"/><title></title>
<style>${STYLES}</style></head><body>
<div class="sheet">
  ${headBlock(escola, title, subtitle, lang)}
  ${body}
  <div class="aviso">
    ${
      lang === "fr"
        ? "<strong>Document officiel.</strong> Conservez une copie. En cas de contradiction entre versions, la direction peut clarifier par écrit."
        : "<strong>Documento oficial.</strong> Conserve uma cópia. Em caso de dúvida entre versões, a direcção esclarece por escrito."
    }
  </div>
  ${signatureBlock(lang, ack)}
  <p class="foot">${esc(escola.nome || "École Consulaire du Congo")} · ${esc(escola.ano || "")}</p>
</div>
</body></html>`;
}

/** Lien public partageable (WhatsApp / e-mail). */
export function regulamentoPublicUrl(lang: RegulamentoLang = "pt"): string {
  if (typeof location === "undefined") return `/regulamento?lang=${lang}`;
  return `${location.origin}/regulamento?lang=${lang}`;
}

/** Link público de agendamento pedagógico (4ª/5ª 14h–16h). */
export function agendamentoPublicUrl(): string {
  if (typeof location === "undefined") return "/agendamento";
  return `${location.origin}/agendamento`;
}

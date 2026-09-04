/**
 * Règlement intérieur / Regulamento interno — École Consulaire du Congo (Brazzaville) de Luanda
 * Versions FR et PT pour remise / signature des parents.
 */

export type RegulamentoLang = "fr" | "pt";

export type RegulamentoAck = {
  alunoNome: string;
  encarregadoNome: string;
  turma?: string;
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
  table.rules th { background: #1f5c4a; color: #fff; text-align: left; font-size: 10px; }
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
    typeof location !== "undefined" ? `${location.origin}/logo-escola.jpg` : "/logo-escola.jpg";
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
    <li><strong>Tolérance d’arrivée :</strong> une marge de <strong>15 minutes</strong> est accordée après le début du premier cours du matin (<strong>7h30</strong>) et après le début du premier cours de l’après-midi (<strong>14h00</strong>). Au-delà de cette tolérance, l’élève est considéré en retard.</li>
    <li><strong>Retards :</strong> <strong>3 retards</strong> dans le même mois civil équivalent à <strong>1 absence</strong> (faute de présence).</li>
    <li><strong>Matériel scolaire :</strong> <strong>3 manquements de matériel</strong> (cahiers, livres, fournitures demandées) dans le même mois civil équivalent également à <strong>1 absence</strong> (faute de présence).</li>
    <li>Toute absence doit être justifiée par écrit (ou message) par le responsable légal, de préférence le jour même.</li>
    <li>Les absences non justifiées peuvent entraîner des mesures pédagogiques et, en cas de récidive, un entretien avec la direction.</li>
    <li><strong>Récupération des élèves :</strong> l’heure limite de prise en charge est <strong>18h00</strong>. Au-delà de 18h00, un service de garde exceptionnel peut être facturé et signalé à la direction.</li>
    <li>L’<strong>emploi du temps</strong> détaillé par cycle (préscolaire, primaire, collège) figure en <strong>annexe</strong> du présent règlement (année scolaire en cours).</li>
  </ul>

  <h2>3. Retards après 18h00</h2>
  <div class="box">
    <p><strong>Après 18h00</strong>, tout élève non récupéré reste sous la responsabilité de l’école jusqu’à l’arrivée du responsable. Une pénalité de garde peut être appliquée (montant communiqué en début d’année / affiché au secrétariat). En cas de retard répété, la direction convoque les parents.</p>
  </div>

  <h2>4. Jours fériés et dates commémoratives (République du Congo – Brazzaville)</h2>
  <p>En tant qu’établissement consulaire congolais, <strong>il n’y a pas de cours</strong> les jours fériés nationaux de la République du Congo (Brazzaville). Les dates à date fixe sont :</p>
  <table class="rules">
    <thead>
      <tr><th>Date</th><th>Commémoration</th></tr>
    </thead>
    <tbody>
      <tr><td>1<sup>er</sup> janvier</td><td>Jour de l’An</td></tr>
      <tr><td>1<sup>er</sup> mai</td><td>Fête du Travail</td></tr>
      <tr><td>10 juin</td><td>Fête de la Réconciliation</td></tr>
      <tr><td>15 août</td><td>Fête Nationale (Indépendance)</td></tr>
      <tr><td>1<sup>er</sup> novembre</td><td>Toussaint</td></tr>
      <tr><td>28 novembre</td><td>Jour de la République</td></tr>
      <tr><td>25 décembre</td><td>Noël</td></tr>
    </tbody>
  </table>
  <p>S’y ajoutent les fêtes mobiles chrétiennes observées au Congo : <strong>Lundi de Pâques</strong>, <strong>Ascension</strong> et <strong>Lundi de Pentecôte</strong> (dates variables chaque année).</p>
  <div class="box">
    <p><strong>Vacances d’août :</strong> le mois d’<strong>août</strong> est une période de <strong>vacances scolaires</strong> — <strong>il n’y a pas de cours</strong> pendant tout le mois d’août (sauf activité exceptionnelle annoncée par écrit par la direction).</p>
  </div>
  <p>La direction publie le calendrier scolaire annuel (y compris éventuels ajustements liés au calendrier local d’accueil). Un jour férié tombant un week-end ne donne pas automatiquement de report, sauf décision écrite de la direction.</p>

  <h2>5. Frais de scolarité, délais et pénalités de retard de paiement</h2>
  <p>Les frais (inscription, assurance scolaire, manuels, uniforme, cantine, transport, cours, <strong>mensualités / propinas</strong>) sont dus selon le calendrier communiqué par le Département des Finances.</p>
  <table class="rules">
    <thead>
      <tr><th>Période</th><th>Conséquence</th></tr>
    </thead>
    <tbody>
      <tr><td>Jusqu’au <strong>10</strong> du mois civil suivant le mois de facturation</td><td>Paiement sans majoration</td></tr>
      <tr><td>Du 11 au 30 du même mois</td><td><strong>Majoration de 35&nbsp;%</strong> sur le montant dû</td></tr>
      <tr><td>Jusqu’au 10 du mois suivant</td><td><strong>Majoration de 40&nbsp;%</strong> sur le montant dû</td></tr>
      <tr><td>Après cette date</td><td><strong>Suspension possible</strong> des services scolaires jusqu’à régularisation (décision de la direction)</td></tr>
    </tbody>
  </table>
  <p>Les modes de paiement acceptés : espèces (caisse), dépôt / virement compte BAI, carte Multicaixa. Un reçu ou facture est délivré par l’école.</p>

  <h2>6. Tenue vestimentaire</h2>
  <ul>
    <li>L’uniforme officiel de l’école est obligatoire les jours de cours, sauf consigne contraire de la direction.</li>
    <li>Tenue propre, correcte et adaptée à l’âge ; chaussures fermées recommandées.</li>
    <li>Interdits : vêtements provocants, messages offensants, accessoires dangereux.</li>
  </ul>

  <h2>7. Comportement et vie scolaire</h2>
  <ul>
    <li>Respect des enseignants, du personnel, des camarades et des locaux.</li>
    <li>Interdiction de violence, harcèlement, insultes, vol ou dégradation du matériel.</li>
    <li><strong>Téléphones portables :</strong> à l’entrée de l’école, le téléphone est déposé auprès de nos services. L’élève le récupère à la fin des cours. L’usage des téléphones pendant le temps de classe est strictement interdit (sauf autorisation pédagogique écrite).</li>
    <li>Les objets de valeur sont déconseillés ; l’école n’est pas responsable des pertes hors faute prouvée.</li>
  </ul>

  <h2>8. Accueil des parents / responsables (Département pédagogique)</h2>
  <div class="box">
    <p>Le Département pédagogique reçoit les parents et responsables d’éducation <strong>les samedis de 09h30 à 12h30</strong>, <strong>uniquement sur rendez-vous</strong> (créneaux de 20 minutes). Lien de prise de rendez-vous disponible auprès du secrétariat / via le portail de l’école.</p>
  </div>

  <h2>9. Santé et sécurité</h2>
  <ul>
    <li>Les allergies, groupe sanguin et clinique de proximité doivent figurer sur la fiche d’inscription.</li>
    <li>En cas d’urgence, l’école contacte les responsables et, si nécessaire, oriente vers la structure de santé indiquée.</li>
    <li>Médicaments : uniquement avec autorisation écrite des parents et consignes claires.</li>
  </ul>

  <h2>10. Canaux de signalement et réclamations</h2>
  <div class="box">
    <p>Pour toute réclamation, signalement (comportement, sécurité, harcèlement, facturation) :</p>
    <ul>
      <li>Secrétariat / Direction — sur place aux heures d’ouverture</li>
      <li>Téléphone : ${tel}</li>
      <li>E-mail : ${email}</li>
      <li>Adresse : ${morada}</li>
    </ul>
    <p>Les signalements sont traités avec confidentialité dans la mesure du possible. Les faits graves peuvent être portés aux autorités compétentes selon la loi angolaise.</p>
  </div>

  <h2>11. Protection des données personnelles</h2>
  <p>Conformément à la <strong>Loi n° 22/11 du 17 juin</strong> (Loi sur la protection des données personnelles — Angola) et sous le contrôle de l’Agence de Protection des Données (APD), l’école traite les données des élèves et des familles uniquement à des fins scolaires et de sécurité. Les parents disposent des droits d’information, d’accès, de rectification et d’opposition prévus par la loi.</p>

  <h2>12. Passage de classe et redoublement (République du Congo – Brazzaville)</h2>
  <p>Dans le système éducatif de la <strong>République du Congo (Congo-Brazzaville)</strong>, les règles de passage ou de redoublement reposent sur la <strong>moyenne générale annuelle (MGA)</strong>. L’évaluation suit le modèle francophone : échelle de <strong>0 à 10</strong> au primaire et de <strong>0 à 20</strong> au secondaire.</p>
  <h3 style="font-size:11px;margin:10px 0 4px;color:#1f5c4a;">12.1. Enseignement primaire</h3>
  <ul>
    <li><strong>Critère de redoublement :</strong> l’élève redouble si sa moyenne annuelle est <strong>inférieure à 5/10</strong>.</li>
    <li><strong>Marge de rachat :</strong> entre <strong>4,80 et 4,99</strong>, le Conseil d’établissement peut apprécier le comportement et la progression pour autoriser le passage ; à défaut, l’élève redouble.</li>
    <li>Des réformes récentes ont réduit le primaire et renforcé le contrôle continu ; la direction applique les dispositions en vigueur et communique les critères en début d’année.</li>
  </ul>
  <h3 style="font-size:11px;margin:10px 0 4px;color:#1f5c4a;">12.2. Enseignement secondaire (collège et lycée)</h3>
  <ul>
    <li><strong>Critère de redoublement :</strong> l’élève redouble si sa moyenne générale annuelle est <strong>inférieure à 10/20</strong>.</li>
    <li><strong>Marge de rachat :</strong> entre <strong>9,80 et 9,99</strong>, le conseil de classe peut autoriser le passage selon le dossier et l’assiduité ; sinon, redoublement.</li>
  </ul>
  <h3 style="font-size:11px;margin:10px 0 4px;color:#1f5c4a;">12.3. Établissements d’excellence (le cas échéant)</h3>
  <ul>
    <li>Dans les structures d’excellence ou lycées interdépartementaux, la moyenne minimale de passage peut être fixée à <strong>12/20</strong> ; en dessous, l’élève peut être réorienté vers un établissement classique plutôt que maintenu par redoublement.</li>
  </ul>
  <h3 style="font-size:11px;margin:10px 0 4px;color:#1f5c4a;">12.4. Limite de redoublements et âge</h3>
  <ul>
    <li>La scolarité obligatoire s’entend, en droit congolais, jusqu’à <strong>16 ans</strong>. L’élève peut redoubler dans cette fourchette d’âge.</li>
    <li>Des redoublements répétés dans la même classe (en principe plus de deux fois dans le même cycle) ou le dépassement de la limite d’âge pour le niveau concerné peuvent entraîner une <strong>exclusion / réorientation</strong> hors de l’enseignement régulier de l’établissement, après décision motivée de la direction et information des parents.</li>
  </ul>
  <p>À l’Annexe Nova Vida, le conseil de classe / d’établissement statue conformément à ces références et au projet pédagogique de l’école ; les décisions sont communiquées par écrit aux responsables légaux.</p>

  <h2>13. Annexe — Emploi du temps (année scolaire 2026–2027)</h2>
  <p>Horaires indicatifs. L’élève peut rester jusqu’à <strong>18h00</strong> (ATL). <strong>ATL</strong> = activités de temps libre (après les cours).</p>
  <table class="rules">
    <thead>
      <tr><th>Cycles</th><th>Cours / ATL</th><th>Jours</th><th>Horaires</th></tr>
    </thead>
    <tbody>
      <tr><td rowspan="1"><strong>Préscolaire<br/>(Maternelle)</strong></td><td>Cours en plein-temps</td><td>Du lundi au vendredi</td><td>7h30 – 18h00</td></tr>
      <tr><td rowspan="2"><strong>Primaire</strong></td><td>Cours à mi-temps (matin)</td><td>Du lundi au vendredi</td><td>7h30 – 12h30</td></tr>
      <tr><td>ATL après-midi</td><td>Du lundi au vendredi</td><td>14h00 – 18h00</td></tr>
      <tr><td rowspan="3"><strong>Secondaire 1<sup>er</sup> degré<br/>(Collège)</strong></td><td>Cours en plein-temps</td><td>Lundi et mercredi</td><td>7h30 – 18h00</td></tr>
      <tr><td>Cours à mi-temps (matin)</td><td>Mardi, jeudi et vendredi</td><td>7h30 – 12h30</td></tr>
      <tr><td>ATL après-midi</td><td>Mardi, jeudi et vendredi</td><td>14h00 – 18h00</td></tr>
    </tbody>
  </table>
  <p style="font-size:9.5px;color:#555;">Tolérance de 15 minutes après 7h30 (matin) et après 14h00 (après-midi) — voir § 2.</p>

  <h2>14. Acceptation</h2>
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

  <h2>1. Organização pedagógica (República do Congo – Brazzaville)</h2>
  <p>A École Consulaire segue o quadro de ensino da <strong>República do Congo (Brazzaville)</strong>, próximo do modelo francófono:</p>
  <ul>
    <li><strong>Pré-escolar / Maternelle</strong>: pequena, média e grande secção (preparação para o primário).</li>
    <li><strong>Primário (6 anos)</strong>: CP1, CP2, CE1, CE2, CM1, CM2 — concluído com o <strong>CEPE</strong> (Certificat d’études primaires élémentaires) / concurso de acesso ao 6.º ano.</li>
    <li><strong>Colégio (4 anos)</strong>: 6.º, 5.º, 4.º, 3.º — concluído com o <strong>BEPC</strong> (Brevet d’études du premier cycle).</li>
    <li><strong>Liceu (3 anos)</strong>: Seconde, Première, Terminale — concluído com o <strong>Baccalauréat</strong>.</li>
  </ul>
  <p>O ensino orienta-se pelos programas e calendários adaptados ao contexto consular em Luanda, em coerência com as referências da República do Congo (Brazzaville). A direcção publica anualmente as classes abertas e o calendário escolar.</p>

  <h2>2. Horários e assiduidade</h2>
  <ul>
    <li>Os alunos devem chegar a horas. Atrasos repetidos são acompanhados com a família.</li>
    <li><strong>Tolerância de chegada:</strong> é concedida uma margem de <strong>15 minutos</strong> após o início do primeiro tempo da manhã (<strong>7h30</strong>) e após o início do primeiro tempo da tarde (<strong>14h00</strong>). Para além desta tolerância, o aluno é considerado em atraso.</li>
    <li><strong>Atrasos:</strong> <strong>3 atrasos</strong> no mesmo mês civil equivalem a <strong>1 falta de presença</strong>.</li>
    <li><strong>Material escolar:</strong> <strong>3 faltas de material</strong> (cadernos, livros, material pedido) no mesmo mês civil equivalem também a <strong>1 falta de presença</strong>.</li>
    <li>Qualquer falta deve ser justificada por escrito (ou mensagem) pelo encarregado de educação, de preferência no próprio dia.</li>
    <li>Faltas não justificadas podem originar medidas pedagógicas e, em reincidência, reunião com a direcção.</li>
    <li><strong>Recolha dos alunos:</strong> o horário limite de saída / recolha é <strong>18h00</strong>. Após as 18h00, pode ser aplicado serviço de guarda excepcional e comunicação à direcção.</li>
    <li>O <strong>horário escolar</strong> detalhado por ciclo (pré-escolar, primário, colégio) figura em <strong>anexo</strong> ao presente regulamento (ano lectivo em curso).</li>
  </ul>

  <h2>3. Atrasos depois das 18h00</h2>
  <div class="box">
    <p><strong>Após as 18h00</strong>, qualquer aluno não recolhido permanece sob responsabilidade da escola até à chegada do responsável. Pode ser aplicada uma penalização de guarda (valor comunicado no início do ano / afixado na secretaria). Em caso de atraso reiterado, a direcção convoca os pais.</p>
  </div>

  <h2>4. Feriados e datas comemorativas (República do Congo – Brazzaville)</h2>
  <p>Enquanto estabelecimento consular congolês, <strong>não há aulas</strong> nos feriados nacionais da República do Congo (Brazzaville). Datas fixas:</p>
  <table class="rules">
    <thead>
      <tr><th>Data</th><th>Comemoração</th></tr>
    </thead>
    <tbody>
      <tr><td>1 de janeiro</td><td>Ano Novo</td></tr>
      <tr><td>1 de maio</td><td>Dia do Trabalho</td></tr>
      <tr><td>10 de junho</td><td>Festa da Reconciliação</td></tr>
      <tr><td>15 de agosto</td><td>Festa Nacional (Independência)</td></tr>
      <tr><td>1 de novembro</td><td>Todos os Santos</td></tr>
      <tr><td>28 de novembro</td><td>Dia da República</td></tr>
      <tr><td>25 de dezembro</td><td>Natal</td></tr>
    </tbody>
  </table>
  <p>Acrescem as festas móveis cristãs observadas no Congo: <strong>Segunda-feira de Páscoa</strong>, <strong>Ascensão</strong> e <strong>Segunda-feira de Pentecostes</strong> (datas variáveis em cada ano).</p>
  <div class="box">
    <p><strong>Férias de agosto:</strong> o mês de <strong>agosto</strong> é período de <strong>férias escolares</strong> — <strong>não há aulas</strong> durante todo o mês de agosto (salvo actividade excepcional anunciada por escrito pela direcção).</p>
  </div>
  <p>A direcção publica o calendário escolar anual (incluindo eventuais ajustes ligados ao calendário local de acolhimento). Feriado que caia em fim de semana não implica, por si, dia de compensação, salvo decisão escrita da direcção.</p>

  <h2>5. Propinas, prazos e multas por atraso de pagamento</h2>
  <p>Os encargos (inscrição, seguro escolar, manuais, uniforme, cantina, transporte, cursos, <strong>mensalidades / propinas</strong>) são devidos segundo o calendário do Departamento de Finanças.</p>
  <table class="rules">
    <thead>
      <tr><th>Período</th><th>Consequência</th></tr>
    </thead>
    <tbody>
      <tr><td>Até ao dia <strong>10</strong> do mês civil seguinte ao da fatura</td><td>Pagamento sem majoração</td></tr>
      <tr><td>Do dia 11 ao dia 30 do mesmo mês</td><td><strong>Multa de 35&nbsp;%</strong> sobre o valor em dívida</td></tr>
      <tr><td>Até ao dia 10 do mês seguinte</td><td><strong>Multa de 40&nbsp;%</strong> sobre o valor em dívida</td></tr>
      <tr><td>Após essa data</td><td><strong>Suspensão possível</strong> dos serviços escolares até regularização (decisão da direcção)</td></tr>
    </tbody>
  </table>
  <p>Formas de pagamento: dinheiro (caixa), depósito / transferência conta BAI, cartão Multicaixa. A escola emite recibo ou fatura.</p>

  <h2>6. Vestuário</h2>
  <ul>
    <li>O uniforme oficial da escola é obrigatório nos dias de aulas, salvo indicação em contrário da direcção.</li>
    <li>Roupa limpa, adequada e própria à idade; calçado fechado recomendado.</li>
    <li>Proibido: vestuário provocador, mensagens ofensivas, acessórios perigosos.</li>
  </ul>

  <h2>7. Comportamento e vida escolar</h2>
  <ul>
    <li>Respeito por professores, funcionários, colegas e instalações.</li>
    <li>Proibida violência, assédio, insultos, furto ou danificação de material.</li>
    <li><strong>Telemóveis:</strong> na entrada da escola o telemóvel é depositado com os nossos serviços; o aluno recolhe-o no final das aulas. O uso dos telemóveis durante o tempo de aulas é proibido (salvo autorização pedagógica escrita).</li>
    <li>Objectos de valor são desaconselhados; a escola não se responsabiliza por perdas sem culpa comprovada.</li>
  </ul>

  <h2>8. Atendimento aos encarregados de educação (Departamento pedagógico)</h2>
  <div class="box">
    <p>O Departamento pedagógico atende os encarregados de educação <strong>aos sábados, das 09:30 às 12:30</strong>, <strong>apenas por agendamento</strong> (slots de 20 minutos). O link de marcação está disponível na secretaria / no portal da escola.</p>
  </div>

  <h2>9. Saúde e segurança</h2>
  <ul>
    <li>Alergias, grupo sanguíneo e clínica mais próxima devem constar da ficha de matrícula.</li>
    <li>Em emergência, a escola contacta os responsáveis e, se necessário, orienta para a estrutura de saúde indicada.</li>
    <li>Medicamentos: apenas com autorização escrita dos pais e instruções claras.</li>
  </ul>

  <h2>10. Canais de denúncia e reclamações</h2>
  <div class="box">
    <p>Para reclamação ou denúncia (comportamento, segurança, assédio, facturação):</p>
    <ul>
      <li>Secretaria / Direcção — presencialmente no horário de atendimento</li>
      <li>Telefone: ${tel}</li>
      <li>E-mail: ${email}</li>
      <li>Morada: ${morada}</li>
    </ul>
    <p>Os relatos são tratados com a confidencialidade possível. Factos graves podem ser comunicados às autoridades competentes, nos termos da lei angolana.</p>
  </div>

  <h2>11. Protecção de dados pessoais</h2>
  <p>Nos termos da <strong>Lei n.º 22/11, de 17 de Junho</strong> (Lei da Protecção de Dados Pessoais — Angola) e sob fiscalização da Agência de Protecção de Dados (APD), a escola trata os dados dos alunos e famílias apenas para fins escolares e de segurança. Os encarregados dispõem dos direitos de informação, acesso, rectificação e oposição previstos na lei.</p>

  <h2>12. Passagem de ano e chumbo / redoublement (República do Congo – Brazzaville)</h2>
  <p>No sistema educativo da <strong>República do Congo (Congo-Brazzaville)</strong>, as regras de passagem ou de chumbo do ano lectivo baseiam-se na <strong>média geral anual (MGA — Moyenne Générale Annuelle)</strong>. A avaliação segue o modelo francófono: escala de <strong>0 a 10</strong> no primário e de <strong>0 a 20</strong> no secundário.</p>
  <h3 style="font-size:11px;margin:10px 0 4px;color:#1f5c4a;">12.1. Ensino primário</h3>
  <ul>
    <li><strong>Critério de chumbo:</strong> o aluno chumba o ano se a média anual for <strong>inferior a 5/10</strong>.</li>
    <li><strong>Margem de resgate (rachat):</strong> entre <strong>4,80 e 4,99</strong>, o Conselho de Escola (Conseil d’établissement) pode avaliar o comportamento e a evolução para autorizar a passagem; caso contrário, o aluno chumba.</li>
    <li>Reformas recentes reduziram a duração do primário e reforçaram o controlo contínuo; a direcção aplica as regras em vigor e comunica os critérios no início do ano.</li>
  </ul>
  <h3 style="font-size:11px;margin:10px 0 4px;color:#1f5c4a;">12.2. Ensino secundário (colégio e liceu)</h3>
  <ul>
    <li><strong>Critério de chumbo:</strong> o aluno chumba o ano se a média geral anual for <strong>inferior a 10/20</strong>.</li>
    <li><strong>Margem de resgate:</strong> entre <strong>9,80 e 9,99</strong>, o conselho de turma pode autorizar a passagem conforme o historial e a assiduidade; caso contrário, há repetição de ano.</li>
  </ul>
  <h3 style="font-size:11px;margin:10px 0 4px;color:#1f5c4a;">12.3. Escolas de excelência (quando aplicável)</h3>
  <ul>
    <li>Em estruturas de excelência ou liceus interdepartamentais, a média mínima de passagem pode ser de <strong>12/20</strong>; abaixo deste valor, o aluno pode ser reorientado para um estabelecimento clássico, em vez de permanecer por chumbo.</li>
  </ul>
  <h3 style="font-size:11px;margin:10px 0 4px;color:#1f5c4a;">12.4. Limite de repetições e idade</h3>
  <ul>
    <li>A escolaridade obrigatória, no direito congolês, estende-se em regra até aos <strong>16 anos</strong>. O aluno pode repetir o ano dentro desta faixa etária.</li>
    <li>Chumbos repetidos na mesma classe (em princípio mais de duas vezes no mesmo ciclo) ou o ultrapassar do limite de idade do nível podem originar <strong>exclusão / reorientação</strong> fora do ensino regular do estabelecimento, após decisão fundamentada da direcção e informação aos encarregados.</li>
  </ul>
  <p>No Anexo Nova Vida, o conselho de turma / de estabelecimento delibera segundo estas referências e o projecto pedagógico da escola; as decisões são comunicadas por escrito aos encarregados de educação.</p>

  <h2>13. Anexo — Horário escolar (ano lectivo 2026–2027)</h2>
  <p>Horários indicativos. O aluno pode permanecer até às <strong>18h00</strong> (ATL). <strong>ATL</strong> = Actividades de Tempos Livres (após as aulas).</p>
  <table class="rules">
    <thead>
      <tr><th>Ciclos</th><th>Aulas / ATL</th><th>Dias</th><th>Horários</th></tr>
    </thead>
    <tbody>
      <tr><td rowspan="1"><strong>Pré-escolar<br/>(Maternelle)</strong></td><td>Aulas a tempo inteiro</td><td>De segunda a sexta-feira</td><td>7h30 – 18h00</td></tr>
      <tr><td rowspan="2"><strong>1.º ciclo<br/>(Primário)</strong></td><td>Aulas a meio tempo (manhã)</td><td>De segunda a sexta-feira</td><td>7h30 – 12h30</td></tr>
      <tr><td>ATL da tarde</td><td>De segunda a sexta-feira</td><td>14h00 – 18h00</td></tr>
      <tr><td rowspan="3"><strong>Ensino secundário<br/>1.º grau (Colégio)</strong></td><td>Aulas a tempo inteiro</td><td>Segunda e quarta-feira</td><td>7h30 – 18h00</td></tr>
      <tr><td>Aulas a meio tempo (manhã)</td><td>Terça, quinta e sexta-feira</td><td>7h30 – 12h30</td></tr>
      <tr><td>ATL da tarde</td><td>Terça, quinta e sexta-feira</td><td>14h00 – 18h00</td></tr>
    </tbody>
  </table>
  <p style="font-size:9.5px;color:#555;">Tolerância de 15 minutos após as 7h30 (manhã) e após as 14h00 (tarde) — ver § 2.</p>

  <h2>14. Aceitação</h2>
  <p>A assinatura deste regulamento (ou a aceitação através do link oficial da escola) implica a tomada de conhecimento e o compromisso de o respeitar no ano lectivo em curso.</p>
`;
}

function signatureBlock(
  lang: RegulamentoLang,
  ack?: Partial<RegulamentoAck>,
): string {
  const aluno = esc(ack?.alunoNome || "");
  const enc = esc(ack?.encarregadoNome || "");
  const data = ack?.signedAt
    ? new Date(ack.signedAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "pt-PT")
    : "____ / ____ / ________";
  if (lang === "fr") {
    return `
  <div class="sign">
    <div class="sig">
      <strong>Le responsable légal / parent</strong><br/>
      Nom de l’élève : ${aluno || "_________________________________"}<br/>
      Nom du responsable : ${enc || "_____________________________"}<br/>
      ${ack?.turma ? `Classe : ${esc(ack.turma)}<br/>` : ""}Date : ${data}<br/>
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
      Nome do aluno : ${aluno || "_________________________________"}<br/>
      Nome do encarregado : ${enc || "_____________________________"}<br/>
      ${ack?.turma ? `Turma : ${esc(ack.turma)}<br/>` : ""}Data : ${data}<br/>
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

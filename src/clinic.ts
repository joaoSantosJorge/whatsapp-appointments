// Fictional clinic used for the demo. Everything here is made up.

export interface Service {
  id: string;
  name: string;
  durationMin: number;
  price: string;
  description: string;
}

export interface Specialty {
  id: string;
  name: string;
  dentist: string;
  // Google Calendar event colorId ("1"–"11")
  colorId: string;
  whenToBook: string;
  services: Service[];
}

// Weekday (0 = Sunday) → opening intervals in local time
export const OPENING_HOURS: Record<number, [string, string][]> = {
  0: [],
  1: [["09:00", "13:00"], ["14:00", "19:00"]],
  2: [["09:00", "13:00"], ["14:00", "19:00"]],
  3: [["09:00", "13:00"], ["14:00", "19:00"]],
  4: [["09:00", "13:00"], ["14:00", "19:00"]],
  5: [["09:00", "13:00"], ["14:00", "19:00"]],
  6: [["09:00", "13:00"]],
};

// Portuguese national holidays (clinic closed)
export const HOLIDAYS = [
  "2026-01-01", "2026-04-03", "2026-04-05", "2026-04-25", "2026-05-01", "2026-06-04",
  "2026-06-10", "2026-08-15", "2026-10-05", "2026-11-01", "2026-12-01", "2026-12-08", "2026-12-25",
  "2027-01-01", "2027-03-26", "2027-03-28", "2027-04-25", "2027-05-01", "2027-05-27",
  "2027-06-10", "2027-08-15", "2027-10-05", "2027-11-01", "2027-12-01", "2027-12-08", "2027-12-25",
];

export const SPECIALTIES: Specialty[] = [
  {
    id: "urgencia",
    name: "Urgência Dentária",
    dentist: "Dr. Miguel Antunes",
    colorId: "11", // red
    whenToBook: "Dor de dentes forte, inchaço, dente partido, abcesso, trauma, restauração/coroa que caiu.",
    services: [
      { id: "urgencia-consulta", name: "Consulta de Urgência", durationMin: 30, price: "45 €", description: "Avaliação e alívio imediato da dor, com raio-X incluído. Vagas reservadas no próprio dia." },
    ],
  },
  {
    id: "geral",
    name: "Medicina Dentária Geral",
    dentist: "Dra. Inês Carvalho",
    colorId: "9", // blue
    whenToBook: "Primeira visita, check-up anual, avaliação geral, dúvidas sem dor aguda.",
    services: [
      { id: "geral-primeira", name: "Primeira Consulta + Plano de Tratamento", durationMin: 45, price: "35 € (inclui raio-X panorâmico)", description: "Avaliação completa com scanner intraoral 3D e plano de tratamento personalizado." },
      { id: "geral-checkup", name: "Consulta de Rotina / Check-up", durationMin: 30, price: "30 €", description: "Revisão periódica recomendada a cada 6–12 meses." },
    ],
  },
  {
    id: "higiene",
    name: "Higiene Oral",
    dentist: "Hig. Sofia Martins",
    colorId: "2", // green
    whenToBook: "Limpeza, destartarização, manchas, mau hálito, prevenção.",
    services: [
      { id: "higiene-limpeza", name: "Limpeza e Destartarização", durationMin: 45, price: "50 €", description: "Remoção de tártaro e placa, polimento e aconselhamento." },
      { id: "higiene-airflow", name: "Limpeza Premium Airflow", durationMin: 60, price: "70 €", description: "Limpeza com jato de ar e pó fino que remove manchas de café, chá e tabaco." },
    ],
  },
  {
    id: "dentisteria",
    name: "Dentisteria Conservadora",
    dentist: "Dra. Inês Carvalho",
    colorId: "7", // cyan
    whenToBook: "Cáries, restaurações (\"chumbos\"), sensibilidade leve.",
    services: [
      { id: "dentisteria-restauracao", name: "Restauração (Obturação) em Resina", durationMin: 45, price: "55–80 €", description: "Tratamento de cárie com resina estética da cor do dente." },
    ],
  },
  {
    id: "endodontia",
    name: "Endodontia",
    dentist: "Dr. Ricardo Lopes",
    colorId: "6", // orange
    whenToBook: "Desvitalização / tratamento de canal, dor que acorda à noite, sensibilidade prolongada ao quente.",
    services: [
      { id: "endo-avaliacao", name: "Avaliação Endodôntica", durationMin: 30, price: "40 €", description: "Diagnóstico com raio-X e testes de vitalidade." },
      { id: "endo-tratamento", name: "Tratamento de Canal (Desvitalização)", durationMin: 90, price: "150–280 €", description: "Realizado com microscópio e anestesia; normalmente 1–2 sessões." },
    ],
  },
  {
    id: "periodontologia",
    name: "Periodontologia",
    dentist: "Dra. Catarina Faria",
    colorId: "10", // basil green
    whenToBook: "Gengivas que sangram, recessão gengival, dentes com mobilidade, mau hálito persistente.",
    services: [
      { id: "perio-avaliacao", name: "Avaliação Periodontal", durationMin: 45, price: "45 €", description: "Periodontograma completo e plano de tratamento das gengivas." },
      { id: "perio-alisamento", name: "Tratamento Periodontal (Alisamento Radicular)", durationMin: 60, price: "90 € por quadrante", description: "Limpeza profunda abaixo da gengiva." },
    ],
  },
  {
    id: "ortodontia",
    name: "Ortodontia",
    dentist: "Dra. Mariana Sousa",
    colorId: "3", // purple
    whenToBook: "Dentes tortos, aparelho fixo, alinhadores invisíveis, mordida desalinhada (adultos e crianças).",
    services: [
      { id: "orto-alinhadores", name: "Consulta de Alinhadores Invisíveis", durationMin: 45, price: "Gratuita", description: "Scanner 3D e simulação digital do sorriso final na própria consulta." },
      { id: "orto-consulta", name: "Consulta de Ortodontia (aparelho fixo)", durationMin: 45, price: "40 €", description: "Estudo ortodôntico com fotografias e raio-X." },
    ],
  },
  {
    id: "implantologia",
    name: "Implantologia",
    dentist: "Dr. Tiago Pereira",
    colorId: "5", // yellow
    whenToBook: "Falta de dentes, substituir dentaduras, implantes.",
    services: [
      { id: "implante-avaliacao", name: "Avaliação para Implantes (com TAC 3D)", durationMin: 60, price: "60 € (descontado no tratamento)", description: "Planeamento digital guiado. Implante unitário desde 750 €." },
    ],
  },
  {
    id: "prostodontia",
    name: "Prostodontia / Reabilitação Oral",
    dentist: "Dr. Tiago Pereira",
    colorId: "4", // flamingo
    whenToBook: "Coroas, pontes, próteses removíveis, dentaduras.",
    services: [
      { id: "proto-consulta", name: "Consulta de Reabilitação Oral", durationMin: 45, price: "40 €", description: "Avaliação para coroas em zircónia, pontes ou próteses." },
    ],
  },
  {
    id: "estetica",
    name: "Estética Dentária",
    dentist: "Dra. Mariana Sousa",
    colorId: "1", // lavender
    whenToBook: "Branqueamento, facetas, design de sorriso.",
    services: [
      { id: "estetica-branqueamento", name: "Branqueamento em Consultório", durationMin: 90, price: "290 €", description: "Sessão única com luz LED, até 8 tons mais claro." },
      { id: "estetica-facetas", name: "Consulta de Facetas / Design de Sorriso", durationMin: 45, price: "Gratuita", description: "Digital Smile Design com mock-up para ver o resultado antes de começar." },
    ],
  },
  {
    id: "cirurgia",
    name: "Cirurgia Oral",
    dentist: "Dr. Miguel Antunes",
    colorId: "8", // graphite
    whenToBook: "Dentes do siso, extrações, quistos, cirurgias pequenas.",
    services: [
      { id: "cirurgia-avaliacao", name: "Avaliação Cirúrgica (Sisos / Extrações)", durationMin: 30, price: "40 €", description: "Inclui raio-X panorâmico. Opção de sedação consciente." },
      { id: "cirurgia-extracao", name: "Extração Simples", durationMin: 45, price: "60–90 €", description: "Extração com anestesia local." },
    ],
  },
  {
    id: "odontopediatria",
    name: "Odontopediatria",
    dentist: "Dra. Joana Ribeiro",
    colorId: "2",
    whenToBook: "Crianças até aos 14 anos: primeira consulta, cáries de leite, selantes, medo do dentista.",
    services: [
      { id: "pediatria-consulta", name: "Consulta Infantil", durationMin: 30, price: "30 € (gratuita com cheque-dentista)", description: "Ambiente lúdico, com sala de espera para crianças. Aceitamos cheque-dentista." },
    ],
  },
  {
    id: "atm",
    name: "Oclusão e ATM",
    dentist: "Dr. Ricardo Lopes",
    colorId: "6",
    whenToBook: "Bruxismo (ranger os dentes), dor no maxilar, estalidos ao abrir a boca, dores de cabeça matinais.",
    services: [
      { id: "atm-avaliacao", name: "Avaliação de ATM / Bruxismo", durationMin: 45, price: "50 €", description: "Análise da mordida e articulação. Goteira noturna personalizada desde 180 €." },
    ],
  },
];

export const CLINIC = {
  name: "Clínica Dentária Sorriso Atlântico",
  tagline: "Medicina dentária digital, sem pressas e sem dor.",
  address: "Av. da Liberdade 245, 2.º andar, 1250-143 Lisboa",
  phone: "+351 213 000 245",
  email: "geral@sorrisoatlantico.pt",
  directions: "Metro Avenida (linha azul) a 2 minutos a pé. Parque de estacionamento Marquês de Pombal a 300 m (1.ª hora oferecida aos pacientes).",
  openingHours: "Segunda a sexta: 09:00–13:00 e 14:00–19:00. Sábado: 09:00–13:00. Domingos e feriados: encerrado.",
  differentiators: [
    "Urgências no próprio dia, com vagas reservadas todos os dias",
    "Scanner intraoral 3D (sem moldes desconfortáveis) e TAC 3D na clínica",
    "Sedação consciente para pacientes com medo do dentista",
    "Primeira consulta de alinhadores invisíveis e de facetas gratuita",
    "Planos de pagamento em até 12 meses sem juros (tratamentos acima de 500 €)",
    "Equipa de especialistas numa só clínica",
  ],
  insurance: "Acordos com Médis, Multicare, AdvanceCare, SAMS e Allianz. Aceitamos cheque-dentista (SNS) em Odontopediatria.",
  payment: "Multibanco, MB WAY, cartão de crédito/débito e numerário.",
  cancellationPolicy: "Pedimos que desmarque ou altere com pelo menos 24 horas de antecedência.",
  accessibility: "Edifício com elevador e acesso para cadeira de rodas.",
  languages: "Português, inglês, espanhol e francês.",
  specialties: SPECIALTIES,
};

export function findService(serviceId: string): { specialty: Specialty; service: Service } | undefined {
  for (const specialty of SPECIALTIES) {
    const service = specialty.services.find((s) => s.id === serviceId);
    if (service) return { specialty, service };
  }
  return undefined;
}

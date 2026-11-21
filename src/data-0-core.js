/* 공통 사전: 말실수 유형, 주제, 전공 */
window.SIMTALK_DATA = window.SIMTALK_DATA || {};

SIMTALK_DATA.META = { asOf: '2026년 11월', version: '1.0.0' };

SIMTALK_DATA.TOPICS = {
  abuse: '아동학대', violence: '학교폭력', guidance: '생활지도', grade: '평가·생기부', privacy: '개인정보',
  safety: '안전사고', sex: '성 사안', crisis: '자살·자해 위기', complaint: '민원 대응', gift: '금품·청탁',
  boundary: '사적 경계', special: '특수교육', neutral: '정치 중립'
};

SIMTALK_DATA.MAJORS = [
  { k: '초등담임', levels: ['초'] },
  { k: '국어', levels: ['중', '고'] },
  { k: '영어', levels: ['중', '고'] },
  { k: '수학', levels: ['중', '고'] },
  { k: '사회·역사', levels: ['중', '고'] },
  { k: '과학', levels: ['중', '고'] },
  { k: '체육', levels: ['초', '중', '고'] },
  { k: '음악·미술', levels: ['초', '중', '고'] },
  { k: '정보·기술', levels: ['중', '고'] },
  { k: '특수', levels: ['초', '중', '고'] },
  { k: '상담·보건', levels: ['초', '중', '고'] }
];

/* ax: 리포트 역량 축(legal 법적 안전 / empathy 공감·경청 / process 절차 준수 / boundary 경계·중립)
   sev: 직접 입력 분석에서 이 유형이 잡혔을 때의 기본 등급 */
SIMTALK_DATA.TAGS = {
  secret: { label: '비밀보장 절대 약속', ax: 'legal', sev: 'risk', laws: ['ca10', 'sv20', 'yp34'],
    why: '학대·학교폭력·성 사안을 알게 된 교사에게는 법정 신고 의무가 있어 “비밀을 지키겠다”는 약속은 지킬 수 없는 약속입니다. 지키면 법을 어기고, 깨면 신뢰를 잃습니다.' },
  guarantee: { label: '결과 단정·보장', ax: 'process', sev: 'risk', laws: ['sv17'],
    why: '조치 결과는 심의위원회, 학교장, 수사기관이 정합니다. 교사가 결과를 약속하면 그대로 되지 않았을 때 “선생님이 약속했다”는 민원과 분쟁의 근거가 됩니다.' },
  blame: { label: '성급한 단정·탓하기', ax: 'boundary', sev: 'risk', laws: ['sv-inv', 'crim307'],
    why: '확인하기 전에 누구 잘못인지 단정하거나 피해를 말한 사람에게 원인을 돌리면 중립이 무너지고 2차 가해, 명예훼손 문제로 이어질 수 있습니다.' },
  privacy: { label: '타인 개인정보 누설', ax: 'legal', sev: 'risk', laws: ['pipa18', 'sv21'],
    why: '다른 학생과 보호자의 연락처, 건강·가정 정보, 조치 내용을 알려 주는 것은 개인정보 보호법과 학교폭력예방법의 비밀누설 금지에 걸립니다.' },
  demean: { label: '비하·모욕 발언', ax: 'legal', sev: 'risk', laws: ['cw17', 'c-busan', 'c-emotional'],
    why: '학생의 인격을 깎아내리는 말은 정서적 학대로 신고될 수 있습니다. 행동은 지적하되 사람을 평가하지 않는 문장으로 바꿔야 합니다.' },
  threat: { label: '불이익 암시·위협', ax: 'legal', sev: 'risk', laws: ['cw17'],
    why: '성적, 생기부, 진학 불이익을 암시하는 말은 위협으로 받아들여지고 정서적 학대 신고로 이어질 수 있습니다.' },
  discriminate: { label: '비교·차별 발언', ax: 'boundary', sev: 'risk', laws: ['cw17', 'special'],
    why: '다른 학생과의 비교, 가정환경·장애·성별을 이유로 한 말은 차별이자 정서적 학대 소지가 있습니다.' },
  sexual: { label: '외모·성적 언급', ax: 'boundary', sev: 'risk', laws: ['c-sexabuse', 'cw17'],
    why: '외모, 신체, 이성 관계에 대한 말은 의도와 무관하게 성희롱으로 판단될 수 있습니다.' },
  private: { label: '사적 연락·경계 붕괴', ax: 'boundary', sev: 'warn', laws: ['m-policy', 'notice-counsel'],
    why: '개인 번호와 SNS로 이어지는 사적 소통은 오해와 민원의 출발점입니다. 학교 공식 채널과 근무시간 안에서 소통하세요.' },
  coverup: { label: '은폐·축소·화해 종용', ax: 'process', sev: 'risk', laws: ['sv20', 'sv-cover'],
    why: '학교폭력을 “애들 장난”으로 줄이거나 신고를 말리는 말은 축소·은폐로 평가되어 징계 사유가 됩니다.' },
  emotional: { label: '감정적 맞대응', ax: 'empathy', sev: 'risk', laws: ['m-complaint', 'notice-counsel'],
    why: '“고소하세요” 같은 맞대응은 녹음되어 그대로 증거가 됩니다. 폭언이 계속되면 상담 중단을 알리고 관리자에게 넘기는 것이 규정상 절차입니다.' },
  parentblame: { label: '보호자 탓하기', ax: 'empathy', sev: 'risk', laws: ['m-complaint', 'crim307'],
    why: '가정 탓으로 들리는 말은 상담을 싸움으로 바꾸고 모욕 시비를 부릅니다. 가정에서 관찰한 것을 묻는 질문으로 바꾸세요.' },
  diagnose: { label: '진단 단정', ax: 'boundary', sev: 'risk', laws: ['ese18-5', 'n-psych'],
    why: '교사는 진단할 수 없습니다. 상담과 치료 권고도 학교장이 전문가 의견을 들어 하는 절차로 정해져 있습니다. 병명을 단정하면 낙인과 분쟁을 부릅니다.' },
  gift: { label: '금품·선물 수수', ax: 'legal', sev: 'risk', laws: ['graft8'],
    why: '학생을 평가하고 지도하는 교사는 금액과 관계없이 학부모의 선물을 받을 수 없습니다.' },
  favor: { label: '평가 특혜 약속', ax: 'process', sev: 'risk', laws: ['record', 'grade-appeal'],
    why: '성적, 세특, 생기부를 고쳐 주겠다는 말은 허위 기재와 업무방해로 이어질 수 있습니다. 정정은 정해진 절차로만 가능합니다.' },
  force: { label: '사과 강요·체벌 암시', ax: 'legal', sev: 'risk', laws: ['ese-d40-3', 'notice-discipline'],
    why: '신체에 고통을 주는 방법은 금지되어 있고, 강제로 시킨 사과는 인권 침해 논란과 2차 갈등을 부릅니다.' },
  legaljudge: { label: '법적 판단 단정', ax: 'process', sev: 'risk', laws: ['sv-inv', 'sv13-2'],
    why: '학교폭력이나 아동학대에 해당하는지는 교사가 판단할 사항이 아닙니다. “맞다, 아니다”를 단정하면 축소·은폐와 낙인 양쪽의 위험이 모두 생깁니다.' },
  admit: { label: '섣부른 책임 인정', ax: 'legal', sev: 'risk', laws: ['safety', 'safety-immune'],
    why: '유감 표명과 법적 책임 인정은 다릅니다. 사실관계가 확인되기 전에 “전부 제 책임”이라고 하면 이후 분쟁에서 불리한 진술이 됩니다.' },
  lead: { label: '유도·반복 질문', ax: 'process', sev: 'warn', laws: ['ca-guide'],
    why: '답을 정해 놓고 묻는 질문은 아이의 진술을 오염시켜 이후 조사에서 증거 가치를 떨어뜨립니다. 열린 질문으로 듣고 들은 그대로 기록하세요.' },
  evidence: { label: '증거 훼손·부적절한 수집', ax: 'legal', sev: 'risk', laws: ['sex14-2', 'cpa3'],
    why: '불법 촬영물이나 합성물을 교사가 전달받아 보관하면 그 자체가 문제가 될 수 있고, 대화 당사자의 녹음을 막을 법적 근거도 없습니다.' },
  politics: { label: '정치·종교 편향', ax: 'boundary', sev: 'risk', laws: ['neutral6'],
    why: '교육은 정치적·종교적으로 중립이어야 하며, 특정 정당이나 견해를 지지하거나 반대하는 발언은 징계 사유가 됩니다.' },
  alone: { label: '혼자 떠안기', ax: 'process', sev: 'warn', laws: ['sv20', 'complaint-law'],
    why: '사안을 혼자 처리하려 하면 보고와 신고 시한을 놓치고 책임이 개인에게 쏠립니다. 관리자, 전담기구와 바로 공유하세요.' },
  delay: { label: '보고·신고 지연', ax: 'process', sev: 'risk', laws: ['ca10', 'sv20', 'n-yangsan'],
    why: '신고 의무는 알게 되거나 의심이 든 즉시 생깁니다. “확인하고 나서”, “본인이 원할 때”는 모두 지연입니다.' },
  side: { label: '한쪽 편들기', ax: 'boundary', sev: 'warn', laws: ['sv-inv'],
    why: '조사 전에 어느 한쪽 편을 드는 말은 중립을 무너뜨리고, 결과가 다르게 나오면 “선생님도 그렇게 말했다”는 근거로 쓰입니다.' },
  cold: { label: '공감 없는 사무적 응대', ax: 'empathy', sev: 'warn', laws: [],
    why: '법적으로 틀리지 않아도 감정을 받아 주지 않으면 상대는 무시당했다고 느끼고 민원으로 이어집니다.' },
  dodge: { label: '책임 회피·떠넘기기', ax: 'empathy', sev: 'warn', laws: ['m-complaint'],
    why: '“제 소관이 아닙니다”는 사실이어도 상대를 돌려보내는 말입니다. 누가 언제까지 답할지를 함께 알려야 합니다.' },
  silence: { label: '무응답', ax: 'empathy', sev: 'warn', laws: ['m-complaint'],
    why: '침묵은 회피로 읽힙니다. 즉답이 어려우면 확인 후 연락하겠다고 시한을 말하세요.' }
};

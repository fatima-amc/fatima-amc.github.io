// CRI(지속정맥주입) 계산기
//
// 계산 방식 요약
// - perMin_mg : 용량 단위가 μg/kg/min, 농도 단위가 mg/ml인 약물 (예: Dobutamine)
// - perHr_mg  : 용량 단위가 mg/kg/hr, 농도 단위가 mg/ml인 약물 (예: Furosemide)
// - perMin_units : 용량 단위가 mU/kg/min, 농도 단위가 IU/ml인 약물 (Vasopressin 전용)
// - targetConc : 체중과 무관하게 "수액 내 목표 농도"를 맞추는 방식 (KCl 전용)
// - bicarbonate : Base Excess 기반 보정량 계산 (NaHCO3 전용)
//
// 모든 계산은 "총 요구 용량 = 목표 유지 시간(수액량÷주입속도) 동안 필요한 약물의 총량" 을
// 구한 뒤, 그 약물의 재고 농도로 나눠서 넣어야 할 부피(ml)를 구하는 방식입니다.

export const DRUG_GROUPS = [
  {
    id: "cardio",
    label: "심혈관계 (Cardiovascular)",
    accent: "#B5544A",
    drugs: [
      {
        id: "dobutamine",
        name: "Dobutamine",
        type: "perMin_mg",
        badge: "개: 5~20 μg/kg/min · 고양이: 1~5 μg/kg/min",
        defaultConc: 50,
        concLabel: "mg/ml",
        defaultDose: 5,
        doseLabel: "용량 (μg/kg/min)",
        defaultVolume: 50,
        defaultRate: 5,
      },
      {
        id: "norepinephrine",
        name: "Norepinephrine",
        type: "perMin_mg",
        badge: "0.05~2 μg/kg/min",
        defaultConc: 1,
        concLabel: "mg/ml",
        defaultDose: 0.1,
        doseLabel: "용량 (μg/kg/min)",
        defaultVolume: 50,
        defaultRate: 5,
      },
      {
        id: "vasopressin",
        name: "Vasopressin",
        type: "perMin_units",
        badge: "0.5~4 mU/kg/min · 최대 0.04 U/min 초과 금지",
        defaultConc: 20,
        concLabel: "IU/ml",
        defaultDose: 0.5,
        doseLabel: "용량 (mU/kg/min)",
        defaultVolume: 50,
        defaultRate: 5,
      },
      {
        id: "nitroprusside",
        name: "Nitroprusside",
        type: "perMin_mg",
        badge: "1~10 μg/kg/min · CRI만(볼루스 금지) · 차광 필수 · 최대 24시간",
        defaultConc: 25,
        concLabel: "mg/ml",
        defaultDose: 1,
        doseLabel: "용량 (μg/kg/min)",
        defaultVolume: 100,
        defaultRate: 5,
      },
    ],
  },
  {
    id: "diuretics",
    label: "이뇨제 / 전해질 (Diuretics / Electrolytes)",
    accent: "#2E7FA8",
    drugs: [
      {
        id: "furosemide",
        name: "Furosemide",
        type: "perHr_mg",
        badge: "0.2~1 mg/kg/hr",
        defaultConc: 10,
        concLabel: "mg/ml",
        defaultDose: 0.5,
        doseLabel: "용량 (mg/kg/hr)",
        defaultVolume: 50,
        defaultRate: 5,
      },
      {
        id: "bicarbonate",
        name: "Bicarbonate (NaHCO3)",
        type: "bicarbonate",
        badge: "본원 기준: pH 7.1 이하일 때만 · 요구량 1/4~1/2를 1~4시간 공급",
        defaultConc: 1,
        concLabel: "mEq/ml",
        defaultHCO3: 10,
        defaultBE: -8,
      },
    ],
  },
  {
    id: "sedation",
    label: "진정 / 항경련 (Sedation / Anticonvulsants)",
    accent: "#6E5FA8",
    drugs: [
      {
        id: "midazolam",
        name: "Midazolam",
        type: "perHr_mg",
        badge: "0.05~0.5 mg/kg/hr (최대 2)",
        defaultConc: 1,
        concLabel: "mg/ml",
        defaultDose: 0.2,
        doseLabel: "용량 (mg/kg/hr)",
        defaultVolume: 50,
        defaultRate: 5,
      },
      {
        id: "diazepam",
        name: "Diazepam",
        type: "perHr_mg",
        badge: "0.1~2 mg/kg/hr · PVC-free line 권장",
        defaultConc: 5,
        concLabel: "mg/ml",
        defaultDose: 0.5,
        doseLabel: "용량 (mg/kg/hr)",
        defaultVolume: 100,
        defaultRate: 5,
      },
    ],
  },
  {
    id: "hemostasis",
    label: "지혈 (Hemostasis)",
    accent: "#8A3D52",
    drugs: [
      {
        id: "txa",
        name: "Tranexamic acid (개)",
        type: "perHr_mg",
        badge: "CRI: 10 mg/kg/hr × 3시간 · Loading: 10 mg/kg 느린 IV 볼루스(구토 주의)",
        defaultConc: 100,
        concLabel: "mg/ml",
        defaultDose: 10,
        doseLabel: "용량 (mg/kg/hr)",
        defaultVolume: 50,
        defaultRate: 5,
        loading: { low: 10, high: 10, unit: "mg/kg" },
      },
    ],
  },
  {
    id: "others",
    label: "기타 (Others)",
    accent: "#6B7A78",
    drugs: [
      {
        id: "metoclopramide",
        name: "Metoclopramide",
        type: "perHr_mg",
        badge: "0.01~0.09 mg/kg/hr",
        defaultConc: 5,
        concLabel: "mg/ml",
        defaultDose: 0.05,
        doseLabel: "용량 (mg/kg/hr)",
        defaultVolume: 50,
        defaultRate: 5,
      },
    ],
  },
];

/**
 * @param {object} drug - DRUG_GROUPS[].drugs[] 항목
 * @param {object} inputs - { conc, dose, volume, rate, be, bw }
 * @returns {object} { drugVolume, diluentVolume, totalHours, extra }
 */
export function computeCRI(drug, inputs) {
  const { conc, dose, volume, rate, be, bw } = inputs;

  if (drug.type === "perMin_mg") {
    const mgPerKgPerHr = (dose * 60) / 1000; // μg/kg/min -> mg/kg/hr
    const totalHours = volume / rate;
    const totalMg = mgPerKgPerHr * bw * totalHours;
    const drugVolume = totalMg / conc;
    return {
      drugVolume,
      diluentVolume: volume - drugVolume,
      rate,
      loading: computeLoading(drug, conc, bw),
    };
  }

  if (drug.type === "perHr_mg") {
    const totalHours = volume / rate;
    const totalMg = dose * bw * totalHours;
    const drugVolume = totalMg / conc;
    return {
      drugVolume,
      diluentVolume: volume - drugVolume,
      rate,
      loading: computeLoading(drug, conc, bw),
    };
  }

  if (drug.type === "perMin_units") {
    const muPerKgPerHr = dose * 60; // mU/kg/min -> mU/kg/hr
    const totalHours = volume / rate;
    const totalMu = muPerKgPerHr * bw * totalHours;
    const concMuPerMl = conc * 1000; // IU/ml -> mU/ml
    const drugVolume = totalMu / concMuPerMl;
    return { drugVolume, diluentVolume: volume - drugVolume, rate };
  }

  if (drug.type === "targetConc") {
    // dose 필드를 "목표 농도(mEq/L)"로 사용, 체중 무관
    const totalMeq = (dose * volume) / 1000;
    const drugVolume = totalMeq / conc;
    return { drugVolume, diluentVolume: volume - drugVolume, rate };
  }

  if (drug.type === "bicarbonate") {
    // 본원 기준: 몸무게 × 0.5 × (15 − 측정 HCO3⁻)  (pH 7.1 이하일 때만)
    const fatimaMeq = 0.5 * bw * Math.max(0, 15 - (inputs.hco3 ?? 0));
    const fatimaVolume = fatimaMeq / conc;
    // 문헌 표준(참고): BE × 체중 × 0.3
    const litMeq = 0.3 * bw * Math.abs(be);
    const litVolume = litMeq / conc;
    return {
      fatimaMeq,
      fatimaVolume,
      litMeq,
      litVolume,
      // 실제 투여: 요구량의 1/4~1/2 (본원 기준)
      recommendedLow: fatimaVolume * 0.25,
      recommendedHigh: fatimaVolume * 0.5,
    };
  }

  return {};
}

function computeLoading(drug, conc, bw) {
  if (!drug.loading) return null;
  const { low, high } = drug.loading;
  return {
    low: (low * bw) / conc,
    high: (high * bw) / conc,
  };
}

export function fmt(n, digits = 2) {
  if (!isFinite(n)) return "-";
  return n.toFixed(digits);
}

/* ============================================================
   응급약물 (병원 프로토콜 시트 기반)
   - mode "bolus"  : ml = 용량(per kg) x 체중 / 역가
   - mode "perMin" : ml = 용량(per kg/min) x 60 x 체중 x (Bag÷Rate 시간) / 역가
   - mode "perHr"  : ml = 용량(per kg/hr) x 체중 x (Bag÷Rate 시간) / 역가
   potencyPerMl 은 용량과 같은 단위 기준의 1ml당 함량이다.
   (예: Dobutamine 용량 μg 기준 → 50 mg/ml = 50000 μg/ml)
============================================================ */
export const EMERGENCY_DEFAULTS = { bagSize: 60, fluidRate: 1 };

export const EMERGENCY_ROWS = [
  { id: "em-epi", name: "Epinephrine", mode: "bolus", dose: 0.01, doseUnit: "mg/kg",
    potencyPerMl: 1, potencyLabel: "1 mg/ml", range: "0.01 mg/kg", note: "CPCR" },
  { id: "em-atropine", name: "Atropine", mode: "bolus", dose: 0.04, doseUnit: "mg/kg",
    potencyPerMl: 0.5, potencyLabel: "0.5 mg/ml", range: "0.04 mg/kg", note: "CPCR" },
  { id: "em-glyco", name: "Glycopyrrolate", mode: "bolus", dose: 0.01, doseUnit: "mg/kg",
    potencyPerMl: 0.2, potencyLabel: "0.2 mg/ml", range: "0.01 mg/kg", note: "CPCR" },
  { id: "em-dobutamine", name: "Dobutamine", mode: "perMin", dose: 5, doseUnit: "μg/kg/min",
    potencyPerMl: 50000, potencyLabel: "50 mg/ml",
    range: "1~5 μg/kg/min · 개 최대 20, 고양이 최대 5",
    note: "Vasopressor · 4 fold까지 가능함" },
  { id: "em-dopamine", name: "Dopamine", mode: "perMin", dose: 5, doseUnit: "μg/kg/min",
    potencyPerMl: 200000, potencyLabel: "200 mg/ml",
    range: "2~2.5(initial) · 5~10 · 10~15 μg/kg/min",
    note: "Vasopressor · ~5 fold: β1-agonist · ~7.5 fold: β1, α1-agonist" },
  { id: "em-vaso-label", name: "Vasopressin", mode: "bolus", dose: 0.8, doseUnit: "IU/kg",
    potencyPerMl: 20, potencyLabel: "20 IU/ml", range: "0.8 IU/kg", note: "Label-dose" },
  { id: "em-vaso-min", name: "Vasopressin", mode: "perMin", dose: 0.001, doseUnit: "IU/kg/min",
    potencyPerMl: 20, potencyLabel: "20 IU/ml", range: "0.001~0.004 IU/kg/min", note: "" },
  { id: "em-vaso-hr", name: "Vasopressin", mode: "perHr", dose: 0.003, doseUnit: "IU/kg/hr",
    potencyPerMl: 20, potencyLabel: "20 IU/ml", range: "0.003~0.03 IU/kg/hr",
    note: "Post-CPCR tx, hypotension despite volume resuscitation" },
  { id: "em-vaso-bolus2", name: "Vasopressin", mode: "bolus", dose: 0.03, doseUnit: "IU/kg",
    potencyPerMl: 20, potencyLabel: "20 IU/ml", range: "0.03 IU/min IV",
    note: "Unresponsive to fluid, catecholamine" },
  { id: "em-norepi", name: "Norepinephrine", mode: "perMin", dose: 0.3, doseUnit: "μg/kg/min",
    potencyPerMl: 1000, potencyLabel: "1000 μg/ml",
    range: "Initial 0.05~0.1 · Continue 1~2 μg/kg/min",
    note: "~20 fold까지 증량 가능" },
  { id: "em-furo-bolus", name: "Furosemide", mode: "bolus", dose: 1, doseUnit: "mg/kg",
    potencyPerMl: 10, potencyLabel: "10 mg/ml", range: "1~4 mg/kg",
    note: "Acute cardiogenic or pulmonary edema" },
  { id: "em-furo-cri", name: "Furosemide", mode: "perHr", dose: 0.7, doseUnit: "mg/kg/hr",
    potencyPerMl: 10, potencyLabel: "10 mg/ml",
    range: "0.5~1 mg/kg/hr · 0.1~2 mg/kg/hr, loading 1~2 mg/kg", note: "ARF" },
  { id: "em-nitro", name: "Nitroprusside", mode: "perMin", dose: 0.5, doseUnit: "μg/kg/min",
    potencyPerMl: 25000, potencyLabel: "25 mg/ml", range: "0.5~1.5 μg/kg/min",
    note: "Acute cardiogenic or pulmonary edema" },
];

export function computeEmergency(row, { dose, bw, bagSize, fluidRate }) {
  if (row.mode === "bolus") {
    return (dose * bw) / row.potencyPerMl;
  }
  const hours = fluidRate > 0 ? bagSize / fluidRate : 0;
  if (row.mode === "perMin") {
    return (dose * 60 * bw * hours) / row.potencyPerMl;
  }
  if (row.mode === "perHr") {
    return (dose * bw * hours) / row.potencyPerMl;
  }
  return 0;
}

/* ============================================================
   무통주사 TLK — 응급약물과 동일한 표 형식으로 표시
   ml = 용량(mg/kg/hr) × 체중 × (Bag ÷ Rate 시간) ÷ 역가(mg/ml)
============================================================ */
export const TLK_ROWS = [
  { id: "tlk-tramadol", name: "Tramadol", dose: 1.3, doseUnit: "mg/kg/hr",
    potencyPerMl: 50, potencyLabel: "50 mg/ml" },
  { id: "tlk-lidocaine", name: "Lidocaine", dose: 1.5, doseUnit: "mg/kg/hr",
    potencyPerMl: 20, potencyLabel: "20 mg/ml" },
  { id: "tlk-ketamine", name: "Ketamine", dose: 0.6, doseUnit: "mg/kg/hr",
    potencyPerMl: 50, potencyLabel: "50 mg/ml" },
];

export function computeTLK(row, { dose, bw, bagSize, fluidRate }) {
  const hours = fluidRate > 0 ? bagSize / fluidRate : 0;
  return (dose * bw * hours) / row.potencyPerMl;
}

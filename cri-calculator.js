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
        defaultConc: 12.5,
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
        badge: "1~10 μg/kg/min · 차광 필수",
        defaultConc: 25,
        concLabel: "mg/ml",
        defaultDose: 1,
        doseLabel: "용량 (μg/kg/min)",
        defaultVolume: 100,
        defaultRate: 5,
      },
      {
        id: "diltiazem",
        name: "Diltiazem",
        type: "perMin_mg",
        badge: "CRI: 1~8 μg/kg/min · Loading: 0.125~0.25 mg/kg IV",
        defaultConc: 5,
        concLabel: "mg/ml",
        defaultDose: 2,
        doseLabel: "용량 (μg/kg/min)",
        defaultVolume: 50,
        defaultRate: 5,
        loading: { low: 0.125, high: 0.25, unit: "mg/kg" },
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
        id: "kcl",
        name: "KCl",
        type: "targetConc",
        badge: "최대 0.5 mEq/kg/hr 절대 금지!",
        defaultConc: 2,
        concLabel: "mEq/ml",
        defaultDose: 20, // 목표 농도 (mEq/L)
        doseLabel: "목표 농도 (mEq/L)",
        defaultVolume: 500,
        defaultRate: 10,
      },
      {
        id: "bicarbonate",
        name: "Bicarbonate (NaHCO3)",
        type: "bicarbonate",
        badge: "요구량 1/4~1/2 · 1~4시간 공급",
        defaultConc: 1,
        concLabel: "mEq/ml",
        defaultBE: -8,
      },
      {
        id: "calcium",
        name: "10% Calcium Gluconate",
        type: "perHr_mg",
        badge: "2.5~3.5 mg/kg/hr",
        defaultConc: 9.3,
        concLabel: "mg/ml",
        defaultDose: 3,
        doseLabel: "용량 (mg/kg/hr)",
        defaultVolume: 50,
        defaultRate: 5,
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
    id: "antiarrhythmics",
    label: "항부정맥제 (Antiarrhythmics)",
    accent: "#B8862F",
    drugs: [
      {
        id: "lidocaine-dog",
        name: "Lidocaine (개)",
        type: "perMin_mg",
        badge: "CRI: 25~100 μg/kg/min · Loading: 1~2 mg/kg IV (1~4분)",
        defaultConc: 20,
        concLabel: "mg/ml",
        defaultDose: 50,
        doseLabel: "용량 (μg/kg/min)",
        defaultVolume: 100,
        defaultRate: 10,
        loading: { low: 1, high: 2, unit: "mg/kg" },
      },
      {
        id: "lidocaine-cat",
        name: "Lidocaine (고양이)",
        type: "perMin_mg",
        badge: "CRI: 10~20 μg/kg/min · Loading: 0.25~0.5 mg/kg IV (1~4분)",
        defaultConc: 20,
        concLabel: "mg/ml",
        defaultDose: 10,
        doseLabel: "용량 (μg/kg/min)",
        defaultVolume: 50,
        defaultRate: 5,
        loading: { low: 0.25, high: 0.5, unit: "mg/kg" },
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
      {
        id: "hydrocortisone",
        name: "Hydrocortisone",
        type: "perHr_mg",
        badge: "CRI: 0.08~0.15 mg/kg/hr",
        defaultConc: 100,
        concLabel: "mg/ml",
        defaultDose: 0.1,
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
    return { drugVolume, diluentVolume: volume - drugVolume, rate };
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
    const totalMeq = 0.3 * bw * Math.abs(be);
    const fullVolume = totalMeq / conc;
    return {
      fullVolume,
      recommendedLow: fullVolume * 0.25,
      recommendedHigh: fullVolume * 0.5,
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

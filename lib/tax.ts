import type { BonusType } from "./types";

export type IncomeInput = {
  yearlySalary: number;
  bonusType: BonusType;
  bonusValue: number;
};

export type OntarioIncomeBreakdown = {
  annualSalary: number;
  annualBonus: number;
  annualGrossIncome: number;
  taxableIncome: number;
  federalTax: number;
  provincialTax: number;
  cppContribution: number;
  eiPremium: number;
  totalDeductions: number;
  annualNetIncome: number;
  monthlyNetIncome: number;
};

const FEDERAL_BRACKETS_2026 = [
  { limit: 58_523, rate: 0.14 },
  { limit: 117_046, rate: 0.205 },
  { limit: 181_205, rate: 0.26 },
  { limit: 258_482, rate: 0.29 },
  { limit: Number.POSITIVE_INFINITY, rate: 0.33 }
] as const;

const ONTARIO_BRACKETS_2026 = [
  { limit: 52_886, rate: 0.0505 },
  { limit: 105_775, rate: 0.0915 },
  { limit: 150_000, rate: 0.1116 },
  { limit: 220_000, rate: 0.1216 },
  { limit: Number.POSITIVE_INFINITY, rate: 0.1316 }
] as const;

const FEDERAL_BPA_MAX_2026 = 16_452;
const FEDERAL_BPA_MIN_2026 = 14_162;
const FEDERAL_BPA_PHASEOUT_START_2026 = 181_205;
const FEDERAL_BPA_PHASEOUT_END_2026 = 258_482;
const ONTARIO_BPA_2026 = 12_989;
const ONTARIO_TAX_REDUCTION_BASE_2026 = 300;

const CPP_BASE_EXEMPTION_2026 = 3_500;
const CPP_YMPE_2026 = 74_600;
const CPP_YAMPE_2026 = 85_000;
const CPP_BASE_AND_FIRST_RATE_2026 = 0.0595;
const CPP_SECOND_RATE_2026 = 0.04;

const EI_MAX_INSURABLE_EARNINGS_2026 = 68_900;
const EI_RATE_2026 = 0.0163;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const calculateProgressiveTax = (
  income: number,
  brackets: readonly { limit: number; rate: number }[]
) => {
  let remaining = Math.max(0, income);
  let previousLimit = 0;
  let tax = 0;

  for (const bracket of brackets) {
    if (remaining <= 0) {
      break;
    }

    const bracketSpan = bracket.limit - previousLimit;
    const taxableAtRate = Math.min(remaining, bracketSpan);
    tax += taxableAtRate * bracket.rate;
    remaining -= taxableAtRate;
    previousLimit = bracket.limit;
  }

  return tax;
};

const calculateFederalBasicPersonalAmount = (taxableIncome: number) => {
  if (taxableIncome <= FEDERAL_BPA_PHASEOUT_START_2026) {
    return FEDERAL_BPA_MAX_2026;
  }

  if (taxableIncome >= FEDERAL_BPA_PHASEOUT_END_2026) {
    return FEDERAL_BPA_MIN_2026;
  }

  const phaseoutRatio =
    (taxableIncome - FEDERAL_BPA_PHASEOUT_START_2026) /
    (FEDERAL_BPA_PHASEOUT_END_2026 - FEDERAL_BPA_PHASEOUT_START_2026);

  return (
    FEDERAL_BPA_MAX_2026 -
    phaseoutRatio * (FEDERAL_BPA_MAX_2026 - FEDERAL_BPA_MIN_2026)
  );
};

const calculateOntarioHealthPremium = (taxableIncome: number) => {
  if (taxableIncome <= 20_000) {
    return 0;
  }

  if (taxableIncome <= 25_000) {
    return Math.min(300, (taxableIncome - 20_000) * 0.06);
  }

  if (taxableIncome <= 36_000) {
    return 300;
  }

  if (taxableIncome <= 38_500) {
    return 300 + Math.min(150, (taxableIncome - 36_000) * 0.06);
  }

  if (taxableIncome <= 48_000) {
    return 450;
  }

  if (taxableIncome <= 48_600) {
    return 450 + Math.min(150, (taxableIncome - 48_000) * 0.25);
  }

  if (taxableIncome <= 72_000) {
    return 600;
  }

  if (taxableIncome <= 72_600) {
    return 600 + Math.min(150, (taxableIncome - 72_000) * 0.25);
  }

  if (taxableIncome <= 200_000) {
    return 750;
  }

  return 900;
};

const calculateOntarioSurtax = (provincialTaxBeforeSurtax: number) =>
  Math.max(0, (provincialTaxBeforeSurtax - 5_554) * 0.2) +
  Math.max(0, (provincialTaxBeforeSurtax - 7_108) * 0.36);

const calculateAnnualBonus = ({
  yearlySalary,
  bonusType,
  bonusValue
}: IncomeInput) => {
  const salary = Math.max(0, yearlySalary);
  const normalizedBonusValue = Math.max(0, bonusValue);

  if (bonusType === "amount") {
    return normalizedBonusValue;
  }

  if (bonusType === "percentage") {
    return (salary * normalizedBonusValue) / 100;
  }

  return 0;
};

const calculateCppContributions = (taxableIncome: number) => {
  const baseAndFirstPensionableIncome = clamp(
    taxableIncome - CPP_BASE_EXEMPTION_2026,
    0,
    CPP_YMPE_2026 - CPP_BASE_EXEMPTION_2026
  );
  const baseAndFirst = baseAndFirstPensionableIncome * CPP_BASE_AND_FIRST_RATE_2026;

  const secondPensionableIncome = clamp(
    taxableIncome - CPP_YMPE_2026,
    0,
    CPP_YAMPE_2026 - CPP_YMPE_2026
  );
  const second = secondPensionableIncome * CPP_SECOND_RATE_2026;

  return {
    baseAndFirst,
    second,
    total: baseAndFirst + second
  };
};

const calculateEiPremium = (taxableIncome: number) =>
  clamp(taxableIncome, 0, EI_MAX_INSURABLE_EARNINGS_2026) * EI_RATE_2026;

export const calculateOntarioNetIncomeFromGross = (
  annualGrossIncome: number
): OntarioIncomeBreakdown => {
  const taxableIncome = Math.max(0, annualGrossIncome);
  const cpp = calculateCppContributions(taxableIncome);
  const eiPremium = calculateEiPremium(taxableIncome);

  const federalTaxBeforeCredits = calculateProgressiveTax(
    taxableIncome,
    FEDERAL_BRACKETS_2026
  );
  const federalCredits =
    FEDERAL_BRACKETS_2026[0].rate *
    (calculateFederalBasicPersonalAmount(taxableIncome) + cpp.baseAndFirst + eiPremium);
  const federalTax = Math.max(0, federalTaxBeforeCredits - federalCredits);

  const provincialTaxBeforeCredits = calculateProgressiveTax(
    taxableIncome,
    ONTARIO_BRACKETS_2026
  );
  const provincialCredits =
    ONTARIO_BRACKETS_2026[0].rate * (ONTARIO_BPA_2026 + cpp.baseAndFirst + eiPremium);
  const provincialBasicTax = Math.max(0, provincialTaxBeforeCredits - provincialCredits);
  const provincialSurtax = calculateOntarioSurtax(provincialBasicTax);
  const ontarioHealthPremium = calculateOntarioHealthPremium(taxableIncome);
  const provincialTaxBeforeReduction =
    provincialBasicTax + provincialSurtax + ontarioHealthPremium;
  const ontarioTaxReduction = Math.min(
    provincialTaxBeforeReduction,
    Math.max(
      0,
      ONTARIO_TAX_REDUCTION_BASE_2026 * 2 - provincialTaxBeforeReduction
    )
  );
  const provincialTax = Math.max(0, provincialTaxBeforeReduction - ontarioTaxReduction);

  const totalDeductions = federalTax + provincialTax + cpp.total + eiPremium;
  const annualNetIncome = Math.max(0, taxableIncome - totalDeductions);

  return {
    annualSalary: roundMoney(taxableIncome),
    annualBonus: 0,
    annualGrossIncome: roundMoney(taxableIncome),
    taxableIncome: roundMoney(taxableIncome),
    federalTax: roundMoney(federalTax),
    provincialTax: roundMoney(provincialTax),
    cppContribution: roundMoney(cpp.total),
    eiPremium: roundMoney(eiPremium),
    totalDeductions: roundMoney(totalDeductions),
    annualNetIncome: roundMoney(annualNetIncome),
    monthlyNetIncome: roundMoney(annualNetIncome / 12)
  };
};

export const calculateOntarioNetIncomeFromInput = (
  input: IncomeInput
): OntarioIncomeBreakdown => {
  const annualSalary = Math.max(0, input.yearlySalary);
  const annualBonus = calculateAnnualBonus(input);
  const annualGrossIncome = annualSalary + annualBonus;
  const breakdown = calculateOntarioNetIncomeFromGross(annualGrossIncome);

  return {
    ...breakdown,
    annualSalary: roundMoney(annualSalary),
    annualBonus: roundMoney(annualBonus),
    annualGrossIncome: roundMoney(annualGrossIncome)
  };
};

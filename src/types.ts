export interface SettlementData {
  fiscal_year: number;
  prefecture: string;
  source: string;
  // 基本指標
  population: number | null;          // 住民基本台帳人口
  area: number | null;                // 面積 (k㎡)
  // 収支総括
  total_revenue: number | null;       // 歳入合計
  total_expenditure: number | null;   // 歳出合計
  real_balance: number | null;        // 実質収支
  single_year_balance: number | null; // 単年度収支
  // 財政指標
  financial_capability_index: number | null; // 財政力指数
  real_debt_service_ratio: number | null;    // 実質公債費比率
  future_burden_ratio: number | null;        // 将来負担比率
  current_account_ratio: number | null;      // 経常収支比率
  // 歳入内訳
  local_tax: number | null;            // 地方税
  local_allocation_tax: number | null; // 地方交付税
  local_consumption_tax: number | null; // 地方消費税
  // 歳出内訳（性質別）
  personnel_expenses: number | null;   // 人件費
  assistance_expenses: number | null;  // 扶助費
  public_debt_expenses: number | null; // 公債費
  ordinary_construction_expenses: number | null; // 普通建設事業費
}

export interface MigrationData {
  fiscal_year: number;
  prefecture: string;
  area: string;
  source: string;
  domestic_in: number | null;      // (A) 転入者数（国内）
  domestic_out: number | null;     // (B) 転出者数（国内）
  international_in: number | null; // (C) 国外からの転入者数
  international_out: number | null;// (D) 国外への転出者数
  social_increase: number | null;  // 社会増加数
}

export interface PopulationData {
  fiscal_year: number;
  prefecture: string;
  area: string;
  source: string;
  total_population: number | null; // 人口（計）
  births: number | null;           // 出生者数
  deaths: number | null;           // 死亡者数
}

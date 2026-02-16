export interface SettlementData {
  fiscal_year: number;
  prefecture: string;
  source: string;
  population: number | null;
  total_revenue: number | null;       // 歳入合計
  total_expenditure: number | null;   // 歳出合計
  real_balance: number | null;        // 実質収支
  local_tax: number | null;           // 地方税
  local_consumption_tax: number | null; // 地方消費税（内訳にある）
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

export const LEXICON = {
  // ■ 決算カード (Settlement)
  settlement: {
    // 基本情報
    population: ["住民基本台帳人口", "住基人口"],
    area: ["面積"],
    // 収支
    revenue: ["歳入合計", "歳入決算総額"],
    expenditure: ["歳出合計", "歳出決算総額"],
    real_balance: ["実質収支", "実質収支額"],
    single_year_balance: ["単年度収支"],
    // 指標
    financial_capability_index: ["財政力指数"],
    real_debt_service_ratio: ["実質公債費比率"],
    future_burden_ratio: ["将来負担比率"],
    current_account_ratio: ["経常収支比率"],
    // 歳入内訳
    local_tax: ["地方税"],
    local_allocation_tax: ["地方交付税"],
    local_consumption_tax: ["地方消費税"],
    // 歳出内訳
    personnel_expenses: ["人件費"],
    assistance_expenses: ["扶助費"],
    public_debt_expenses: ["公債費"],
    ordinary_construction_expenses: ["普通建設事業費"]
  },

  // ■ 人口移動 (Migration) - 既存維持
  migration: {
    domestic_in: ["転入者数(国内)", "転入者数（国内）", "(A)"],
    domestic_out: ["転出者数(国内)", "転出者数（国内）", "(B)"],
    international_in: ["国外からの転入者数", "国外転入", "(C)"],
    international_out: ["国外への転出者数", "国外転出", "(D)"],
    social_increase: ["社会増加数", "社会増減", "(A)-(B)+(C)-(D)"],
  },

  // ■ 人口動態 (Population) - 既存維持
  population: {
    births: ["出生者数", "出生数"],
    deaths: ["死亡者数", "死亡数"],
    population_total: ["住民基本台帳人口", "人口"],
    sub_total: ["計", "総数"],
    total_population_label: ["人口"], 
    total_population_sub_label: ["計", "総数"], 
  }
};

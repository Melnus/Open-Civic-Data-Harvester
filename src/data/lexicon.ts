export const LEXICON = {
  // ■ 決算カード (Settlement)
  settlement: {
    // 左側の表にある項目
    revenue: ["歳入合計", "歳入決算総額"],
    expenditure: ["歳出合計", "歳出決算総額"],
    real_balance: ["実質収支", "実質収支額"],
    local_tax: ["地方税"],
    
    // 右下の「内訳」ブロックにある項目
    local_consumption_tax: ["地方消費税"],

    // 右上の人口データ
    population: ["住民基本台帳人口", "住基人口"],
  },

  // ■ 人口移動 (Migration)
  migration: {
    domestic_in: ["転入者数(国内)", "転入者数（国内）", "(A)"],
    domestic_out: ["転出者数(国内)", "転出者数（国内）", "(B)"],
    international_in: ["国外からの転入者数", "国外転入", "(C)"],
    international_out: ["国外への転出者数", "国外転出", "(D)"],
    social_increase: ["社会増加数", "社会増減", "(A)-(B)+(C)-(D)"],
  },

  // ■ 人口動態 (Population)
  population: {
    // 複合ヘッダー対策：「出生者数」などは一意に決まるので強いキーワード
    births: ["出生者数", "出生数"],
    deaths: ["死亡者数", "死亡数"],
    population_total: ["住民基本台帳人口", "人口"], // 親見出し
    sub_total: ["計", "総数"], // 子見出し
    
    // 総人口は「人口」列の下の「計」列にある
    // ヘッダー行で「人口」を見つけ、その直下の行で「計」を探すロジックが必要
    total_population_label: ["人口"], 
    total_population_sub_label: ["計", "総数"], 
  }
};

# Open-Civic-Data-Harvester Project Context

## 🤖 AI Instructions
You are an expert TypeScript developer and Data Engineer assisting with the "Open-Civic-Data-Harvester".
This project extracts structured JSON data from chaotic Japanese government Excel files (Statistical data).

**Key Philosophies:**
1. **Resilience:** Government Excel files often have merged cells and irregular formatting. We rely on "Keyword Search" (Lexicon) rather than fixed cell coordinates whenever possible.
2. **Standardization:** We enforce `FYxxxx` (Fiscal Year) filenames. Japanese Era names (Heisei, Reiwa) are banned in filenames.
3. **Lexicon-Driven:** The `src/data/lexicon.ts` file controls the extraction logic keywords.

---

## 📂 Directory Structure
```
/
├── xlsx/                # [Input] Place raw Excel files here (e.g., FY2025-settlement.xlsx)
├── data/                # [Output] Generated JSON files appear here
├── docs/
│   └── index.html       # Web Portal for AI-based extraction (Google GenAI)
└── src/
    ├── index.ts         # Entry point (Mode selection & File I/O)
    ├── types.ts         # TypeScript Interfaces (Data Schemas)
    ├── utils.ts         # Helpers (Number parsing, Prefecture normalization)
    ├── data/
    │   └── lexicon.ts   # Keyword dictionaries for extraction
    └── modes/           # Extraction Logic per data type
        ├── settlement.ts
        ├── migration.ts
        └── population.ts
```

---

## 📝 Data Schemas (src/types.ts)
These are the target output formats.

```typescript
// src/types.ts
export interface SettlementData {
  fiscal_year: number;
  prefecture: string;
  source: string;
  population: number | null;
  total_revenue: number | null;       // 歳入合計
  total_expenditure: number | null;   // 歳出合計
  real_balance: number | null;        // 実質収支
  local_tax: number | null;           // 地方税
  local_consumption_tax: number | null; // 地方消費税
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
```

---

## 🔑 Lexicon Definitions (src/data/lexicon.ts)
Defines the keywords used to locate data columns/rows.

```typescript
// src/data/lexicon.ts
export const LEXICON = {
  // ■ 決算カード (Settlement)
  settlement: {
    revenue: ["歳入合計", "歳入決算総額"],
    expenditure: ["歳出合計", "歳出決算総額"],
    real_balance: ["実質収支", "実質収支額"],
    local_tax: ["地方税"],
    local_consumption_tax: ["地方消費税"],
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
    births: ["出生者数", "出生数"],
    deaths: ["死亡者数", "死亡数"],
    population_total: ["住民基本台帳人口", "人口"], // Parent Header
    sub_total: ["計", "総数"], // Sub Header
    total_population_label: ["人口"], 
    total_population_sub_label: ["計", "総数"], 
  }
};
```

---

## 🛠 Utility Functions (src/utils.ts)

```typescript
// src/utils.ts
export const PREFECTURES = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

export function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/,/g, '').trim();
  if (['-', '－', '＊', '*', '...', '―', '△'].includes(str)) return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

export function normalizePrefecture(name: string): string {
  const found = PREFECTURES.find(p => name.includes(p));
  return found ? found : name;
}
```

---

## 🚜 Core Logic: Modes

### 1. Settlement Mode (src/modes/settlement.ts)
Extracts financial data. Uses a "Keyword + Proximity Search" strategy to handle merged cells.

```typescript
// src/modes/settlement.ts
import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture } from '../utils';
import { LEXICON } from '../data/lexicon';
import { SettlementData } from '../types';

export function extractSettlement(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): SettlementData[] {
  const results: SettlementData[] = [];
  const CONFIG = [
    { key: "population", keywords: LEXICON.settlement.population },
    { key: "total_revenue", keywords: LEXICON.settlement.revenue },
    { key: "total_expenditure", keywords: LEXICON.settlement.expenditure },
    { key: "local_tax", keywords: LEXICON.settlement.local_tax },
    { key: "local_consumption_tax", keywords: LEXICON.settlement.local_consumption_tax },
    { key: "real_balance", keywords: LEXICON.settlement.real_balance }
  ];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.match(/(目次|index|注意|原本|Menu|表紙|概況|付表)/i)) continue;
    
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    const cleanPref = normalizePrefecture(sheetName);
    const entry: any = { fiscal_year: fiscalYear, prefecture: cleanPref, source: sourceFile };
    let foundAny = false;

    CONFIG.forEach((configItem) => {
      if (entry[configItem.key] !== undefined) return;
      outer_loop: for (const row of matrix) {
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c]);
          if (configItem.keywords.some(kw => cellStr.includes(kw))) {
            // Scan next 50 cells for a number
            for (let nc = c + 1; nc < Math.min(c + 50, row.length); nc++) {
              const val = parseNumber(row[nc]);
              if (val !== null) { 
                if (configItem.key === "population" && val < 1000) continue;
                entry[configItem.key] = val;
                foundAny = true;
                break outer_loop;
              }
            }
          }
        }
      }
    });

    if (foundAny) results.push(entry as SettlementData);
  }
  return results;
}
```

### 2. Migration Mode (src/modes/migration.ts)
Extracts population movement. Detects header rows dynamically based on keywords.

```typescript
// src/modes/migration.ts
import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture, PREFECTURES } from '../utils';
import { LEXICON } from '../data/lexicon';
import { MigrationData } from '../types';

export function extractMigration(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): MigrationData[] {
  const results: MigrationData[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.match(/(目次|index|注意|原本)/i)) continue;
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    const colMap: { [key: string]: number } = {};
    let headerRow = -1;

    for (let r = 0; r < Math.min(20, matrix.length); r++) {
      let foundInThisRow = false;
      matrix[r].forEach((cell, c) => {
        const str = String(cell).replace(/\s/g, ''); 
        if (!str) return;
        const check = (kws: string[]) => kws.some(kw => (kw.length <= 3 ? str === kw : str.includes(kw)));

        if (check(LEXICON.migration.domestic_in)) { colMap['domestic_in'] = c; foundInThisRow = true; }
        if (check(LEXICON.migration.domestic_out)) { colMap['domestic_out'] = c; foundInThisRow = true; }
        if (check(LEXICON.migration.international_in)) { colMap['international_in'] = c; foundInThisRow = true; }
        if (check(LEXICON.migration.international_out)) { colMap['international_out'] = c; foundInThisRow = true; }
        if (check(LEXICON.migration.social_increase)) { colMap['social_increase'] = c; foundInThisRow = true; }
      });

      if (foundInThisRow && colMap['domestic_in'] !== undefined) headerRow = r;
    }

    if (headerRow === -1) continue;

    for (let r = headerRow + 1; r < matrix.length; r++) {
      const row = matrix[r];
      const nameCandidates = [row[0], row[1], row[2]].map(v => String(v || "").trim());
      const prefMatch = nameCandidates.find(n => PREFECTURES.includes(n) || PREFECTURES.includes(n.replace(/\s/g, '')));
      
      if (prefMatch) {
        const cleanName = normalizePrefecture(prefMatch);
        results.push({
          fiscal_year: fiscalYear,
          prefecture: cleanName,
          area: cleanName,
          source: sourceFile,
          domestic_in: parseNumber(row[colMap['domestic_in']]),
          domestic_out: parseNumber(row[colMap['domestic_out']]),
          international_in: parseNumber(row[colMap['international_in']]),
          international_out: parseNumber(row[colMap['international_out']]),
          social_increase: parseNumber(row[colMap['social_increase']])
        });
      }
    }
  }
  return results;
}
```

### 3. Population Mode (src/modes/population.ts)
Extracts births/deaths. Handles complex nested headers (e.g., "Population" -> "Total").

```typescript
// src/modes/population.ts
import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture, PREFECTURES } from '../utils';
import { LEXICON } from '../data/lexicon';
import { PopulationData } from '../types';

export function extractPopulation(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): PopulationData[] {
  const results: PopulationData[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.match(/(目次|index|注意|原本|表紙|概況|付表)/i)) continue;
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    const colMap: { [key: string]: number } = {};
    for (let r = 0; r < Math.min(25, matrix.length); r++) {
      const row = matrix[r];
      for (let c = 0; c < row.length; c++) {
        const cellStr = String(row[c]).replace(/\s/g, '');
        if (LEXICON.population.births.some(kw => cellStr === kw)) colMap['births'] = c;
        if (LEXICON.population.deaths.some(kw => cellStr === kw)) colMap['deaths'] = c;
        if (LEXICON.population.population_total.some(kw => cellStr === kw || cellStr.includes(kw))) {
          for (let rowOffset = 1; rowOffset <= 2; rowOffset++) {
            const subCell = String(matrix[r + rowOffset]?.[c] || "").replace(/\s/g, '');
            if (LEXICON.population.sub_total.some(skw => subCell === skw)) {
              colMap['total_population'] = c;
              break;
            }
          }
        }
      }
    }

    if (colMap['total_population'] === undefined) continue;

    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r];
      const colB = String(row[1] || "").trim();
      const colC = String(row[2] || "").trim();
      const prefMatch = PREFECTURES.find(p => colB.includes(p) || colC.includes(p));
      if (!prefMatch) continue;

      const pref = normalizePrefecture(prefMatch);
      let city = "";
      if (colC && !PREFECTURES.includes(colC)) city = colC.replace(/\s/g, '');
      else if (String(row[3])) city = String(row[3]).trim();
      if (city.match(/(合計|再掲|部計|計)$/)) continue;

      const areaName = city ? `${pref}${city}` : pref;
      const valPopulation = parseNumber(row[colMap['total_population']]);
      const valBirths = colMap['births'] !== undefined ? parseNumber(row[colMap['births']]) : null;
      const valDeaths = colMap['deaths'] !== undefined ? parseNumber(row[colMap['deaths']]) : null;

      if (valPopulation !== null && valPopulation > 100) {
        results.push({
          fiscal_year: fiscalYear,
          prefecture: pref,
          area: areaName,
          source: sourceFile,
          total_population: valPopulation,
          births: valBirths,
          deaths: valDeaths
        });
      }
    }
  }
  return results;
}
```

---

## 🚀 Entry Point (src/index.ts)
Handles file detection (by filename), mode dispatching, and unique key deduplication.

```typescript
// src/index.ts
import * as fs from 'fs-extra';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { extractSettlement } from './modes/settlement';
import { extractMigration } from './modes/migration';
import { extractPopulation } from './modes/population';

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');

async function main() {
  await fs.ensureDir(DATA_DIR);
  await fs.ensureDir(XLSX_DIR); 
  
  const files = await fs.readdir(XLSX_DIR);

  for (const file of files) {
    if (file.startsWith('.') || !file.match(/\.(xlsx|xls)$/i)) continue;
    console.log(`\n🚜 Processing: ${file}`);
    
    const workbook = XLSX.readFile(path.join(XLSX_DIR, file));
    const fileName = path.parse(file).name;
    const fileYearMatch = fileName.match(/FY(\d{4})/);
    const fiscalYear = fileYearMatch ? parseInt(fileYearMatch[1]) : 2025;

    let results: any[] = [];

    if (file.includes("migration")) {
      results = extractMigration(workbook, fiscalYear, file);
    } else if (file.includes("population")) {
      results = extractPopulation(workbook, fiscalYear, file);
    } else {
      results = extractSettlement(workbook, fiscalYear, file);
    }

    const uniqueMap = new Map();
    results.forEach(r => {
      const key = `${r.fiscal_year}-${r.area || r.prefecture}`;
      if (!uniqueMap.has(key)) uniqueMap.set(key, r);
    });
    const finalData = Array.from(uniqueMap.values());

    if (finalData.length > 0) {
      await fs.writeJson(path.join(DATA_DIR, `${fileName}.json`), finalData, { spaces: 2 });
      console.log(`  ✅ Extracted ${finalData.length} records.`);
    } else {
      console.log(`  ⚠️ No data extracted.`);
    }
  }
}
main().catch(console.error);
```
```

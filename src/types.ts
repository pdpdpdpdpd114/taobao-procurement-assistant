export type ItemSource = "dom" | "network" | "manual";

export interface CartItem {
  id: string;
  name: string;
  model: string;
  quantity: number;
  unitPriceCents: number | null;
  freightCents: number | null;
  freightConfirmed: boolean;
  discountCents?: number | null;
  priceSource?: "cart" | "checkout" | "manual";
  freightSource?: "checkout" | "manual";
  discountSource?: "checkout" | "inferred" | "manual";
  url: string;
  source: ItemSource;
  warnings: string[];
}

export interface TeamConfig {
  schemaVersion: 1;
  configVersion: string;
  teamName: string;
  departments: string[];
  people: string[];
  department: string;
  leader: string;
  captain: string;
  teacher: string;
  annualBudgetCents: number | null;
  budgetPolicy: string;
  templateVersion: string;
}

export interface PersonalProfile {
  department: string;
  applicant: string;
  purchaser: string;
  leader: string;
  captain: string;
  teacher: string;
}

export interface ApplicationDraft extends PersonalProfile {
  purchaseDate: string;
  arrivalDate: string;
  invoiceDate: string;
  inventory: string;
  custodian: string;
  purpose: string;
  finishedProduct: string;
  annualBudgetCents: number | null;
  currentSpentCents: number | null;
  remainingBudgetCents: number | null;
  items: CartItem[];
  checkout?: {
    payableCents: number | null;
    observedAt: string;
    matched: boolean;
    warnings: string[];
  };
}

export interface CartSelection {
  schemaVersion: 1;
  capturedAt: string;
  items: CartItem[];
}

export interface NetworkCandidate {
  id: string;
  name: string;
  model: string;
  quantity: number;
  unitPriceCents: number | null;
  url: string;
}

export interface ParseDiagnostics {
  checkedInputs: number;
  candidateContainers: number;
  domItems: number;
  networkItems: number;
  mergedItems: number;
  warnings: string[];
}

export interface ParseResult {
  items: CartItem[];
  diagnostics: ParseDiagnostics;
}

export interface LocalDataBackup {
  backupVersion: 1;
  exportedAt: string;
  profile?: PersonalProfile;
  team?: TeamConfig;
  draft?: ApplicationDraft;
}

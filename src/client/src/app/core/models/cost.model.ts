export interface CostSummary {
  totalCost: number;
  azureCost: number;
  awsCost: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  byResourceType: CostByCategory[];
  byRegion: CostByCategory[];
  byResourceGroup: CostByCategory[];
  monthOverMonthChange: number;
}

export interface CostByCategory {
  category: string;
  amount: number;
  percentage: number;
}

export interface CostTrend {
  date: string;
  azureCost: number;
  awsCost: number;
  totalCost: number;
}

export interface CostForecast {
  forecastDate: string;
  predictedCost: number;
  lowerBound: number;
  upperBound: number;
  confidenceLevel: number;
}

export interface CostAnomaly {
  id: string;
  resourceId: string;
  resourceName: string;
  expectedCost: number;
  actualCost: number;
  deviationPercentage: number;
  detectedAt: string;
  description: string;
}
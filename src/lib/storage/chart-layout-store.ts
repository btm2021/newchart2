type SavedChart = {
  id: string;
  name: string;
  symbol: string;
  resolution: string;
  content: string;
  timestamp: number;
};

export interface ChartLayoutStore {
  listCharts(): Promise<Array<Omit<SavedChart, "content">>>;
  getChart(id: string): Promise<SavedChart | null>;
  saveChart(chart: Omit<SavedChart, "timestamp">): Promise<string>;
  removeChart(id: string): Promise<void>;
  listStudyTemplates(): Promise<Array<{ name: string }>>;
  getStudyTemplate(name: string): Promise<string | null>;
  saveStudyTemplate(name: string, content: string): Promise<void>;
  removeStudyTemplate(name: string): Promise<void>;
  listDrawingTemplates(toolName: string): Promise<Array<{ name: string }>>;
  getDrawingTemplate(toolName: string, templateName: string): Promise<string | null>;
  saveDrawingTemplate(toolName: string, templateName: string, content: string): Promise<void>;
  removeDrawingTemplate(toolName: string, templateName: string): Promise<void>;
}

type ChartStorageResponse = {
  charts?: Array<Omit<SavedChart, "content">>;
  chart?: SavedChart | null;
  id?: string;
  templates?: Array<{ name: string }>;
  content?: string | null;
  ok?: boolean;
  error?: string;
};

async function requestChartStorage(payload: Record<string, unknown>): Promise<ChartStorageResponse> {
  const response = await fetch("/api/chart-storage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null) as ChartStorageResponse | null;
  if (!response.ok) {
    throw new Error(data?.error || "Chart storage request failed.");
  }

  return data ?? {};
}

export function createChartLayoutStore(): ChartLayoutStore {
  return {
    async listCharts() {
      const payload = await requestChartStorage({ action: "listCharts" });
      return payload.charts ?? [];
    },
    async getChart(id) {
      const payload = await requestChartStorage({ action: "getChart", id });
      return payload.chart ?? null;
    },
    async saveChart(chart) {
      const payload = await requestChartStorage({
        action: "saveChart",
        chart,
      });
      return payload.id ?? chart.id;
    },
    async removeChart(id) {
      await requestChartStorage({ action: "removeChart", id });
    },
    async listStudyTemplates() {
      const payload = await requestChartStorage({ action: "listStudyTemplates" });
      return payload.templates ?? [];
    },
    async getStudyTemplate(name) {
      const payload = await requestChartStorage({ action: "getStudyTemplate", name });
      return payload.content ?? null;
    },
    async saveStudyTemplate(name, content) {
      await requestChartStorage({ action: "saveStudyTemplate", name, content });
    },
    async removeStudyTemplate(name) {
      await requestChartStorage({ action: "removeStudyTemplate", name });
    },
    async listDrawingTemplates(toolName) {
      const payload = await requestChartStorage({ action: "listDrawingTemplates", toolName });
      return payload.templates ?? [];
    },
    async getDrawingTemplate(toolName, templateName) {
      const payload = await requestChartStorage({ action: "getDrawingTemplate", toolName, templateName });
      return payload.content ?? null;
    },
    async saveDrawingTemplate(toolName, templateName, content) {
      await requestChartStorage({ action: "saveDrawingTemplate", toolName, templateName, content });
    },
    async removeDrawingTemplate(toolName, templateName) {
      await requestChartStorage({ action: "removeDrawingTemplate", toolName, templateName });
    },
  };
}

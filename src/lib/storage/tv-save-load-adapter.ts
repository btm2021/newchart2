import type { ChartLayoutStore } from "@/lib/storage/chart-layout-store";

const LAST_CHART_LAYOUT_ID_KEY = "mint-last-chart-layout-id";

function readLastChartLayoutId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LAST_CHART_LAYOUT_ID_KEY) ?? "";
}

function writeLastChartLayoutId(id: string) {
  if (typeof window === "undefined" || !id) return;
  window.localStorage.setItem(LAST_CHART_LAYOUT_ID_KEY, id);
}

export function createTvSaveLoadAdapter(store: ChartLayoutStore) {
  return {
    getAllCharts: async () => {
      const charts = await store.listCharts();
      const lastChartLayoutId = readLastChartLayoutId();
      if (!lastChartLayoutId) return charts;
      return [...charts].sort((a, b) => {
        if (a.id === lastChartLayoutId) return -1;
        if (b.id === lastChartLayoutId) return 1;
        return b.timestamp - a.timestamp;
      });
    },
    removeChart: async (chartId: string) => store.removeChart(chartId),
    saveChart: async (chartData: { id?: string; name: string; symbol: string; resolution: string; content: string }) => {
      const id = await store.saveChart({
        id: chartData.id ?? "",
        name: chartData.name,
        symbol: chartData.symbol,
        resolution: chartData.resolution,
        content: chartData.content,
      });
      writeLastChartLayoutId(id);
      return id;
    },
    getChartContent: async (chartId: string) => {
      writeLastChartLayoutId(chartId);
      return (await store.getChart(chartId))?.content ?? null;
    },
    removeStudyTemplate: async (studyTemplateData: { name: string }) => store.removeStudyTemplate(studyTemplateData.name),
    getStudyTemplateContent: async (studyTemplateData: { name: string }) => store.getStudyTemplate(studyTemplateData.name),
    saveStudyTemplate: async (studyTemplateData: { name: string; content: string }) =>
      store.saveStudyTemplate(studyTemplateData.name, studyTemplateData.content),
    getAllStudyTemplates: async () => store.listStudyTemplates(),
    getDrawingTemplates: async (toolName: string) => store.listDrawingTemplates(toolName),
    loadDrawingTemplate: async (toolName: string, templateName: string) => store.getDrawingTemplate(toolName, templateName),
    removeDrawingTemplate: async (toolName: string, templateName: string) => store.removeDrawingTemplate(toolName, templateName),
    saveDrawingTemplate: async (toolName: string, templateName: string, content: string) =>
      store.saveDrawingTemplate(toolName, templateName, content),
  };
}

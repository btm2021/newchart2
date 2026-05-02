import type { ChartLayoutStore } from "@/lib/storage/chart-layout-store";

export function createTvSaveLoadAdapter(store: ChartLayoutStore) {
  return {
    getAllCharts: async () => store.listCharts(),
    removeChart: async (chartId: string) => store.removeChart(chartId),
    saveChart: async (chartData: { id?: string; name: string; symbol: string; resolution: string; content: string }) =>
      store.saveChart({
        id: chartData.id ?? "",
        name: chartData.name,
        symbol: chartData.symbol,
        resolution: chartData.resolution,
        content: chartData.content,
      }),
    getChartContent: async (chartId: string) => (await store.getChart(chartId))?.content ?? null,
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

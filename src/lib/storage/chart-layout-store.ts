import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { getFirebaseClient, getFirebaseWorkspaceId } from "@/lib/firebase/client";

type SavedChart = {
  id: string;
  name: string;
  symbol: string;
  resolution: string;
  content: string;
  timestamp: number;
};

type NamedTemplate = {
  name: string;
  content: string;
  timestamp: number;
  toolName?: string;
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

function requireDb() {
  const client = getFirebaseClient();
  if (!client) {
    throw new Error("Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* environment variables.");
  }
  return client.db;
}

function workspacePath() {
  return `chartWorkspaces/${getFirebaseWorkspaceId()}`;
}

function sanitizeId(value: string) {
  return encodeURIComponent(value);
}

function deserializeChart(data: Record<string, unknown> | undefined, id: string): SavedChart | null {
  if (!data) return null;
  return {
    id,
    name: String(data.name ?? ""),
    symbol: String(data.symbol ?? ""),
    resolution: String(data.resolution ?? ""),
    content: String(data.content ?? ""),
    timestamp: Number(data.timestamp ?? 0),
  };
}

function deserializeTemplate(data: Record<string, unknown> | undefined, fallbackName: string): NamedTemplate | null {
  if (!data) return null;
  return {
    name: String(data.name ?? fallbackName),
    content: String(data.content ?? ""),
    timestamp: Number(data.timestamp ?? 0),
    toolName: typeof data.toolName === "string" ? data.toolName : undefined,
  };
}

export function createChartLayoutStore(): ChartLayoutStore {
  return {
    async listCharts() {
      const db = requireDb();
      const chartsQuery = query(collection(db, workspacePath(), "charts"), orderBy("timestamp", "desc"));
      const snapshot = await getDocs(chartsQuery);
      return snapshot.docs.map((item) => {
        const chart = deserializeChart(item.data() as Record<string, unknown>, item.id);
        if (!chart) {
          return {
            id: item.id,
            name: "",
            symbol: "",
            resolution: "",
            timestamp: 0,
          };
        }
        const { content: _content, ...rest } = chart;
        return rest;
      });
    },
    async getChart(id) {
      const db = requireDb();
      const snapshot = await getDoc(doc(db, workspacePath(), "charts", id));
      return deserializeChart(snapshot.data() as Record<string, unknown> | undefined, snapshot.id);
    },
    async saveChart(chart) {
      const db = requireDb();
      const id = chart.id || `layout_${Date.now()}`;
      await setDoc(doc(db, workspacePath(), "charts", id), {
        id,
        name: chart.name,
        symbol: chart.symbol,
        resolution: chart.resolution,
        content: chart.content,
        timestamp: Date.now(),
      });
      return id;
    },
    async removeChart(id) {
      const db = requireDb();
      await deleteDoc(doc(db, workspacePath(), "charts", id));
    },
    async listStudyTemplates() {
      const db = requireDb();
      const snapshot = await getDocs(query(collection(db, workspacePath(), "studyTemplates"), orderBy("name", "asc")));
      return snapshot.docs.map((item) => ({ name: String(item.data().name ?? item.id) }));
    },
    async getStudyTemplate(name) {
      const db = requireDb();
      const snapshot = await getDoc(doc(db, workspacePath(), "studyTemplates", sanitizeId(name)));
      const template = deserializeTemplate(snapshot.data() as Record<string, unknown> | undefined, name);
      return template?.content ?? null;
    },
    async saveStudyTemplate(name, content) {
      const db = requireDb();
      await setDoc(doc(db, workspacePath(), "studyTemplates", sanitizeId(name)), {
        name,
        content,
        timestamp: Date.now(),
      });
    },
    async removeStudyTemplate(name) {
      const db = requireDb();
      await deleteDoc(doc(db, workspacePath(), "studyTemplates", sanitizeId(name)));
    },
    async listDrawingTemplates(toolName) {
      const db = requireDb();
      const snapshot = await getDocs(query(collection(db, workspacePath(), "drawingTemplates"), orderBy("name", "asc")));
      return snapshot.docs
        .map((item) => deserializeTemplate(item.data() as Record<string, unknown>, item.id))
        .filter((item): item is NamedTemplate => Boolean(item && item.toolName === toolName))
        .map((item) => ({ name: item.name }));
    },
    async getDrawingTemplate(toolName, templateName) {
      const db = requireDb();
      const key = `${toolName}::${templateName}`;
      const snapshot = await getDoc(doc(db, workspacePath(), "drawingTemplates", sanitizeId(key)));
      const template = deserializeTemplate(snapshot.data() as Record<string, unknown> | undefined, templateName);
      if (!template || template.toolName !== toolName) {
        return null;
      }
      return template.content;
    },
    async saveDrawingTemplate(toolName, templateName, content) {
      const db = requireDb();
      const key = `${toolName}::${templateName}`;
      await setDoc(doc(db, workspacePath(), "drawingTemplates", sanitizeId(key)), {
        name: templateName,
        toolName,
        content,
        timestamp: Date.now(),
      });
    },
    async removeDrawingTemplate(toolName, templateName) {
      const db = requireDb();
      const key = `${toolName}::${templateName}`;
      await deleteDoc(doc(db, workspacePath(), "drawingTemplates", sanitizeId(key)));
    },
  };
}

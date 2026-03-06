import type { Express } from "express";
import type { Server } from "http";

export async function registerRoutes(httpServer: Server, app: Express) {
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      message: "Matcha On Ice - Sistema de Gestão de Ingressos",
      phase: "Marco T0 - Validação Técnica",
    });
  });

  app.get("/webhook/stripe", (_req, res) => {
    res.json({
      status: "ok",
      message: "Webhook endpoint ativo. Use POST para enviar eventos.",
    });
  });
}

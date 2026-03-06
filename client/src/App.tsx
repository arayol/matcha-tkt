import { useState } from "react";
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
  import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { CheckCircle2, Circle, AlertCircle, ExternalLink, Copy, Check, Rocket } from "lucide-react";

  export default function App() {
    const [copiedWebhook, setCopiedWebhook] = useState(false);
    
    const webhookUrl = `${window.location.origin}/webhook/stripe`;
    
    const copyToClipboard = (text: string, setter: (value: boolean) => void) => {
      navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-gray-900 mb-3">
              🍵❄️ Matcha On Ice
            </h1>
            <p className="text-2xl text-gray-600 mb-4">
              Sistema de Gestão de Ingressos para Eventos de Fitness
            </p>
            <div className="flex items-center justify-center gap-3">
              <Badge variant="outline" className="text-lg px-6 py-2 bg-white shadow-sm">
                Marco T0 - Validação Técnica
              </Badge>
              <Badge className="text-lg px-6 py-2 bg-green-600 text-white">
                <Rocket className="h-4 w-4 mr-2" />
                PRODUÇÃO
              </Badge>
            </div>
          </div>

          {/* Production Status */}
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <AlertTitle className="text-green-900">✅ Integração Stripe Configurada!</AlertTitle>
            <AlertDescription className="text-green-800">
              A integração oficial do Stripe está ativa via Replit. Suas credenciais estão seguras e gerenciadas automaticamente.
            </AlertDescription>
          </Alert>

          {/* Webhook Configuration */}
          <Card className="border-2 shadow-lg border-blue-200">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50">
              <CardTitle className="text-2xl">🔗 Configurar Webhook do Stripe (PRODUÇÃO)</CardTitle>
              <CardDescription className="text-base">
                Configure o webhook para receber notificações de vendas em tempo real
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {/* Step 1 */}
              <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">Adicionar Webhook Secret</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    No painel do Replit, adicione o <strong>STRIPE_WEBHOOK_SECRET</strong>:
                  </p>
                  <div className="bg-white p-3 rounded border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Nome:</span>
                      <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">STRIPE_WEBHOOK_SECRET</code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Valor:</span>
                      <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">whsec_...</code>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    ⚠️ Você receberá este valor no passo 2 após criar o webhook no Stripe
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">Criar Endpoint no Stripe</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    No Stripe Dashboard, adicione este endpoint:
                  </p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium mb-2">URL do Endpoint (PRODUÇÃO):</p>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={webhookUrl}
                          readOnly
                          className="flex-1 px-3 py-2 bg-white border-2 border-blue-300 rounded text-sm font-mono"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(webhookUrl, setCopiedWebhook)}
                        >
                          {copiedWebhook ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1">Evento a selecionar:</p>
                      <code className="bg-white px-3 py-2 rounded border-2 border-blue-300 text-sm block">
                        checkout.session.completed
                      </code>
                    </div>
                    <div className="bg-yellow-50 border-2 border-yellow-200 p-3 rounded">
                      <p className="text-sm font-medium text-yellow-900 mb-1">⚠️ Importante:</p>
                      <p className="text-xs text-yellow-800">
                        Após criar o webhook, copie o <strong>Signing secret</strong> (whsec_...) e adicione como STRIPE_WEBHOOK_SECRET nas Secrets do Replit
                      </p>
                    </div>
                    <Button 
                      className="w-full bg-blue-600 hover:bg-blue-700" 
                      onClick={() => window.open('https://dashboard.stripe.com/webhooks', '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Abrir Stripe Dashboard (Produção)
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Product Setup */}
          <Card className="border-2 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
              <CardTitle className="text-2xl">🎫 Configurar Produtos no Stripe</CardTitle>
              <CardDescription className="text-base">
                Configure seus produtos de ingresso seguindo o padrão
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="bg-white p-4 rounded border-2 border-green-200">
                <p className="text-sm font-medium mb-2">📋 Padrão de Nomenclatura:</p>
                <code className="text-sm font-mono block mb-3 bg-gray-100 p-3 rounded">
                  [Data], [Hora] - [Tipo] Event Ticket
                </code>
                <p className="text-sm font-medium mb-2">✅ Exemplos Corretos:</p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <code className="text-green-700">Feb 26th, 6 PM - Members Event Ticket</code>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <code className="text-green-700">Mar 15th, 7:30 PM - General Event Ticket</code>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <code className="text-green-700">Apr 1st, 5 PM - VIP Event Ticket</code>
                  </li>
                </ul>
              </div>
              <div className="bg-blue-50 p-3 rounded border border-blue-200">
                <p className="text-sm font-medium text-blue-900 mb-2">🏷️ Tipos de Ingresso Suportados:</p>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• <strong>Members</strong> - Com aula de fitness incluída</li>
                  <li>• <strong>General</strong> - Entrada geral sem aula</li>
                  <li>• <strong>VIP</strong> - Acesso premium com extras</li>
                </ul>
              </div>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => window.open('https://dashboard.stripe.com/products', '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Gerenciar Produtos no Stripe
              </Button>
            </CardContent>
          </Card>

          {/* Success Criteria */}
          <Card className="border-2 border-green-200 shadow-lg">
            <CardHeader className="bg-green-50">
              <CardTitle className="text-xl text-green-900">🎯 Critério de Sucesso - Marco T0</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <AlertTitle className="text-green-900">Validação em Produção:</AlertTitle>
                <AlertDescription className="mt-3">
                  <ul className="space-y-2 text-green-800">
                    <li className="flex items-start gap-2">
                      <Circle className="h-4 w-4 mt-1 flex-shrink-0" />
                      <span>Webhook configurado e recebendo eventos do Stripe</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Circle className="h-4 w-4 mt-1 flex-shrink-0" />
                      <span>Line_items expandidos e dados do produto extraídos</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Circle className="h-4 w-4 mt-1 flex-shrink-0" />
                      <span>Dados do cliente (nome, email) disponíveis</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Circle className="h-4 w-4 mt-1 flex-shrink-0" />
                      <span>Padrão de nomenclatura validado (data, hora, tipo)</span>
                    </li>
                  </ul>
                  <p className="mt-4 text-sm font-medium text-green-900">
                    ✅ Após validar, estaremos prontos para o Marco M1 (Backend Core)!
                  </p>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Monitoring */}
          <Card>
            <CardHeader>
              <CardTitle>📊 Monitoramento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-600">
                Os webhooks são registrados no console do Replit. Verifique os logs para acompanhar:
              </p>
              <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-xs space-y-1">
                <div>🔔 WEBHOOK DO STRIPE RECEBIDO</div>
                <div>✅ Assinatura validada</div>
                <div>💳 COMPRA CONCLUÍDA</div>
                <div>📧 Cliente: email@exemplo.com</div>
                <div>🎫 Data: Feb 26th | Hora: 6 PM | Tipo: Members</div>
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center text-sm text-gray-500 py-6">
            <p className="mb-2">Matcha On Ice © 2026</p>
            <p className="text-xs">Sistema em Produção • San Diego, CA</p>
          </div>
        </div>
      </div>
    );
  }
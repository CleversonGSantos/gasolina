const functions = require("firebase-functions");
const {GoogleAuth} = require("google-auth-library");
const {DiscussServiceClient} = require("@google-ai/generativelanguage");

// Inicialize os clientes da API fora do escopo da função para reutilização
const MODEL_NAME = "models/gemini-2.5-flash-preview-05-20";
// Carrega a chave da API de forma segura a partir das variáveis de ambiente
const API_KEY = functions.config().gemini.key;

const client = new DiscussServiceClient({
  authClient: new GoogleAuth().fromAPIKey(API_KEY),
});

exports.getGasPriceAnalysis = functions.https.onCall(async (data, context) => {
  // Verifica se os dados necessários (dollar, brent, estimatedPrice) foram recebidos
  if (!data.dollar || !data.brent || !data.estimatedPrice) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "A função precisa dos parâmetros 'dollar', 'brent' e 'estimatedPrice'.",
    );
  }

  const {dollar, brent, estimatedPrice} = data;

  // Monta o prompt para a API Gemini
  const systemPrompt = "Aja como um analista financeiro brasileiro especializado em commodities e energia. Use a estrutura de composição de preço média (aprox. 41% impostos, 34% Petrobras/Refino, 15% Etanol, 10% Distribuição) para **justificar o preço final fornecido**. Apresente a estimativa clara do preço final formatada como **Gasolina Estimada: R$ X,XX/Litro** seguida pela justificativa econômica em um único parágrafo conciso. A justificativa deve citar explicitamente a influência do câmbio, do Brent e da carga tributária. Use a vírgula como separador decimal no preço.";
  const userQuery = `O preço final da gasolina ao consumidor (R$/Litro) é de R$${estimatedPrice.toFixed(2).replace(".", ",")}. Justifique este preço, considerando que o Dólar está em R$${dollar} e o Petróleo Brent está em $${brent}. Use a estrutura de custos brasileira e as políticas fiscais atuais (PIS/Cofins, ICMS) para sua análise.`;
  const prompt = `${systemPrompt}\n\n${userQuery}`;

  try {
    // Chama a API Gemini de forma segura a partir do backend
    const result = await client.generateMessage({
      model: MODEL_NAME,
      prompt: {
        messages: [{content: prompt}],
      },
    });

    // Extrai o texto da resposta
    const analysisText = result[0].candidates[0].content;

    if (!analysisText) {
      throw new functions.https.HttpsError(
        "internal",
        "A API Gemini não retornou um texto de análise.",
      );
    }

    // Retorna o resultado para o cliente (navegador)
    return {analysis: analysisText};
  } catch (error) {
    console.error("Erro ao chamar a API Gemini:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Falha ao se comunicar com a API Gemini.",
      error.message,
    );
  }
});

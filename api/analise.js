const textToHtml = (s) => s; // placeholder if needed

module.exports = async function (req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { dollar, brent, estimatedPrice } = req.body || {};
    if (typeof dollar === 'undefined' || typeof brent === 'undefined' || typeof estimatedPrice === 'undefined') {
      return res.status(400).json({ error: "Missing parameters: dollar, brent and estimatedPrice are required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured in environment' });
    }

    const systemPrompt = "Aja como um analista financeiro brasileiro especializado em commodities e energia. Use a estrutura de composição de preço média (aprox. 41% impostos, 34% Petrobras/Refino, 15% Etanol, 10% Distribuição) para **justificar o preço final fornecido**. Apresente a estimativa clara do preço final formatada como **Gasolina Estimada: R$ X,XX/Litro** seguida pela justificativa econômica em um único parágrafo conciso. A justificativa deve citar explicitamente a influência do câmbio, do Brent e da carga tributária. Use a vírgula como separador decimal no preço.";

    const userQuery = `O preço final da gasolina ao consumidor (R$/Litro) é de R$${estimatedPrice.toFixed(2).replace('.', ',')}. Justifique este preço, considerando que o Dólar está em R$${dollar} e o Petróleo Brent está em $${brent}. Use a estrutura de custos brasileira e as políticas fiscais atuais (PIS/Cofins, ICMS) para sua análise.`;

    const payload = {
      contents: [{ parts: [{ text: userQuery }] }],
      tools: [{ "google_search": {} }],
      systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return res.status(response.status).json({ error: `Generative API error: ${response.status} ${response.statusText}`, details: text });
    }

    const result = await response.json();

    // Tenta extrair texto e fontes de diferentes formatos de resposta
    let analysis = null;
    let sources = [];

    // Estrutura esperada (conforme client): result.candidates[0].content.parts[0].text
    const candidate = result.candidates?.[0];
    if (candidate && candidate.content && Array.isArray(candidate.content.parts) && candidate.content.parts[0]) {
      analysis = candidate.content.parts[0].text;
    }

    // Alguns endpoints retornam em result[0].candidates etc
    if (!analysis && Array.isArray(result) && result[0]?.candidates?.[0]?.content) {
      const alt = result[0].candidates[0].content;
      if (typeof alt === 'string') analysis = alt;
      else if (alt.parts && alt.parts[0]) analysis = alt.parts[0].text;
    }

    // Extrai groundingAttributions se existirem
    const grounding = candidate?.groundingMetadata ?? result?.groundingMetadata ?? result[0]?.groundingMetadata;
    if (grounding && grounding.groundingAttributions) {
      sources = grounding.groundingAttributions
        .map(a => ({ uri: a.web?.uri, title: a.web?.title }))
        .filter(s => s.uri && s.title);
    }

    if (!analysis) {
      // fallback: uma justificativa simples gerada localmente
      analysis = `Gasolina Estimada: R$ ${estimatedPrice.toFixed(2).replace('.', ',')}/Litro. Esta estimativa considera o câmbio em R$${dollar}, o Brent a US$${brent} e uma estrutura média de custos e impostos no Brasil.`;
    }

    return res.json({ analysis, sources });
  } catch (err) {
    console.error('api/analise error:', err);
    return res.status(500).json({ error: 'Server error', details: String(err) });
  }
};

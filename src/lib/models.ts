export interface LLMModelConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function getAvailableModels(): LLMModelConfig[] {
  const models: LLMModelConfig[] = [];

  const defaultApiKey = process.env.LLM_API_KEY;
  const defaultBaseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const defaultModel = process.env.LLM_MODEL || 'gpt-4-turbo';

  if (defaultApiKey) {
    models.push({
      id: 'default',
      name: defaultModel,
      apiKey: defaultApiKey,
      baseUrl: defaultBaseUrl,
      model: defaultModel,
    });
  }

  for (let i = 2; i <= 10; i++) {
    const name = process.env[`LLM_MODEL_${i}_NAME`];
    const key = process.env[`LLM_MODEL_${i}_KEY`];
    const url = process.env[`LLM_MODEL_${i}_URL`];
    const model = process.env[`LLM_MODEL_${i}_MODEL`];

    if (key && model) {
      models.push({
        id: `model_${i}`,
        name: name || model,
        apiKey: key,
        baseUrl: url || defaultBaseUrl,
        model,
      });
    }
  }

  return models;
}

export function getModelById(modelId: string): LLMModelConfig | undefined {
  return getAvailableModels().find(m => m.id === modelId);
}

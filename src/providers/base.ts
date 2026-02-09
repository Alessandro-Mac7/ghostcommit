export interface AIProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getTokenBudget(): number;
  generate(prompt: string, systemPrompt: string): Promise<string>;
  generateStream(
    prompt: string,
    systemPrompt: string,
  ): AsyncGenerator<string, void, unknown>;
}

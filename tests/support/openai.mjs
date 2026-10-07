// Recorded OpenAI wire shapes for offline provider-boundary tests.
export const openaiText = text => ({ status: "completed", output: [
  { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
] });
export const openaiDelta = delta => ({ type: "response.output_text.delta", delta });
export const openaiCompleted = () => ({ type: "response.completed", response: {
  status: "completed", usage: { input_tokens: 9, output_tokens: 20 },
} });
export const openaiCompletedSse = `data: ${JSON.stringify(openaiCompleted())}\n\n`;

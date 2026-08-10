import { APP_CONFIG } from "../config";
import { AppError } from "../http";
import type { SearchHit } from "../knowledge/types";

const SYSTEM_PROMPT = "你是个人知识库助手。只能依据给定资料回答；不得编造。用中文简洁回答，事实后标注 [1] 形式的来源编号。资料不足时明确说明。";
const NO_SOURCES_ANSWER = "知识库中没有足够依据回答这个问题。请先添加相关笔记。";
const EMPTY_ANSWER = "模型没有返回文本。";

export interface AnswerAiInput {
  messages: Array<{ role: "system" | "user"; content: string }>;
  max_tokens: number;
}

export interface AnswerAi {
  run(model: string, input: AnswerAiInput): Promise<unknown>;
}

export interface AnswerResult {
  answer: string;
  sources: SearchHit[];
}

export class AnswerService {
  constructor(private readonly ai: AnswerAi) {}

  async answer(question: string, sources: SearchHit[]): Promise<AnswerResult> {
    const normalizedQuestion = validateQuestion(question);
    if (!sources.length) return { answer: NO_SOURCES_ANSWER, sources };

    try {
      const result = await this.ai.run(APP_CONFIG.model, {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `问题：${normalizedQuestion}\n\n资料：\n${buildContext(sources)}` },
        ],
        max_tokens: APP_CONFIG.maxAnswerTokens,
      });
      return { answer: normalizeAnswer(result), sources };
    } catch {
      throw new AppError("AI_UNAVAILABLE", "AI service is temporarily unavailable", 503, true);
    }
  }
}

function validateQuestion(question: unknown): string {
  if (typeof question !== "string" || !question.trim()) {
    throw new AppError("QUESTION_INVALID", "Question is required", 400);
  }
  const normalized = question.trim();
  if (normalized.length > APP_CONFIG.maxQuestionChars) {
    throw new AppError("QUESTION_TOO_LONG", "Question exceeds 4,000 characters", 413);
  }
  return normalized;
}

function buildContext(sources: SearchHit[]): string {
  let context = "";
  for (const [index, source] of sources.entries()) {
    const separator = context ? "\n\n" : "";
    const label = `[${index + 1}] ${source.title}\n`;
    const remaining = APP_CONFIG.maxContextChars - context.length - separator.length - label.length;
    if (remaining < 0) break;
    const excerpt = source.excerpt.slice(0, Math.min(APP_CONFIG.maxSourceExcerptChars, remaining));
    context += `${separator}${label}${excerpt}`;
  }
  return context;
}

function normalizeAnswer(result: unknown): string {
  const answer = typeof result === "string"
    ? result
    : isResponseResult(result)
      ? result.response
      : "";
  return answer.trim() || EMPTY_ANSWER;
}

function isResponseResult(value: unknown): value is { response: string } {
  return typeof value === "object"
    && value !== null
    && "response" in value
    && typeof value.response === "string";
}

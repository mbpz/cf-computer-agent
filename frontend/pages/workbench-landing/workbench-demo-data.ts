import type { FrontendLocale } from "../../lib/i18n";

export interface DemoSource {
  id: string;
  title: string;
  paragraphs: readonly { id: string; text: string }[];
}

export interface DemoCitation { id: string; sourceId: string; paragraphId: string }

export interface DemoContent {
  sources: readonly DemoSource[];
  question: string;
  answer: string;
  citations: readonly DemoCitation[];
  taskTitle: string;
  notification: string;
  discussion: string;
}

// Handwritten, fictional examples. IDs are independent of translated text.
const citations: readonly DemoCitation[] = [
  { id: "cite-filing", sourceId: "filing-guide", paragraphId: "p2" },
  { id: "cite-review", sourceId: "weekly-review", paragraphId: "p2" },
];

const content: Record<FrontendLocale, DemoContent> = {
  en: {
    sources: [
      {
        id: "filing-guide",
        title: "Project filing guide",
        paragraphs: [
          { id: "p1", text: "Collect scattered project notes, links and reading excerpts in one place. Give each item a clear title so it can be found again." },
          { id: "p2", text: "Keep the original source with each item. Read the material and summarize its key points, separating confirmed information from questions that still need checking." },
          { id: "p3", text: "Review the summary before publishing it to the knowledge library. Keep the source text available so later readers can check its context." },
        ],
      },
      {
        id: "weekly-review",
        title: "Weekly review method",
        paragraphs: [
          { id: "p1", text: "During a weekly review, revisit the project material you collected. Group related notes and identify questions that remain open." },
          { id: "p2", text: "Use the sources and your reading summary to decide the next step. Then manually create a to-do with a clear outcome; an answer does not automatically create or execute a task." },
          { id: "p3", text: "Track that task on the board and mark it done after completing the work. Keep relevant notifications and discussion attached to the same task." },
        ],
      },
    ],
    question: "How can scattered project material become a next action?",
    answer: "First, keep the original sources with your project material. Next, read and summarize the key points, checking the source paragraphs when needed. Finally, decide the next step and manually create a to-do. This example answer does not automatically create or execute a task.",
    citations,
    taskTitle: "Organize this week's project material",
    notification: "Example notification for “Organize this week's project material”: review the source notes before moving the task to Done.",
    discussion: "Example discussion for “Organize this week's project material”: keep the original sources with the summary so the next action can be checked against them.",
  },
  "zh-CN": {
    sources: [
      {
        id: "filing-guide",
        title: "项目资料整理约定",
        paragraphs: [
          { id: "p1", text: "把零散的项目笔记、链接和阅读摘录收集到同一处。为每份资料写下清楚的标题，方便之后重新找到。" },
          { id: "p2", text: "每份资料都保留原始来源。阅读正文后归纳要点，将已经确认的信息与仍需核对的问题分开记录。" },
          { id: "p3", text: "归纳内容经过审核后再发布到知识库，同时保留来源正文，让之后的阅读者能够核对上下文。" },
        ],
      },
      {
        id: "weekly-review",
        title: "每周回顾方法",
        paragraphs: [
          { id: "p1", text: "每周回顾时，重新阅读收集的项目资料，把相关笔记放在一起，找出尚未解决的问题。" },
          { id: "p2", text: "结合来源和阅读归纳确定下一步，再人工创建一条结果清楚的待办。回答不会自动创建任务，也不会自动执行任务。" },
          { id: "p3", text: "在看板上跟进这张任务卡，实际完成工作后再标记完成。相关通知和讨论保留在同一任务上下文中。" },
        ],
      },
    ],
    question: "如何把零散的项目资料变成下一步行动？",
    answer: "先为项目资料保留原始来源，再阅读正文并归纳要点，需要时通过引用核对原文段落。最后确定下一步，由你人工创建待办。这条示例回答不会自动创建或执行任务。",
    citations,
    taskTitle: "整理本周项目资料",
    notification: "「整理本周项目资料」的示例通知：移至完成前，请核对来源笔记。",
    discussion: "「整理本周项目资料」的示例讨论：请将原始来源与归纳内容一起保留，方便核对下一步行动的依据。",
  },
};

export function demoContent(locale: FrontendLocale): DemoContent {
  return content[locale];
}
